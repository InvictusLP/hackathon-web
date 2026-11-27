'use client';

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import type { DataProvider, IndicatorHandle, OHLCV, PriceAxisTickContext, Vela } from '@luxalgo/vela';
import type { VelaWorkspace } from '@luxalgo/vela/workspace';
import type { LogicalRange } from 'lightweight-charts';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rangeScale, RANGE_SCALE, scaleInputs } from '@/components/app/vela/range-scale';
import { RangeBand, scaleFrom, type Scale } from '@/components/app/vela/range-band';
import { ChartMarks, type PositionMark } from '@/components/app/vela/chart-marks';
import {
  cleanCandles,
  computeMinSpan,
  mergeCandles,
  resampleCandles,
  isV2SupportedTimeframe,
  isPoolMatch,
  mapV2Candles,
  type Candle,
  type V2CandleDto,
} from '../../lib/candles';

export {
  cleanCandles,
  computeMinSpan,
  mergeCandles,
  resampleCandles,
  isV2SupportedTimeframe,
  isPoolMatch,
  mapV2Candles,
  type Candle,
  type V2CandleDto,
};

type SyncListener = (range: LogicalRange | null, sourceId: string) => void;
const syncGroups = new Map<string, Set<SyncListener>>();

export const registerChartSync = (
  groupId: string,
  listener: SyncListener,
): (() => void) => {
  let set = syncGroups.get(groupId);
  if (!set) {
    set = new Set();
    syncGroups.set(groupId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) {
      syncGroups.delete(groupId);
    }
  };
};

export const broadcastChartRange = (
  groupId: string,
  range: LogicalRange | null,
  sourceId: string,
): void => {
  const set = syncGroups.get(groupId);
  if (!set) return;
  for (const listener of set) {
    listener(range, sourceId);
  }
};

/**
 * Resolves a CSS custom property to an rgb() string that Vela's canvas renderer can parse.
 */
const resolveColour = (token: string, fallback: string): string => {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (!raw) return fallback;
  if (/^(#|rgb|hsl)/i.test(raw)) return raw;

  const probe = document.createElement('span');
  probe.style.color = raw;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return /^rgb/i.test(resolved) ? resolved : fallback;
};

/** Clean financial price formatter without scientific notation. */
export const format = (p: number): string => {
  if (!Number.isFinite(p) || p <= 0) return '0.00';
  const abs = Math.abs(p);
  if (abs >= 1000) {
    return abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (abs >= 0.01) {
    return abs.toFixed(4);
  }
  const s = abs.toFixed(18);
  const m = s.match(/^0\.(0{3,})(\d+)/);
  if (m && m[1] && m[2]) {
    const zeroCount = m[1].length;
    const digits = m[2].slice(0, 4);
    const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
    const subStr = String(zeroCount)
      .split('')
      .map((d) => subscripts[Number(d)] ?? d)
      .join('');
    return `0.0${subStr}${digits}`;
  }
  if (abs >= 0.0001) {
    return abs.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  }
  if (abs >= 1e-8) {
    return abs.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  }
  const fixed = abs.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
  return fixed !== '0' ? fixed : abs.toPrecision(4);
};

export const formatPrice = (p: number, _quote?: string): string => `$${format(p)}`;

/** Market caps run to millions/billions, formatted with dollar sign and precision. */
export const formatMcap = (p: number): string => {
  if (!Number.isFinite(p) || p === 0) return '$0';
  const sign = p < 0 ? '-' : '';
  const abs = Math.abs(p);
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  return `${sign}$${abs.toPrecision(4)}`;
};

export const POSITION_COLORS = [
  '#06b6d4',
  '#8b5cf6',
  '#f59e0b',
  '#3b82f6',
  '#d946ef',
  '#f97316',
  '#6366f1',
  '#ec4899',
];

export const hexToRgba = (color: string, alpha: number): string => {
  if (!color) return `rgba(6, 182, 212, ${alpha})`;
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  if (color.startsWith('rgb')) {
    const match = color.match(/\d+/g);
    if (match && match.length >= 3) {
      return `rgba(${match[0]}, ${match[1]}, ${match[2]}, ${alpha})`;
    }
  }
  return color;
};

export const TIMEFRAMES = {
  '1s': 1,
  '15s': 15,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
} as const;

export type TimeframeKey = keyof typeof TIMEFRAMES;

const VELA_TIMEFRAME: Record<TimeframeKey, string> = {
  '1s': '1S',
  '15s': '15S',
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
};

const INTERVAL_OF_VELA = Object.fromEntries(
  Object.entries(VELA_TIMEFRAME).map(([k, v]) => [v, k]),
) as Record<string, TimeframeKey>;

export const aggregateCandleTick = (
  previous: Candle | null,
  livePrice: number,
  timestampSeconds: number,
  timeframeSeconds: number,
): { bar: Candle; isNew: boolean } | null => {
  if (
    !Number.isFinite(livePrice) ||
    livePrice <= 0 ||
    timeframeSeconds <= 0 ||
    !Number.isFinite(timestampSeconds) ||
    timestampSeconds <= 0
  ) {
    return null;
  }
  const bucket = Math.floor(timestampSeconds / timeframeSeconds) * timeframeSeconds;

  if (!previous) {
    return {
      bar: { time: bucket, open: livePrice, high: livePrice, low: livePrice, close: livePrice, volume: 0, trades: 1 },
      isNew: true,
    };
  }
  if (bucket < previous.time) return null;
  if (bucket > previous.time) {
    return {
      bar: {
        time: bucket,
        open: livePrice,
        high: livePrice,
        low: livePrice,
        close: livePrice,
        volume: 0,
        trades: 1,
        ...(previous.source ? { source: previous.source } : {}),
        ...(previous.currency ? { currency: previous.currency } : {}),
      },
      isNew: true,
    };
  }
  return {
    bar: {
      ...previous,
      high: Math.max(previous.high, livePrice),
      low: Math.min(previous.low, livePrice),
      close: livePrice,
      ...(previous.trades !== undefined ? { trades: previous.trades + 1 } : {}),
    },
    isNew: false,
  };
};

export interface AutoscalePriceRange {
  minValue: number;
  maxValue: number;
}

export interface AutoscaleOptions {
  rangeLow?: number;
  rangeHigh?: number;
  owned?: ChartRange | ChartRange[] | null;
  datasetLo?: number;
  datasetHi?: number;
  minSpan?: number;
  fallbackPrice?: number;
  includeRangeLines?: boolean;
}

export const calculateAutoscalePriceRange = (
  originalRange: AutoscalePriceRange | null | undefined,
  optsOrPrice: AutoscaleOptions | number | null | undefined,
  minSpanParam?: number,
): AutoscalePriceRange | null => {
  const opts: AutoscaleOptions =
    typeof optsOrPrice === 'number' || optsOrPrice === null || optsOrPrice === undefined
      ? { fallbackPrice: optsOrPrice ?? 0, minSpan: minSpanParam ?? 0 }
      : optsOrPrice;

  const {
    rangeLow = 0,
    rangeHigh = 0,
    owned = null,
    datasetLo = 0,
    datasetHi = 0,
    minSpan = 0,
    fallbackPrice = 0,
    includeRangeLines = false,
  } = opts;

  let minVal: number;
  let maxVal: number;

  if (originalRange && Number.isFinite(originalRange.minValue) && Number.isFinite(originalRange.maxValue)) {
    minVal = originalRange.minValue;
    maxVal = originalRange.maxValue;
  } else if (fallbackPrice > 0) {
    minVal = fallbackPrice;
    maxVal = fallbackPrice;
  } else if (datasetLo > 0 && datasetHi > 0) {
    minVal = datasetLo;
    maxVal = datasetHi;
  } else {
    return null;
  }

  if (includeRangeLines) {
    if (rangeLow > 0 && rangeHigh > 0) {
      minVal = Math.min(minVal, Math.min(rangeLow, rangeHigh));
      maxVal = Math.max(maxVal, Math.max(rangeLow, rangeHigh));
    }
    if (owned) {
      const list = Array.isArray(owned) ? owned : [owned];
      for (const r of list) {
        if (r && r.low > 0 && r.high > 0) {
          minVal = Math.min(minVal, Math.min(r.low, r.high));
          maxVal = Math.max(maxVal, Math.max(r.low, r.high));
        }
      }
    }
  }

  const currentSpan = maxVal - minVal;
  const mid = (maxVal + minVal) / 2;
  const effectiveMinSpan = Math.max(minSpan, mid > 0 ? mid * 0.005 : 0, 1e-8);

  if (currentSpan < effectiveMinSpan) {
    minVal = Math.max(0, mid - effectiveMinSpan / 2);
    maxVal = mid + effectiveMinSpan / 2;
  }

  return { minValue: minVal, maxValue: maxVal };
};

export interface ChartRange {
  low: number;
  high: number;
  color?: string;
  label?: string;
}

export interface CandleChartProps {
  candles: Candle[];
  rangeLow: number;
  rangeHigh: number;
  height?: number;
  className?: string;
  loading?: boolean;
  displayUnit?: 'price' | 'mcap';
  onDisplayUnitChange?: (unit: 'price' | 'mcap') => void;
  mcapMultiplier?: number | null;
  compact?: boolean;
  quoteSymbol?: string;
  livePrice?: number;
  liveTime?: number;
  owned?: ChartRange | ChartRange[] | null;
  activeTimeframe?: TimeframeKey;
  onTimeframeChange?: (tf: TimeframeKey) => void;
  syncGroupId?: string;
  onVisibleLogicalRangeChange?: (range: LogicalRange | null) => void;
  onDragEdge?: (edge: 'min' | 'max', price: number) => void;
  onDragCommit?: (edge: 'min' | 'max', price: number) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

declare global {
  var __velaPriceLabel: ((value: number) => string | null) | undefined;
}

const UNIT_ACTION = 'invictus-unit';
const SETTINGS_ACTION = 'invictus-settings';
const SCREEN_ACTION = 'invictus-fullscreen';

const ICONS = {
  indicators:
    '<text x="8" y="12" text-anchor="middle" font-family="Georgia, \'Times New Roman\', serif" font-style="italic" font-size="12" fill="currentColor" stroke="none">fx</text>',
  unit: '<path d="M13.2 6.2A5.4 5.4 0 0 0 3.4 4.4"/><path d="M3.1 1.9v2.7h2.7"/><path d="M2.8 9.8a5.4 5.4 0 0 0 9.8 1.8"/><path d="M12.9 14.1v-2.7h-2.7"/><path d="M9.2 6.4c-.3-.5-.8-.7-1.3-.7-.7 0-1.3.4-1.3 1 0 1.4 2.7.7 2.7 2.1 0 .6-.6 1-1.4 1-.6 0-1.1-.3-1.4-.7M7.9 5v.7M7.9 9.8v.7"/>',
  expand: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>',
  shrink: '<path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5"/>',
};

const iconOf = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

let registered = false;

const chartTheme = (fontFamily: string) => ({
  background: resolveColour('--card', '#141416'),
  textColor: resolveColour('--muted-foreground', '#9ba1a6'),
  gridColor: 'rgba(255,255,255,0.05)',
  borderColor: resolveColour('--border', 'rgba(255,255,255,0.08)'),
  upColor: resolveColour('--up', '#22c55e'),
  downColor: resolveColour('--down', '#ef4444'),
  fontFamily,
});

const toVelaBars = (candles: Candle[], mult: number): OHLCV[] =>
  cleanCandles(candles).map((c) => ({
    time: c.time * 1000,
    open: c.open * mult,
    high: c.high * mult,
    low: c.low * mult,
    close: c.close * mult,
    volume: c.volume ?? 0,
  }));

/**
 * Vela-powered candlestick chart (`@luxalgo/vela` 0.8.3) with range band,
 * open-position overlays, Price/MCap unit toggle, and live bar updates.
 */
export const CandleChart = ({
  candles,
  rangeLow,
  rangeHigh,
  height,
  className,
  loading = false,
  displayUnit,
  onDisplayUnitChange,
  mcapMultiplier = null,
  compact = false,
  quoteSymbol = 'USD',
  livePrice = 0,
  liveTime,
  owned = null,
  activeTimeframe = '5m',
  onTimeframeChange,
  onDragEdge,
  onDragCommit,
  onRefresh,
  refreshing = false,
}: CandleChartProps) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<VelaWorkspace | null>(null);
  const scaleRef = useRef<IndicatorHandle | null>(null);
  const streamRef = useRef<{ timeframe: string; push: (bar: OHLCV) => void } | null>(null);
  const lastBarRef = useRef<Candle | null>(null);

  const [internalUnit, setInternalUnit] = useState<'price' | 'mcap'>(compact ? 'mcap' : 'price');
  const activeUnit = displayUnit ?? internalUnit;
  const isMcap = activeUnit === 'mcap' && mcapMultiplier !== null && mcapMultiplier > 0;
  const mult = isMcap ? mcapMultiplier! : 1;

  const [chart, setChart] = useState<Vela | null>(null);
  const [scaleOf, setScaleOf] = useState<Scale | null>(null);
  const [dragging, setDragging] = useState(false);
  const [full, setFull] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const [legendFoot, setLegendFoot] = useState<{ top: number; left: number } | null>(null);

  const bars = useMemo(() => toVelaBars(candles, mult), [candles, mult]);
  const barsRef = useRef<OHLCV[]>(bars);
  barsRef.current = bars;

  const multRef = useRef(mult);
  multRef.current = mult;
  const isMcapRef = useRef(isMcap);
  isMcapRef.current = isMcap;
  const barsGenRef = useRef(0);

  const onTimeframeRef = useRef(onTimeframeChange);
  onTimeframeRef.current = onTimeframeChange;
  const onUnitRef = useRef(onDisplayUnitChange);
  onUnitRef.current = onDisplayUnitChange;
  const activeTfRef = useRef(activeTimeframe);
  activeTfRef.current = activeTimeframe;

  // Format small prices with subscript zero counts and market caps compactly
  useEffect(() => {
    globalThis.__velaPriceLabel = (value: number) => {
      if (isMcapRef.current) return formatMcap(value);
      if (value !== 0 && Math.abs(value) < 0.001) return formatPrice(value);
      return null;
    };
  }, []);

  const actionsRef = useRef<((state: { mcap: boolean; full: boolean; canMcap: boolean }) => void) | null>(null);

  useEffect(() => {
    let workspace: VelaWorkspace | null = null;
    let disposed = false;

    void (async () => {
      const [{ VelaWorkspace: Workspace }, { registerNativeIndicator, registerWidgetAction }, { registerIcon }] =
        await Promise.all([import('@luxalgo/vela/workspace'), import('@luxalgo/vela'), import('@luxalgo/vela/ui')]);

      if (disposed) return;

      registerIcon('indicators', iconOf(ICONS.indicators));
      registerIcon(UNIT_ACTION, iconOf(ICONS.unit));
      registerIcon(`${SCREEN_ACTION}-expand`, iconOf(ICONS.expand));
      registerIcon(`${SCREEN_ACTION}-shrink`, iconOf(ICONS.shrink));

      actionsRef.current = (state) => {
        if (state.canMcap) {
          registerWidgetAction({
            id: UNIT_ACTION,
            target: 'topbar',
            label: state.mcap ? 'MCap' : 'Price',
            icon: UNIT_ACTION,
            align: 'left',
            run: () => {
              const next = state.mcap ? 'price' : 'mcap';
              setInternalUnit(next);
              onUnitRef.current?.(next);
            },
          });
        }
        registerWidgetAction({
          id: SETTINGS_ACTION,
          target: 'topbar',
          label: 'Chart settings',
          icon: 'gear',
          iconOnly: true,
          run: () => workspaceRef.current?.chart.renderer.openSettings(),
        });
        registerWidgetAction({
          id: SCREEN_ACTION,
          target: 'topbar',
          label: state.full ? 'Exit full screen' : 'Full screen',
          icon: state.full ? `${SCREEN_ACTION}-shrink` : `${SCREEN_ACTION}-expand`,
          iconOnly: true,
          run: () => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void frameRef.current?.requestFullscreen();
          },
        });
        workspaceRef.current?.refreshActions();
      };

      actionsRef.current({
        mcap: isMcapRef.current,
        full: Boolean(document.fullscreenElement),
        canMcap: mcapMultiplier !== null && mcapMultiplier > 0,
      });

      if (!registered) {
        registerNativeIndicator(rangeScale);
        registered = true;
      }

      const element = hostRef.current;
      if (disposed || !element) return;

      const provider: DataProvider = {
        getBars: async (_ticker, timeframe) => {
          const asked = INTERVAL_OF_VELA[timeframe];
          if (asked && asked !== activeTfRef.current) {
            onTimeframeRef.current?.(asked);
          }
          return barsRef.current;
        },
        getSymbolInfo: async (ticker) => {
          const lastClose = barsRef.current[barsRef.current.length - 1]?.close ?? 1;
          const mintick =
            Number.isFinite(lastClose) && lastClose > 0
              ? 10 ** (Math.floor(Math.log10(lastClose)) - 4)
              : 0.0001;
          return {
            ticker,
            description: isMcapRef.current ? 'Market Cap (USD)' : `Price (${quoteSymbol})`,
            mintick,
          };
        },
        subscribe: (_ticker, timeframe, onBar) => {
          streamRef.current = { timeframe, push: onBar };
          return () => {
            if (streamRef.current?.push === onBar) streamRef.current = null;
          };
        },
      };

      const theme = chartTheme(getComputedStyle(element).fontFamily);
      workspace = new Workspace(element, {
        layout: false,
        symbol: `invictus:POOL/${quoteSymbol}`,
        timeframe: VELA_TIMEFRAME[activeTfRef.current] ?? '5',
        timeframes: Object.values(VELA_TIMEFRAME),
        live: true,
        providers: { invictus: () => provider },
        theme,
        upColor: theme.upColor,
        downColor: theme.downColor,
        volume: true,
        currentPriceLine: true,
        drawingToolbar: true,
        statusline: true,
        topbar: {
          left: ['timeframes', 'style', 'indicators', ...(mcapMultiplier ? [UNIT_ACTION] : [])],
          right: ['screenshot', SCREEN_ACTION, SETTINGS_ACTION],
        },
        bottombar: false,
        watermark: false,
        persist: false,
        autofocus: false,
        animations: { liveBar: true },
        priceAxis: {
          ticks: (context: PriceAxisTickContext) => {
            if (context.pane.kind !== 'price') return null;
            setScaleOf((current) => scaleFrom(context, current));
            if (isMcapRef.current) {
              return context.defaults.map((tick) => ({ ...tick, label: formatMcap(tick.price) }));
            }
            if (context.mode !== 'price' || Math.max(Math.abs(context.min), Math.abs(context.max)) >= 0.001) {
              return null;
            }
            return context.defaults.map((tick) => ({ ...tick, label: formatPrice(tick.price) }));
          },
        },
      });

      workspaceRef.current = workspace;
      const prefs = workspace.active.statusPrefs();
      workspace.active.applyStatusPrefs({
        ...prefs,
        parts: { logo: false, name: true, market: true, ohlc: true, change: false },
      });
      scaleRef.current = workspace.chart.addNativeIndicator(RANGE_SCALE, { inputs: scaleInputs([]) });
      setChart(workspace.chart);
    })();

    return () => {
      disposed = true;
      streamRef.current = null;
      setChart(null);
      setScaleOf(null);
      scaleRef.current = null;
      workspaceRef.current = null;
      workspace?.destroy();
    };
  }, [quoteSymbol, mcapMultiplier]);

  // Push updated bars whenever candles or Price/MCap unit changes
  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws || !chart) return;
    barsGenRef.current += 1;
    ws.active.setSymbol(`invictus:POOL/${quoteSymbol}?v=${barsGenRef.current}`);
    const latest = candles[candles.length - 1] ?? null;
    lastBarRef.current = latest;
  }, [chart, bars, candles, quoteSymbol]);

  // Sync external timeframe changes into Vela
  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws) return;
    const target = VELA_TIMEFRAME[activeTimeframe];
    if (target) ws.active.setTimeframe(target);
  }, [activeTimeframe]);

  // Sync topbar unit / fullscreen state
  useEffect(() => {
    actionsRef.current?.({
      mcap: isMcap,
      full: Boolean(document.fullscreenElement),
      canMcap: mcapMultiplier !== null && mcapMultiplier > 0,
    });
  }, [isMcap, mcapMultiplier]);

  useEffect(() => {
    const onFs = () => {
      const next = document.fullscreenElement === frameRef.current && frameRef.current !== null;
      setFull(next);
      actionsRef.current?.({
        mcap: isMcapRef.current,
        full: next,
        canMcap: mcapMultiplier !== null && mcapMultiplier > 0,
      });
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [mcapMultiplier]);

  // Keep range + owned position bounds in autoscale
  const positionMarks = useMemo<PositionMark[]>(() => {
    const list = Array.isArray(owned) ? owned : owned ? [owned] : [];
    return list.map((p, idx) => ({
      id: `pos-${idx}`,
      low: p.low * mult,
      high: p.high * mult,
      color: p.color || POSITION_COLORS[idx % POSITION_COLORS.length],
      label: p.label,
    }));
  }, [owned, mult]);

  const held = useMemo(
    () => positionMarks.flatMap((item) => [item.low, item.high]),
    [positionMarks],
  );
  const heldLow = held.length ? Math.min(...held) : 0;
  const heldHigh = held.length ? Math.max(...held) : 0;

  useEffect(() => {
    if (chart && !dragging) {
      scaleRef.current?.setInputs(
        scaleInputs([
          rangeLow > 0 ? rangeLow * mult : 0,
          rangeHigh > 0 ? rangeHigh * mult : 0,
          heldLow,
          heldHigh,
        ]),
      );
    }
  }, [chart, rangeLow, rangeHigh, mult, dragging, heldLow, heldHigh]);

  // Stream livePrice ticks into Vela's forming bar
  useEffect(() => {
    if (!livePrice || !Number.isFinite(livePrice) || livePrice <= 0) return;
    const tfSec = TIMEFRAMES[activeTimeframe] ?? 300;
    const rawTs = liveTime && liveTime > 0 ? liveTime : Math.floor(Date.now() / 1000);
    const tsSec = rawTs > 1e12 ? Math.floor(rawTs / 1000) : Math.floor(rawTs);
    const agg = aggregateCandleTick(lastBarRef.current, livePrice, tsSec, tfSec);
    if (!agg) return;
    lastBarRef.current = agg.bar;
    const m = multRef.current;
    streamRef.current?.push({
      time: agg.bar.time * 1000,
      open: agg.bar.open * m,
      high: agg.bar.high * m,
      low: agg.bar.low * m,
      close: agg.bar.close * m,
      volume: agg.bar.volume ?? 0,
    });
  }, [livePrice, liveTime, activeTimeframe]);

  // Indicator legend toggle placement
  useEffect(() => {
    const root = hostRef.current;
    if (!chart || !root) return;
    let legend: HTMLElement | null = null;
    const place = () => {
      const folded = legend?.querySelector<HTMLElement>('.vela-ind-fold');
      if (!legend?.querySelector(':scope > div') || (folded && folded.offsetParent !== null)) {
        return setLegendFoot(null);
      }
      const box = legend.getBoundingClientRect();
      const base = root.getBoundingClientRect();
      const top = Math.round(box.bottom - base.top);
      const left = Math.round(box.left - base.left);
      setLegendFoot((current) => (current?.top === top && current.left === left ? current : { top, left }));
    };
    const sizes = new ResizeObserver(place);
    const find = () => {
      const next = root.querySelector<HTMLElement>('[data-vela-pane="price"]');
      if (next !== legend) {
        sizes.disconnect();
        legend = next;
        if (legend) sizes.observe(legend);
      }
      place();
    };
    const changes = new MutationObserver(find);
    changes.observe(root, { childList: true, subtree: true });
    find();
    return () => {
      changes.disconnect();
      sizes.disconnect();
    };
  }, [chart]);

  const formatOverlayValue = (v: number) => (isMcap ? formatMcap(v) : formatPrice(v));

  return (
    <div
      ref={frameRef}
      data-legend-shut={legendOpen ? undefined : ''}
      className={cn(
        'relative w-full h-full min-h-0 flex flex-col overflow-hidden rounded-xl border border-border/40 bg-card/40 select-none',
        full && 'bg-background',
        className,
      )}
      style={height ? { height } : undefined}
    >
      <div ref={hostRef} className="relative flex-1 min-h-0 w-full" />

      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh chart"
          aria-label="Refresh chart"
          className="absolute top-1.5 right-24 z-20 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
        >
          <RotateCcw className={cn('size-3.5', refreshing && 'animate-spin')} />
        </button>
      )}

      {legendFoot ? (
        <button
          type="button"
          aria-label={legendOpen ? 'Hide indicators' : 'Show indicators'}
          aria-expanded={legendOpen}
          onClick={() => setLegendOpen((open) => !open)}
          className="absolute z-10 flex h-5 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          style={{ top: `${legendFoot.top + 2}px`, left: `${legendFoot.left}px` } as CSSProperties}
        >
          {legendOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      ) : null}

      {chart && scaleOf && positionMarks.length > 0 ? (
        <ChartMarks host={hostRef} scale={scaleOf} positions={positionMarks} />
      ) : null}

      {chart && scaleOf && rangeLow > 0 && rangeHigh > 0 ? (
        <RangeBand
          host={hostRef}
          scale={scaleOf}
          range={{ low: rangeLow * mult, high: rangeHigh * mult }}
          formatValue={formatOverlayValue}
          onEdge={onDragEdge ? (edge, price) => onDragEdge(edge === 'low' ? 'min' : 'max', price / mult) : undefined}
          onCommit={
            onDragCommit ? (edge, price) => onDragCommit(edge === 'low' ? 'min' : 'max', price / mult) : undefined
          }
          onDragging={setDragging}
        />
      ) : null}

      {loading && bars.length === 0 && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-card/80 backdrop-blur-xs">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-xs text-muted-foreground">Loading chart…</span>
        </div>
      )}

      {!loading && bars.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">No candle data available for this pool</span>
        </div>
      )}
    </div>
  );
};
