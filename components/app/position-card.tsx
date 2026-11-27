'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart2,
  ChevronDown,
  ExternalLink,
  Layers,
  LogOut,
  MinusCircle,
  PencilLine,
} from 'lucide-react';
import { ActionProgress, useAction } from '@/components/app/action';
import { ActionDialog } from '@/components/app/action-dialog';
import { AddLiquidity } from '@/components/app/add-liquidity';
import { RebalanceDialog } from '@/components/app/rebalance-dialog';
import { ExitDialog } from '@/components/app/exit-dialog';
import { BinChart } from '@/components/app/bin-chart';
import { CellBadge, StandardPairIdentity } from '@/components/app/pool-cells';
import { useValueChange } from '@/lib/motion';
import type { Candle, TimeframeKey } from '@/components/app/candle-chart';
import { Fiat } from './fiat';
import { CardDialog } from '@/components/app/card-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { get, post } from '@/lib/api';
import { useBlockExplorer } from '@/lib/explorer';
import { compactUsd, duration, formatSubscriptPrice, num, pct, signedPct, signedUsd, toneClass, usd } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Bin, BinDetail, WebPosition } from '@/lib/types';

// The chart only runs in a browser, and it is the heaviest thing on the page -
// no reason to ship it to anyone who never expands a position.
const CandleChart = dynamic(
  () => import('@/components/app/candle-chart').then((m) => m.CandleChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-65 w-full rounded-xl bg-card/40 border border-border/30 p-3 flex flex-col justify-between animate-pulse">
        <div className="flex justify-between items-center">
          <Skeleton className="h-4 w-20 rounded" />
          <Skeleton className="h-4 w-14 rounded" />
        </div>
        <div className="space-y-2 py-3">
          <div className="h-px w-full bg-border/20" />
          <div className="h-px w-full bg-border/20" />
        </div>
        <div className="flex justify-between">
          <Skeleton className="h-3 w-10 rounded" />
          <Skeleton className="h-3 w-10 rounded" />
        </div>
      </div>
    ),
  },
);

const INTERVALS = ['1s', '15s', '1m', '5m', '15m', '1h'] as const;
type IntervalKey = typeof INTERVALS[number];

const Tab = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'rounded-full border px-2.5 py-1 text-xs transition-colors',
      active ? 'border-primary text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground',
    )}
  >
    {children}
  </button>
);

/** The price, over time, with the range this position holds drawn across it. */
const PriceChart = ({ pos }: { pos: WebPosition }) => {
  const [history, setHistory] = useState<{ candles: Candle[] } | null>(null);
  const [interval, setInterval_] = useState<IntervalKey>('5m');
  const historyCache = useRef<Map<string, { candles: Candle[] }>>(new Map());

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const cacheKey = `${pos.poolId.toLowerCase()}:${interval}`;

    const cached = historyCache.current.get(cacheKey);
    if (cached) {
      setHistory(cached);
    }

    const pull = async (): Promise<void> => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const res = await post<{ candles: Candle[]; currency?: string; quotePriceUsd?: number | null }>(
          '/api/pools/history',
          {
            token: pos.tokenAddress,
            poolId: pos.poolId,
            version: pos.version,
            interval,
            ...(pos.chainId ? { chainId: pos.chainId } : {}),
          },
          undefined,
          controller.signal,
        );
        if (!live || controller.signal.aborted) return;
        // The range and live price are in quote units; USD candles are scaled back to match.
        const q = res.quotePriceUsd ?? 0;
        const h =
          res.currency === 'USD' && q > 0
            ? {
                candles: res.candles.map((c) => ({
                  ...c,
                  open: c.open / q,
                  high: c.high / q,
                  low: c.low / q,
                  close: c.close / q,
                  currency: 'quote',
                })),
              }
            : { candles: res.candles };
        historyCache.current.set(cacheKey, h);
        setHistory(h);
      } catch {
        // The bin curve below still works without a line.
      }
    };
    void pull();
    const timer = setInterval(() => void pull(), 45_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pull();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pos.tokenAddress, pos.poolId, pos.version, pos.chainId, interval]);

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-1">
        {INTERVALS.map((i) => (
          <Tab key={i} active={interval === i} onClick={() => setInterval_(i)}>
            {i}
          </Tab>
        ))}
      </div>
      <CandleChart
        candles={history?.candles ?? []}
        rangeLow={pos.priceLower}
        rangeHigh={pos.priceUpper}
        livePrice={pos.price}
        height={260}
        loading={history === null}
        activeTimeframe={interval as TimeframeKey}
      />
    </div>
  );
};

const clamp = (n: number): number => Math.min(100, Math.max(0, n));

/**
 * The bin curve, in the card rather than behind a toggle.
 *
 * It is the one drawing that says where the money sits relative to the price,
 * which is the whole question an open position raises.
 */
const Liquidity = ({ pos }: { pos: WebPosition }) => {
  const [detail, setDetail] = useState<BinDetail | null>(null);

  useEffect(() => {
    let live = true;
    const load = async (): Promise<void> => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const d = await get<BinDetail>(`/api/bins?key=${encodeURIComponent(pos.key)}`);
        if (live) setDetail(d);
      } catch {
        // The numbers beside it still read without the curve.
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pos.key]);

  if (!detail?.map) return <Skeleton className="h-50" />;

  return (
    <div>
      <div className="text-muted-foreground mb-1 text-xs">Liquidity distribution</div>
      <BinChart
        bins={detail.map.bins}
        spotPrice={detail.map.spotPrice}
        quoteSymbol={pos.quoteSymbol}
        tokenSymbol={pos.symbol}
        height={200}
        userPositions={[pos]}
      />
      <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 text-xs">
        <span>Pool TVL {usd(detail.pool.tvlUsd)}</span>
        <span>24h {usd(detail.pool.volume24hUsd)}</span>
        <span>{detail.map.bins.length} bins</span>
      </div>
    </div>
  );
};

/**
 * Give an imported position the cost it was opened at.
 *
 * Nothing on chain records what a range cost in dollars, so a position the bot
 * did not mint has no basis and its PnL is unknown rather than zero. This is
 * the one number that turns it back into a real figure.
 */
export const CostBasis = ({ pos }: { pos: WebPosition }) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter what the position cost, in USD.');
      return;
    }
    setBusy(true);
    try {
      await post('/api/positions/basis', { key: pos.key, usd: amount });
      toast.success(`Cost basis set to ${usd(amount)}. PnL is measured from this now.`);
      setOpen(false);
      setValue('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'could not save that');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-7 px-2 text-xs font-medium gap-1 shadow-2xs text-white hover:text-white hover:bg-muted cursor-pointer active:scale-[0.98] transition-all duration-150 hover:border-foreground/30"
      >
        <PencilLine className="size-3 text-white" />
        <span>{pos.depositUsd > 0 ? 'Edit Cost' : 'Cost'}</span>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="bg-muted/40 flex items-center rounded-md border px-2 py-1">
        <span className="text-muted-foreground mr-1 text-xs">$</span>
        <input
          autoFocus
          value={value}
          inputMode="decimal"
          placeholder={pos.depositUsd > 0 ? String(pos.depositUsd) : '0.00'}
          aria-label="Cost in USD"
          className="tabular w-20 bg-transparent text-sm outline-none"
          onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
        />
      </div>
      <Button size="sm" disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving' : 'Save'}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
};

export interface PresetInfo {
  label: string;
  low: number;
  high: number;
}

export const PRESET_SHAPES: PresetInfo[] = [
  { label: '-20%', low: -20, high: 0 },
  { label: '-50%', low: -50, high: 0 },
  { label: '±10%', low: -10, high: 10 },
  { label: '±30%', low: -30, high: 30 },
  { label: '+50%', low: 0, high: 50 },
];

/**
 * Resolves static preset for the position:
 * 1. Checks localStorage for an explicitly stored preset at open time.
 * 2. If not stored, checks static initial percentages relative to entry price.
 * 3. Matches closest standard preset shape or formats static percentage.
 * This ensures the preset stays static and does not fluctuate with spot price.
 */
export const getStaticPreset = (p: WebPosition): PresetInfo => {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('invictus_position_presets');
      if (raw) {
        const map = JSON.parse(raw);
        if (map[p.key]) return map[p.key];
        if (p.tokenId && map[p.tokenId]) return map[p.tokenId];
      }
    } catch {
      // Ignore localStorage read errors
    }
  }

  // Use static initial lower/upper percentages if available, or compute against entryPriceQuote
  let low = p.initialLowerPct ?? p.lowerPct;
  let high = p.initialUpperPct ?? p.upperPct;
  if (p.entryPriceQuote && p.entryPriceQuote > 0) {
    low = ((p.priceLower - p.entryPriceQuote) / p.entryPriceQuote) * 100;
    high = ((p.priceUpper - p.entryPriceQuote) / p.entryPriceQuote) * 100;
  }

  // Match standard preset shapes with tolerance
  for (const s of PRESET_SHAPES) {
    if (Math.abs(low - s.low) < 4.5 && Math.abs(high - s.high) < 4.5) {
      return s;
    }
  }

  // Fallback to static formatted label
  const l = Math.round(low);
  const u = Math.round(high);
  let label = `${l}% / ${u}%`;
  if (Math.abs(l + u) <= 1 && l < 0 && u > 0) label = `±${Math.abs(u)}%`;
  else if (Math.abs(u) <= 1 && l < 0) label = `${l}%`;
  else if (Math.abs(l) <= 1 && u > 0) label = `+${u}%`;

  return { label, low, high };
};

export interface PositionCardProps {
  p: WebPosition;
  variant?: 'full' | 'compact';
  canExpand?: boolean;
  onAdoptRange?: (low: number, high: number) => void;
  onAdoptPreset?: (preset: PresetInfo) => void;
  onSwitchPool?: (poolId: string, tokenAddress?: string) => void;
  showPairHeader?: boolean;
  showDetails?: boolean;
  isLatest?: boolean;
  isActiveOnChart?: boolean;
  positionIndex?: number;
  positionColor?: string;
  currentPoolId?: string;
  bins?: Bin[];
}

export const CompactPositionCard = ({
  p,
  canExpand: _canExpand = true,
  onAdoptRange: _onAdoptRange,
  onAdoptPreset: _onAdoptPreset,
  onSwitchPool,
  showPairHeader: _showPairHeader = true,
  showDetails = false,
  isLatest: _isLatest = false,
  isActiveOnChart = false,
  positionIndex: _positionIndex,
  positionColor,
  currentPoolId,
  bins,
}: {
  p: WebPosition;
  canExpand?: boolean;
  onAdoptRange?: (low: number, high: number) => void;
  onAdoptPreset?: (preset: PresetInfo) => void;
  onSwitchPool?: (poolId: string, tokenAddress?: string) => void;
  showPairHeader?: boolean;
  showDetails?: boolean;
  isLatest?: boolean;
  isActiveOnChart?: boolean;
  positionIndex?: number;
  positionColor?: string;
  currentPoolId?: string;
  bins?: Bin[];
}) => {
  const action = useAction();

  const hasBasis = p.depositUsd > 0;
  const running = action.steps.length > 0 || action.awaiting !== null;
  const hasFees = (p.feesUsd || 0) > 0.001 || (p.feesQuote || 0) > 0 || (p.feesToken || 0) > 0;

  // Realtime live fee heartbeat flash
  const prevFeesRef = useRef(p.feesUsd);
  const [feeFlashed, setFeeFlashed] = useState(false);

  useEffect(() => {
    if (p.feesUsd !== undefined && prevFeesRef.current !== undefined && p.feesUsd > prevFeesRef.current) {
      setFeeFlashed(true);
      const t = setTimeout(() => setFeeFlashed(false), 900);
      prevFeesRef.current = p.feesUsd;
      return () => clearTimeout(t);
    }
    prevFeesRef.current = p.feesUsd;
  }, [p.feesUsd]);

  // Realtime value price move flash
  const prevValueRef = useRef(p.valueUsd);
  const [valueFlash, setValueFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (p.valueUsd !== undefined && prevValueRef.current !== undefined) {
      const diff = p.valueUsd - prevValueRef.current;
      if (Math.abs(diff) > 0.005) {
        setValueFlash(diff > 0 ? 'up' : 'down');
        const t = setTimeout(() => setValueFlash(null), 800);
        prevValueRef.current = p.valueUsd;
        return () => clearTimeout(t);
      }
    }
    prevValueRef.current = p.valueUsd;
  }, [p.valueUsd]);

  const collect = async (sell = false): Promise<void> => {
    await action.run('/api/collect', { key: p.key, swap: sell });
  };

  const close = async (sell: boolean, to?: 'eth' | 'usdg'): Promise<void> => {
    await action.run('/api/close', { key: p.key, sell, to });
  };

  const isOtherPool = Boolean(currentPoolId && p.poolId && p.poolId.toLowerCase() !== currentPoolId.toLowerCase());

  // Position token composition
  const posTokenUsd = (p.amountToken || 0) * (p.priceUsd || 0);
  const posQuoteUsd = (p.amountQuote || 0) * (p.quoteUsd || 1);
  const posSumUsd = posTokenUsd + posQuoteUsd;
  const posTokenPct = posSumUsd > 0 ? clamp(Math.round((posTokenUsd / posSumUsd) * 100)) : clamp(Math.round((p.filled || 0) * 100));
  const posQuotePct = 100 - posTokenPct;

  // Fee composition
  const feeTokenUsd = (p.feesToken || 0) * (p.priceUsd || 0);
  const feeQuoteUsd = (p.feesQuote || 0) * (p.quoteUsd || 1);
  const feeSumUsd = feeTokenUsd + feeQuoteUsd;
  const feeTokenPct = feeSumUsd > 0 ? clamp(Math.round((feeTokenUsd / feeSumUsd) * 100)) : 50;
  const feeQuotePct = 100 - feeTokenPct;

  return (
    <div
      className={cn(
        'group transition-colors w-full max-w-full min-w-0',
        isActiveOnChart ? 'bg-primary/8 border-l-2 border-l-primary' : 'hover:bg-muted/15',
      )}
    >
      {/* On-Chain Action Dialog */}
      <ActionDialog
        action={action}
        chainId={p.chainId}
        title={`Position: ${p.symbol} / ${p.quoteSymbol}`}
        description="Managing liquidity position on-chain…"
      />

      {/* Main Row — ultra-compact, high-density layout */}
      <div className="group/row flex items-center justify-between gap-2.5 sm:gap-3.5 px-2.5 py-1.5 sm:px-3 sm:py-2 select-none transition-colors duration-150 w-full max-w-full overflow-hidden cursor-default">
        {/* Column 1: Identity */}
        <div className="flex items-center min-w-0 flex-1 sm:flex-none sm:w-[220px] md:w-[250px]">
          <StandardPairIdentity
            chainId={p.chainId ?? 4663}
            baseSymbol={p.symbol}
            quoteSymbol={p.quoteSymbol}
            baseAddress={p.tokenAddress}
            protocol="uniswap"
            protocolVersion={p.version}
            poolId={p.poolId}
            subContent={
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono truncate leading-none">
                {positionColor && (
                  <span
                    className="size-2 rounded-full shrink-0 ring-1 ring-background"
                    style={{ backgroundColor: positionColor }}
                    title="Position color on chart"
                  />
                )}
                {isActiveOnChart && (
                  <span className="size-1.5 rounded-full bg-primary animate-pulse shrink-0" title="Active on chart" />
                )}
                <span className="font-semibold text-foreground">{pct(p.feePct, 2)}</span>
                <CellBadge>{p.version.toUpperCase()}</CellBadge>
                <span className="text-foreground/35">·</span>
                <span className="text-muted-foreground/80">#{p.tokenId}</span>
                <span className="text-foreground/35">·</span>
                <span>{duration(p.ageMs)}</span>
                {onSwitchPool && isOtherPool && (
                  <>
                    <span className="text-foreground/35">·</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSwitchPool(p.poolId);
                      }}
                      className="text-[10px] font-sans font-medium text-primary hover:text-primary/80 hover:underline cursor-pointer transition-colors p-0 bg-transparent border-0 leading-none"
                      title={`Switch to ${p.symbol} / ${p.quoteSymbol} pool`}
                    >
                      Switch
                    </button>
                  </>
                )}
              </div>
            }
          />
        </div>

        {/* Column 2: Status & Range Bounds (hidden on extra-small panels) */}
        <div className="hidden sm:flex sm:flex-col sm:items-start sm:w-[115px] md:w-[130px] shrink-0">
          <Badge
            variant="outline"
            className={cn(
              'gap-1 text-[10px] font-medium px-1.5 py-0 shrink-0 h-4 transition-colors duration-200',
              p.inRange
                ? 'border-up/30 bg-up/10 text-up'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-500',
            )}
          >
            <span className="relative flex size-1.5 shrink-0 items-center justify-center">
              <span
                className={cn(
                  'size-1 rounded-full',
                  p.inRange
                    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]'
                    : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]',
                )}
              />
            </span>
            <span>{p.inRange ? 'In Range' : 'Out'}</span>
          </Badge>
          <div className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
            {compactUsd(p.priceLower)} – {compactUsd(p.priceUpper)}
          </div>
        </div>

        {/* Column 3: Position Value & PnL with Live Tick Flash */}
        <div className="flex flex-col items-end shrink-0 sm:w-[110px] md:w-[125px]">
          <div className="flex items-baseline gap-1 font-mono">
            <span
              className={cn(
                'font-bold text-xs sm:text-[13px] tabular-nums transition-colors duration-300',
                valueFlash === 'up' && 'text-emerald-400',
                valueFlash === 'down' && 'text-rose-400',
                !valueFlash && 'text-foreground',
              )}
            >
              {usd(p.valueUsd)}
            </span>
            {hasBasis && (
              <span className={cn('text-[10px] font-medium tabular-nums', toneClass(p.pnlUsd))}>
                ({signedPct(p.pnlPct)})
              </span>
            )}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground truncate hidden sm:block">
            {num(p.amountToken)} {p.symbol}
          </div>
        </div>

        {/* Column 4: Fees Earned with Live Heartbeat (hidden on very small viewports) */}
        <div className="hidden xs:flex flex-col items-end min-w-[75px] sm:w-[95px] md:w-[110px] shrink-0">
          <div
            className={cn(
              'font-mono font-bold text-xs sm:text-[13px] tabular-nums transition-all duration-300',
              feeFlashed
                ? 'text-emerald-300 scale-105 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                : 'text-emerald-400 scale-100',
            )}
          >
            +{usd(p.feesUsd)}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            {p.feeApr !== null && p.feeApr > 0 ? (
              <span className="text-emerald-500 font-medium">{pct(p.feeApr, 0)} APR</span>
            ) : hasFees ? (
              `+${num(p.feesToken)} ${p.symbol}`
            ) : (
              'No fees'
            )}
          </div>
        </div>

        {/* Column 5: Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 pl-1">
          <Button
            variant="outline"
            size="icon"
            disabled={!hasFees || running || action.busy}
            onClick={(e) => {
              e.stopPropagation();
              if (hasFees) void collect(false);
            }}
            className={cn(
              'size-7 shadow-2xs transition-all duration-150 active:scale-95',
              hasFees
                ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-white cursor-pointer hover:text-white'
                : 'opacity-40 border-border/40 cursor-not-allowed text-white/50',
            )}
            title={hasFees ? `Claim ${usd(p.feesUsd)} fees to wallet in 1 click` : 'No fees to claim'}
          >
            <ArrowDownToLine className="size-3.5 text-white" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                disabled={running || action.busy}
                className="size-7 shadow-2xs cursor-pointer text-white hover:text-white border-rose-500/30 hover:bg-rose-500/10 hover:border-rose-500/50 active:scale-95 transition-all duration-150 data-[state=open]:bg-rose-500/15 data-[state=open]:border-rose-500/60"
                onClick={(e) => e.stopPropagation()}
                title="Close position"
              >
                <ArrowUpRight className="size-3.5 text-white" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 p-1 space-y-0.5" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  void close(false);
                }}
                className="flex flex-col items-start gap-0.5 cursor-pointer py-1.5 px-2 rounded-md transition-colors"
              >
                <span className="font-medium text-xs flex items-center gap-1.5 text-foreground">
                  <MinusCircle className="size-3.5 text-muted-foreground" />
                  Withdraw Both
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Return {p.symbol} & {p.quoteSymbol} plus fees
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  void close(true, 'usdg');
                }}
                className="flex flex-col items-start gap-0.5 cursor-pointer py-1.5 px-2 rounded-md transition-colors"
              >
                <span className="font-medium text-xs flex items-center gap-1.5 text-foreground">
                  <ArrowUpRight className="size-3.5 text-emerald-400" />
                  Swap to USDG
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Exit 100% to USDG
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  void close(true, 'eth');
                }}
                className="flex flex-col items-start gap-0.5 cursor-pointer py-1.5 px-2 rounded-md transition-colors"
              >
                <span className="font-medium text-xs flex items-center gap-1.5 text-foreground">
                  <ArrowUpRight className="size-3.5 text-primary" />
                  Swap to ETH
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Exit 100% to ETH
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Position Details & Management (This Pool Only) — Non-expandable, always visible & ultra-compact */}
      {showDetails && (
        <div className="border-t border-border/20 bg-muted/10 px-2.5 py-1.5 space-y-1.5">
          {/* 1. Concentrated Liquidity Range Bar Chart — ultra compact height */}
          <div className="w-full h-18 sm:h-20 rounded-md bg-background/60 px-2 py-0.5 border border-border/30 flex flex-col justify-between shadow-2xs">
            <BinChart
              bins={isOtherPool ? [] : (bins ?? [])}
              spotPrice={p.price || 1}
              quoteSymbol={p.quoteSymbol}
              tokenSymbol={p.symbol}
              compact={true}
              userPositions={[{
                priceLower: p.priceLower,
                priceUpper: p.priceUpper,
                color: p.inRange ? '#10b981' : '#f43f5e',
                label: 'Your range',
              }]}
              className="w-full h-full"
            />
          </div>

          {/* 2. Position and Fee Composition Bars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {/* Position Composition */}
            <div className="space-y-1 p-1.5 rounded-md border border-border/25 bg-background/50 shadow-2xs">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold text-muted-foreground uppercase text-[9px] tracking-wider">
                  Position
                </span>
                <span className="font-mono font-medium text-foreground">{usd(p.valueUsd)}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden flex border border-border/20">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${posTokenPct}%` }}
                  title={`${p.symbol}: ${posTokenPct}%`}
                />
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${posQuotePct}%` }}
                  title={`${p.quoteSymbol}: ${posQuotePct}%`}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                <span className="flex items-center gap-1 truncate">
                  <span className="size-1.5 rounded-full bg-primary shrink-0" />
                  {num(p.amountToken)} {p.symbol}
                </span>
                <span className="flex items-center gap-1 truncate">
                  <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                  {num(p.amountQuote)} {p.quoteSymbol}
                </span>
              </div>
            </div>

            {/* Fee Composition */}
            <div className="space-y-1 p-1.5 rounded-md border border-border/25 bg-background/50 shadow-2xs">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold text-muted-foreground uppercase text-[9px] tracking-wider">
                  Unclaimed Fees
                </span>
                <span className="font-mono font-medium text-emerald-400">+{usd(p.feesUsd)}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden flex border border-border/20">
                {hasFees ? (
                  <>
                    <div
                      className="bg-primary h-full transition-all duration-300"
                      style={{ width: `${feeTokenPct}%` }}
                      title={`${p.symbol}: ${feeTokenPct}%`}
                    />
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${feeQuotePct}%` }}
                      title={`${p.quoteSymbol}: ${feeQuotePct}%`}
                    />
                  </>
                ) : (
                  <div className="w-full h-full bg-muted/30" />
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                <span className="flex items-center gap-1 truncate">
                  <span className="size-1.5 rounded-full bg-primary shrink-0" />
                  +{num(p.feesToken)} {p.symbol}
                </span>
                <span className="flex items-center gap-1 truncate">
                  <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                  +{num(p.feesQuote)} {p.quoteSymbol}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Modal Position Management Action Buttons — Fills the Card Width */}
          <div className="grid grid-cols-4 gap-1.5 w-full pt-0.5">
            <AddLiquidity
              pos={p}
              label="Add"
              className="h-7 w-full justify-center text-[11px] font-semibold gap-1 px-1 shadow-2xs cursor-pointer text-white hover:text-white border-border/60 hover:border-foreground/30 hover:bg-muted active:scale-[0.98] transition-all duration-150"
            />

            <RebalanceDialog
              pos={p}
              className="h-7 w-full justify-center text-[11px] font-semibold gap-1 px-1 shadow-2xs cursor-pointer text-white hover:text-white border-border/60 hover:border-foreground/30 hover:bg-muted active:scale-[0.98] transition-all duration-150"
            />

            <ExitDialog
              pos={p}
              className="h-7 w-full justify-center text-[11px] font-semibold gap-1 px-1 shadow-2xs cursor-pointer text-white hover:text-white border-rose-500/30 hover:bg-rose-500/10 hover:border-rose-500/50 active:scale-[0.98] transition-all duration-150"
            />

            <CardDialog
              kind="position"
              params={`key=${encodeURIComponent(p.key)}`}
              title={`${p.symbol} / ${p.quoteSymbol}`}
              label="Share"
              isProfit={p.pnlUsd >= 0}
              className="h-7 w-full justify-center text-[11px] font-semibold gap-1 px-1 shadow-2xs text-white hover:text-white hover:bg-muted cursor-pointer active:scale-[0.98] transition-all duration-150 hover:border-foreground/30"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export const PositionCard = ({
  p,
  variant = 'full',
  canExpand = true,
  onAdoptRange,
  onAdoptPreset,
  onSwitchPool,
  showPairHeader = true,
  showDetails = false,
  isLatest = false,
  isActiveOnChart = false,
  positionIndex,
  positionColor,
  currentPoolId,
  bins,
}: PositionCardProps) => {
  if (variant === 'compact') {
    return (
      <CompactPositionCard
        p={p}
        canExpand={canExpand}
        onAdoptRange={onAdoptRange}
        onAdoptPreset={onAdoptPreset}
        onSwitchPool={onSwitchPool}
        showPairHeader={showPairHeader}
        showDetails={showDetails}
        isLatest={isLatest}
        isActiveOnChart={isActiveOnChart}
        positionIndex={positionIndex}
        positionColor={positionColor}
        currentPoolId={currentPoolId}
        bins={bins}
      />
    );
  }

  const [showLiquidity, setShowLiquidity] = useState(false);
  const [showChart, setShowChart] = useState(false);

  const action = useAction();
  const { formatUrl } = useBlockExplorer();
  const hasBasis = p.depositUsd > 0;
  const running = action.steps.length > 0 || action.awaiting !== null;
  const hasFees = (p.feesUsd || 0) > 0.001 || (p.feesQuote || 0) > 0 || (p.feesToken || 0) > 0;
  const valueChange = useValueChange(p.valueUsd, (v) => usd(v));
  const feesChange = useValueChange(p.feesUsd, (v) => usd(v));

  const close = async (sell: boolean, to?: 'eth' | 'usdg'): Promise<void> => {
    await action.run('/api/close', { key: p.key, sell, to });
  };

  const collect = async (sell = false): Promise<void> => {
    await action.run('/api/collect', { key: p.key, swap: sell });
  };

  // Position Composition
  const posTokenUsd = (p.amountToken || 0) * (p.priceUsd || 0);
  const posQuoteUsd = (p.amountQuote || 0) * (p.quoteUsd || 1);
  const posSumUsd = posTokenUsd + posQuoteUsd;
  const posTokenPct = posSumUsd > 0 ? clamp(Math.round((posTokenUsd / posSumUsd) * 100)) : clamp(Math.round((p.filled || 0) * 100));
  const posQuotePct = 100 - posTokenPct;

  // Fee Composition
  const feeTokenUsd = (p.feesToken || 0) * (p.priceUsd || 0);
  const feeQuoteUsd = (p.feesQuote || 0) * (p.quoteUsd || 1);
  const feeSumUsd = feeTokenUsd + feeQuoteUsd;
  const feeTokenPct = feeSumUsd > 0 ? clamp(Math.round((feeTokenUsd / feeSumUsd) * 100)) : 50;
  const feeQuotePct = 100 - feeTokenPct;

  // Clamped pointer for visual gauge
  const rangeGaugePct = clamp(Math.round(p.rangePos * 100));

  return (
    <Card className="overflow-hidden rounded-xl bg-card/60 border border-border/70 shadow-xs transition-all duration-200 hover:border-border gap-0 p-0">
      {/* Header */}
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/40 py-3.5 px-4 sm:px-5 bg-muted/15">
        <div className="flex items-center gap-3 min-w-0">
          <StandardPairIdentity
            chainId={p.chainId ?? 4663}
            baseSymbol={p.symbol}
            quoteSymbol={p.quoteSymbol}
            baseAddress={p.tokenAddress}
            protocol="uniswap"
            protocolVersion={p.version}
            poolId={p.poolId}
            subContent={
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-mono">
                <span className="font-semibold text-foreground">{pct(p.feePct, 2)}</span>
                <CellBadge>{p.version.toUpperCase()}</CellBadge>
                <span className="text-foreground/35">·</span>
                <span>Token ID #{p.tokenId}</span>
                <span className="text-foreground/35">·</span>
                <span>held {duration(p.ageMs)}</span>
              </div>
            }
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge
            className={cn(
              'gap-1.5 text-xs font-medium px-2.5 py-1',
              p.inRange
                ? 'border-up/30 bg-up/10 text-up'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-500',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full shrink-0',
                p.inRange ? 'bg-up animate-pulse' : 'bg-amber-500',
              )}
            />
            <span>
              {p.inRange
                ? 'In Range'
                : p.price < p.priceLower
                  ? 'Below Range'
                  : 'Above Range'}
            </span>
          </Badge>

          <Button
            variant="ghost"
            size="icon-xs"
            asChild
            className="size-7 text-muted-foreground hover:text-foreground cursor-pointer rounded-md"
            title="View on explorer"
            aria-label="View on explorer"
          >
            <a
              href={formatUrl(`/token/${p.poolId}?a=${p.tokenId}`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        {running && (
          <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
            <ActionProgress steps={action.steps} awaiting={action.awaiting} onDone={action.reset} />
          </div>
        )}

        {/* 1. Dedicated Interactive Range Visualizer */}
        <div className="space-y-2 rounded-xl bg-card/40 border border-border/30 p-3.5 sm:p-4">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Activity className="size-3.5 text-primary" />
              <span>Range Status</span>
            </div>
            <div className="text-[11px] font-mono">
              {p.inRange ? (
                <span className="text-emerald-400 font-medium">In Range · Optimal Yield</span>
              ) : p.price < p.priceLower ? (
                <span className="text-amber-400 font-medium">Below Range · 100% {p.symbol}</span>
              ) : (
                <span className="text-amber-400 font-medium">Above Range · 100% {p.quoteSymbol}</span>
              )}
            </div>
          </div>

          {/* Range Track with Pinpoint Spot Pointer */}
          <div className="relative py-2">
            <div className="h-2 w-full rounded-full bg-muted/60 relative overflow-hidden">
              <div
                className={cn(
                  'absolute inset-y-0 rounded-full transition-all duration-300',
                  p.inRange
                    ? 'bg-linear-to-r from-emerald-500/40 via-emerald-400/80 to-emerald-500/40 border border-emerald-400/30'
                    : 'bg-muted-foreground/30',
                )}
                style={{ left: '0%', right: '0%' }}
              />
            </div>

            <div
              className="absolute top-1 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-300 z-10"
              style={{ left: `${rangeGaugePct}%` }}
            >
              <div
                className={cn(
                  'size-4 rounded-full border-2 bg-background shadow-md flex items-center justify-center',
                  p.inRange
                    ? 'border-emerald-400 ring-2 ring-emerald-400/30'
                    : 'border-amber-400 ring-2 ring-amber-400/30',
                )}
              >
                <div
                  className={cn(
                    'size-1.5 rounded-full',
                    p.inRange ? 'bg-emerald-400' : 'bg-amber-400',
                  )}
                />
              </div>
            </div>
          </div>

          {/* Range Bounds */}
          <div className="flex items-baseline justify-between text-[11px] font-mono tabular-nums text-muted-foreground pt-1">
            <div className="space-y-0.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Min Price</div>
              <div className="font-semibold text-foreground">${formatSubscriptPrice(p.priceLower)}</div>
              <div className="text-[10px] text-muted-foreground/80">{signedPct(p.lowerPct, 1)}</div>
            </div>

            <div className="text-center space-y-0.5 px-2">
              <div className="text-[10px] uppercase tracking-wider text-primary font-medium">Spot Price</div>
              <div className="font-bold text-foreground text-xs">${formatSubscriptPrice(p.priceUsd || p.price)}</div>
              {p.priceUsd && p.priceUsd !== p.price ? (
                <div className="text-[10px] text-muted-foreground">{num(p.price)} {p.quoteSymbol}</div>
              ) : null}
            </div>

            <div className="text-right space-y-0.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Max Price</div>
              <div className="font-semibold text-foreground">${formatSubscriptPrice(p.priceUpper)}</div>
              <div className="text-[10px] text-muted-foreground/80">{signedPct(p.upperPct, 1)}</div>
            </div>
          </div>

          {p.mcapNow !== null && (
            <div className="pt-2 mt-1 border-t border-border/20 flex flex-wrap items-center justify-between text-[11px] font-mono text-muted-foreground gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Range Market Cap:</span>
              <div className="flex items-center gap-1.5 text-xs">
                <span>Min {compactUsd(p.mcapLower)}</span>
                <span className="text-muted-foreground/40">→</span>
                <span className={cn('font-semibold', p.inRange ? 'text-emerald-400' : 'text-foreground')}>
                  Now {compactUsd(p.mcapNow)}
                </span>
                <span className="text-muted-foreground/40">→</span>
                <span>Max {compactUsd(p.mcapUpper)}</span>
              </div>
            </div>
          )}
        </div>

        {/* 2. 4-Pillars Primary Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 p-3.5 rounded-xl bg-card/40 border border-border/40">
          {/* Pillar 1: Position Value */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Position Value</div>
            <div className={cn('font-mono font-bold text-xl sm:text-2xl text-foreground tabular-nums px-0.5 rounded-xs transition-colors', valueChange.changed && (valueChange.direction === 'up' ? 'value-flash-up' : 'value-flash-down'))}>
              {usd(p.valueUsd)}
              <Fiat usd={p.valueUsd} className="block mt-1" />
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden flex border border-border/20">
              <div className="bg-primary h-full transition-all duration-300" style={{ width: `${posTokenPct}%` }} />
              <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${posQuotePct}%` }} />
            </div>
            <div className="text-[10px] font-mono text-muted-foreground flex justify-between truncate">
              <span>{num(p.amountToken)} {p.symbol}</span>
              <span>{num(p.amountQuote)} {p.quoteSymbol}</span>
            </div>
          </div>

          {/* Pillar 2: Unclaimed Fees */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Unclaimed Fees</span>
              {p.feeApr !== null && p.feeApr > 0 && (
                <Badge variant="outline" className="text-[10px] font-mono px-1 py-0 border-up/30 bg-up/10 text-up">
                  +{pct(p.feeApr, 0)} APR
                </Badge>
              )}
            </div>
            <div className={cn('font-mono font-bold text-xl sm:text-2xl tabular-nums px-0.5 rounded-xs transition-colors', hasFees ? 'text-up' : 'text-muted-foreground', feesChange.changed && 'value-flash-up')}>
              {hasFees ? `+${usd(p.feesUsd)}` : '$0.00'}
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden flex border border-border/20">
              {hasFees ? (
                <>
                  <div className="bg-primary h-full transition-all duration-300" style={{ width: `${feeTokenPct}%` }} />
                  <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${feeQuotePct}%` }} />
                </>
              ) : (
                <div className="w-full h-full bg-muted/30" />
              )}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground flex justify-between truncate">
              {hasFees ? (
                <>
                  <span>+{num(p.feesToken)} {p.symbol}</span>
                  <span>+{num(p.feesQuote)} {p.quoteSymbol}</span>
                </>
              ) : (
                <span>No fees yet</span>
              )}
            </div>
          </div>

          {/* Pillar 3: Net PnL */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Net PnL</span>
              {hasBasis && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-mono px-1 py-0',
                    p.pnlUsd >= 0
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-destructive/30 bg-destructive/10 text-destructive',
                  )}
                >
                  {signedPct(p.pnlPct)}
                </Badge>
              )}
            </div>
            <div className={cn('font-mono font-bold text-xl sm:text-2xl tabular-nums', hasBasis ? toneClass(p.pnlUsd) : 'text-muted-foreground')}>
              {hasBasis ? signedUsd(p.pnlUsd) : '-'}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground flex items-center justify-between pt-2">
              {hasBasis ? (
                <>
                  <span>Cost {usd(p.depositUsd)}</span>
                  <span>Total {usd(p.totalUsd)}</span>
                </>
              ) : (
                <span>Imported without basis</span>
              )}
            </div>
          </div>

          {/* Pillar 4: Current Price & Spread */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Price & Age</div>
            <div className="font-mono font-bold text-xl sm:text-2xl text-foreground tabular-nums truncate">
              ${formatSubscriptPrice(p.priceUsd || p.price)}
            </div>
            {p.priceUsd && p.priceUsd !== p.price ? (
              <div className="text-[11px] font-mono text-muted-foreground">
                ≈ {num(p.price)} {p.quoteSymbol}
              </div>
            ) : null}
            <div className="text-[10px] font-mono text-muted-foreground pt-1 flex items-center justify-between">
              <span>Held {duration(p.ageMs)}</span>
              <span className="text-muted-foreground/70">ID #{p.tokenId}</span>
            </div>
          </div>
        </div>

        {/* 3. Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-border/30">
          {/* Left: Core Trading Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {hasFees ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    disabled={running || action.busy}
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer text-xs h-8"
                  >
                    <ArrowDownToLine className="size-3.5 text-white" />
                    <span>Claim Fees (+{usd(p.feesUsd)})</span>
                    <ChevronDown className="size-3 opacity-70 text-white" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem
                    onClick={() => void collect(false)}
                    className="flex flex-col items-start gap-0.5 cursor-pointer py-2"
                  >
                    <span className="font-medium text-xs flex items-center gap-1.5">
                      <ArrowDownToLine className="size-3.5 text-emerald-400" />
                      Claim to Wallet
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Keep {p.symbol} and {p.quoteSymbol} fees in wallet
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void collect(true)}
                    className="flex flex-col items-start gap-0.5 cursor-pointer py-2"
                  >
                    <span className="font-medium text-xs flex items-center gap-1.5">
                      <ArrowLeftRight className="size-3.5 text-primary" />
                      Claim & Swap to {p.quoteSymbol}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Auto-convert {p.symbol} fee into {p.quoteSymbol}
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="outline" size="sm" disabled className="gap-1.5 opacity-50 text-xs h-8 text-white">
                <ArrowDownToLine className="size-3.5 text-white" />
                <span>No Fees</span>
              </Button>
            )}

            <AddLiquidity pos={p} />

            <RebalanceDialog pos={p} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={running || action.busy}
                  className="gap-1.5 text-xs h-8 hover:border-destructive/40 hover:text-destructive transition-colors cursor-pointer"
                >
                  <LogOut className="size-3.5" />
                  <span>Close</span>
                  <ChevronDown className="size-3 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuItem
                  onClick={() => void close(false)}
                  className="flex flex-col items-start gap-0.5 cursor-pointer py-2"
                >
                  <span className="font-medium text-xs flex items-center gap-1.5">
                    <MinusCircle className="size-3.5 text-muted-foreground" />
                    Withdraw Both Tokens
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Return {p.symbol} and {p.quoteSymbol} plus fees
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void close(true, 'usdg')}
                  className="flex flex-col items-start gap-0.5 cursor-pointer py-2"
                >
                  <span className="font-medium text-xs flex items-center gap-1.5">
                    <ArrowUpRight className="size-3.5 text-emerald-400" />
                    Exit 100% to USDG
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Withdraw and swap all tokens to USDG
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void close(true, 'eth')} className="cursor-pointer py-2 text-xs">Close and swap to ETH</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Right: Tools & Drawers */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={showLiquidity ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowLiquidity((prev) => !prev)}
              className="gap-1.5 text-xs h-8 cursor-pointer"
            >
              <Layers className="size-3.5" />
              <span>Depth</span>
              <ChevronDown className={cn('size-3 transition-transform', showLiquidity && 'rotate-180')} />
            </Button>

            <Button
              variant={showChart ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowChart((prev) => !prev)}
              className="gap-1.5 text-xs h-8 cursor-pointer"
            >
              <BarChart2 className="size-3.5" />
              <span>Chart</span>
              <ChevronDown className={cn('size-3 transition-transform', showChart && 'rotate-180')} />
            </Button>

            <CardDialog
              kind="position"
              params={`key=${encodeURIComponent(p.key)}`}
              title={`${p.symbol} / ${p.quoteSymbol}`}
              label="Share"
              isProfit={p.pnlUsd >= 0}
            />
          </div>
        </div>

        {/* 4. Expandable Analytics Drawers */}
        {showLiquidity && (
          <div className="pt-3 border-t border-border/30 animate-in fade-in-50 duration-200">
            <Liquidity pos={p} />
          </div>
        )}

        {showChart && (
          <div className="pt-3 border-t border-border/30 animate-in fade-in-50 duration-200">
            <PriceChart pos={p} />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
