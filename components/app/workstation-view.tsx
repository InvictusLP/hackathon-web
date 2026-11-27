'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Fuel,
  Minus,
  OctagonAlert,
  Plus,
  RefreshCw,
  FishingHook,
  Zap,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAction } from '@/components/app/action';
import { usePersistentTab } from '@/lib/use-persistent-tab';
import { RangePicker, pairedAmount, rangeSplitRatio } from '@/components/app/range-picker';
import { AiAnalysisCard } from '@/components/app/ai-analysis-card';
import { linkedAnalysisId, rangeFromAnalysis, type PoolRefBody } from '@/lib/ai-analysis';
import { FlagBadges } from '@/components/app/flag-badges';
import type { PresetInfo } from '@/components/app/position-card';
import { TokenAvatar, PairAvatar } from '@/components/app/token-avatar';
import { ProtocolAvatar } from '@/components/app/protocol-avatar';
import { ChainAvatar } from '@/components/app/chain-avatar';
import { LaunchpadAvatar, getLaunchpadInfo } from '@/components/app/launchpad-avatar';
import {
  type History,
  cachePoolBins,
  cachePoolForWorkstation,
  cachePoolHistory,
  getAnyCachedHistory,
  getCachedPoolBins,
  getCachedPoolForWorkstation,
  getCachedPoolHistory,
  parseIntervalSeconds,
  poolWorkstationHref,
} from '@/lib/pool-cache';
import { BOT_CHAIN_IDS, getChainFundingOptions, parseProtocol, resolveChainId, resolveChainSlug } from '@/lib/protocols';

import { getCanonicalSupply, resolveTokenListLogo, useTokenLogo, useTokenMeta } from '@/lib/tokens';
import { loudFlags } from '@/lib/flags';
import { waitForJobConfirmation } from '@/lib/batch-actions';
import { useGasReading, usePoolTick, useSnapshot } from '@/components/app/live';
import { isGlobalStreamConnected, useFetch } from '@/lib/use-live';
import dynamic from 'next/dynamic';
import {
  type Candle,
  POSITION_COLORS,
  type TimeframeKey,
  isV2SupportedTimeframe,
  mapV2Candles,
  mergeCandles,
  resampleCandles,
} from '@/components/app/candle-chart';

// Loaded on demand, and never during the static prerender. The charting library
// is a large module that touches the DOM as it initialises, which is not
// something the build-time render has any business evaluating.
const CandleChart = dynamic(
  () => import('@/components/app/candle-chart').then((m) => m.CandleChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-82.5 w-full rounded-2xl bg-card/40 border border-border/30 p-4 flex flex-col justify-between animate-pulse">
        <div className="flex justify-between items-center">
          <Skeleton className="h-4 w-28 rounded" />
          <div className="flex gap-2">
            <Skeleton className="h-4 w-12 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
        </div>
        <div className="space-y-3 py-6">
          <div className="h-px w-full bg-border/20" />
          <div className="h-px w-full bg-border/20" />
          <div className="h-px w-full bg-border/20" />
        </div>
        <div className="flex justify-between items-center">
          <Skeleton className="h-3 w-14 rounded" />
          <Skeleton className="h-3 w-14 rounded" />
          <Skeleton className="h-3 w-14 rounded" />
        </div>
      </div>
    ),
  },
);

const ActionDialog = dynamic(
  () => import('@/components/app/action-dialog').then((m) => m.ActionDialog),
  { ssr: false },
);

const PositionCard = dynamic(
  () => import('@/components/app/position-card').then((m) => m.PositionCard),
  { ssr: false },
);
import { PageHeader } from '@/components/app/page-header';
import { TerminalSkeleton } from '@/components/app/terminal-skeleton';
import { usePageTitle } from '@/components/app/page-title';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { get, post } from '@/lib/api';
import { useBlockExplorer } from '@/lib/explorer';
import { compactUsd, feeTier, formatSubscriptPrice, num, shortAddr, usd } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AiAnalysis, BinDetail, GasNow, OpenPlan, PoolSearch, SettingsPayload, TrackedTransaction } from '@/lib/types';

export const cleanPoolId = (id: string | null | undefined): string => {
  if (!id) return '';
  const trimmed = id.trim();
  return (trimmed.includes(':') ? trimmed.split(':').pop()! : trimmed).toLowerCase();
};

/** What the filled boxes add up to. */
type Side = 'none' | 'down' | 'up' | 'both';

interface PoolBins {
  pool?: any;
  mcap?: number | null;
  supply?: number | null;
  map: BinDetail['map'];
  balances: { eth: number; weth: number; usdg: number; token: number; tokenSymbol: string; quote?: number };
  priceNow: number;
  priceUsd?: number | null;
  quotePriceUsd?: number | null;
  quoteUsd?: number | null;
  priceLower: number;
  priceUpper: number;
  tick?: number | null;
  sqrtPriceX96?: string | null;
  tickSpacing?: number;
  binStepPct?: number | null;
  fee?: number;
  effectiveFee?: number;
  feeAprPct?: number | null;
  quoteIsToken0?: boolean;
  quoteKey?: string;
  quoteAddress?: string;
  tvlUsd: number | null;
  tvlExact?: boolean;
  volume24hUsd: number | null;
  marketCap?: number | null;
  fdv?: number | null;
  totalSupply?: number | null;
  reserves?: {
    token: number;
    quote: number;
    tokenUsd: number;
    quoteUsd: number;
  } | null;
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number } | null;
  volumeTimeframes?: { h24?: number; h6?: number; h1?: number; m5?: number } | null;
  txnsTimeframes?: {
    m5?: { buys: number; sells: number };
    h1?: { buys: number; sells: number };
    h6?: { buys: number; sells: number };
    h24?: { buys: number; sells: number };
  } | null;
  createdAt?: number | null;
  tokenCreatedAt?: number | null;
  poolCreatedAt?: number | null;
  ethUsd?: number | null;
  /** The pool's chain: its gas token and that token's price (BNB on BNB Chain), and whether the bot swaps there. */
  chainId?: number;
  nativeSymbol?: string;
  nativeUsd?: number | null;
  quoteIsWrapper?: boolean;
  swaps?: boolean;
  txns24h?: { buys: number; sells: number } | null;
  probe?: { buyRatio: number | null; sellRatio: number | null; incomplete: boolean } | null;
  hooks?: string | null;
  warnings?: string[];
}

const formatAge = (timestampMs?: number | null, fallbackTimestampMs?: number | null): string => {
  const ts = timestampMs && timestampMs > 0 ? timestampMs : fallbackTimestampMs && fallbackTimestampMs > 0 ? fallbackTimestampMs : null;
  if (!ts || ts <= 0) return '—';
  const diffMs = Math.max(0, Date.now() - ts);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
  if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
  return `${Math.max(1, diffMins)}m`;
};

const MetricRow = ({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string | null;
  highlight?: boolean;
}) => {
  // Only color delta labels (e.g. "+12.4%", "-5.0%"). Non-delta percentages or flats stay neutral/white.
  const isDelta = typeof sub === 'string' && (sub.startsWith('+') || sub.startsWith('-'));
  const subNum = isDelta ? parseFloat(sub.replace('%', '').replace('+', '')) : null;
  const subColor =
    !isDelta || subNum === null || isNaN(subNum) || subNum === 0
      ? 'text-foreground'
      : subNum > 0
        ? 'text-emerald-400'
        : 'text-rose-400';

  return (
    <div className="flex items-center justify-between py-1 border-b border-border/15 last:border-b-0 text-xs">
      <span className="text-muted-foreground/80 font-medium text-[11px] truncate">{label}</span>
      <div className="text-right shrink-0 flex items-center gap-1.5">
        <span
          className={cn(
            'tabular-nums font-mono font-medium text-foreground text-xs',
            highlight && 'font-semibold',
          )}
        >
          {value}
        </span>
        {sub && (
          <span className={cn('text-[10px] font-mono bg-muted/30 px-1 rounded border border-border/25', subColor)}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Dynamic gas reserve calculator.
 * Computes optimal ETH buffer held back for open + close transactions based on:
 * 1. Live gas reading (gasReading.openUsd + gasReading.closeUsd from /api/gas, which scales with priority speed and base fee)
 * 2. User priorityFeePct (Normal=100%, Fast=150%, Turbo=300%) & gasLimitPct
 * 3. Live ETH price in USD
 * 4. User custom setting override (gasReserveEth) if set and sane
 */
export const calculateDynamicGasReserveEth = (
  gasReading: GasNow | null | undefined,
  ethPrice: number | null | undefined,
  priorityFeePct: number = 150,
  gasLimitPct: number = 130,
  customReserveEth?: number | null,
): number => {
  // Respect explicit user setting if within reasonable bounds (e.g. 0.00005 to 0.002)
  if (typeof customReserveEth === 'number' && customReserveEth > 0 && customReserveEth < 0.002) {
    return customReserveEth;
  }

  const effectiveEthPrice = ethPrice && ethPrice > 0 ? ethPrice : 2600;

  if (gasReading && (gasReading.openUsd > 0 || gasReading.closeUsd > 0)) {
    const openUsd = gasReading.openUsd > 0 ? gasReading.openUsd : 0.12;
    const closeUsd = gasReading.closeUsd > 0 ? gasReading.closeUsd : 0.18;
    // 25% safety buffer for gas spikes & slippage
    const totalGasUsd = (openUsd + closeUsd) * 1.25;
    const computedEth = totalGasUsd / effectiveEthPrice;
    // Lower bound 0.00005 ETH (~$0.13), upper bound 0.0005 ETH (~$1.30)
    return Math.max(0.00005, Math.min(0.0005, computedEth));
  }

  // Fallback before gas quote stream connects: scale dynamically with user's priority speed
  const baseGasEth = 0.00010;
  const prioMultiplier = Math.max(1, (priorityFeePct || 150) / 100);
  const limitMultiplier = Math.max(1, (gasLimitPct || 130) / 100);
  const fallbackEth = baseGasEth * (prioMultiplier * 0.7 + limitMultiplier * 0.3);
  return Math.max(0.00005, Math.min(0.0005, fallbackEth));
};

/** Each edge as a signed distance from spot. */
const SHAPES = [
  { label: '-20%', low: -20, high: 0 },
  { label: '-50%', low: -50, high: 0 },
  { label: '±10%', low: -10, high: 10 },
  { label: '±30%', low: -30, high: 30 },
  { label: '+50%', low: 0, high: 50 },
];

const Choice = ({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'inline-flex items-center justify-center rounded-md border text-xs font-medium transition-all select-none',
      active
        ? 'border-border bg-foreground/10 text-foreground font-semibold shadow-2xs'
        : 'border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground',
      className,
    )}
  >
    {children}
  </button>
);

/** A price with the percentage it sits at, and steppers that move the percentage. */
/** How far the range reaches from spot, when none of the presets is the answer. */
interface PercentInputProps {
  signMode: 'both' | 'up' | 'down';
  onToggleSign: () => void;
  value: number;
  onChange: (pct: number) => void;
}

const PlusMinusIcon = ({ mode, className }: { mode: 'both' | 'up' | 'down'; className?: string }) => {
  const isPlusActive = mode === 'both' || mode === 'up';
  const isMinusActive = mode === 'both' || mode === 'down';

  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('size-3 select-none pointer-events-none', className)}
      aria-hidden="true"
    >
      {/* Plus part (+) */}
      <g
        className={cn(
          'transition-all duration-150',
          isPlusActive
            ? 'stroke-white opacity-100 drop-shadow-[0_0_2px_rgba(255,255,255,0.7)]'
            : 'stroke-white/20 opacity-30',
        )}
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <line x1="8" y1="3" x2="8" y2="9" />
        <line x1="5" y1="6" x2="11" y2="6" />
      </g>

      {/* Minus part (-) */}
      <g
        className={cn(
          'transition-all duration-150',
          isMinusActive
            ? 'stroke-white opacity-100 drop-shadow-[0_0_2px_rgba(255,255,255,0.7)]'
            : 'stroke-white/20 opacity-30',
        )}
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <line x1="5" y1="13" x2="11" y2="13" />
      </g>
    </svg>
  );
};

const PercentInput = ({ signMode, onToggleSign, value, onChange }: PercentInputProps) => {
  const [typed, setTyped] = useState<string | null>(null);

  const commit = (raw: string): void => {
    setTyped(null);
    const pct = Number(raw);
    if (Number.isFinite(pct) && pct > 0) onChange(Math.min(900, pct));
  };

  return (
    <div className="flex items-center w-[84px] h-[26px] rounded-lg border border-border/40 bg-muted/40 p-0.5 text-[10px] transition-colors focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
      <button
        type="button"
        onClick={onToggleSign}
        aria-label={`Current direction: ${signMode}. Click to toggle between ±, +, and −`}
        title={`Direction: ${
          signMode === 'both' ? '± (both sides)' : signMode === 'up' ? '+ (above spot)' : '− (below spot)'
        }. Click to toggle.`}
        className="flex h-full w-[26px] shrink-0 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 active:bg-muted/70 rounded-l-md transition-colors cursor-pointer select-none"
      >
        <PlusMinusIcon mode={signMode} />
      </button>

      {/* Subtle vertical divider between direction toggle and percentage input */}
      <div className="w-[1px] h-3.5 bg-border/40 shrink-0" />

      <div className="flex items-center pr-1.5 pl-1 min-w-0 flex-1 justify-end">
        <input
          value={typed ?? String(Number(value.toFixed(1)))}
          inputMode="decimal"
          aria-label="Custom range percentage"
          className="tabular-nums font-mono w-full bg-transparent text-right text-[11px] outline-none font-semibold text-foreground p-0"
          onChange={(e) => setTyped(e.target.value.replace(/[^0-9.]/g, ''))}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <span className="text-muted-foreground ml-0.5 text-[10px] font-medium select-none">%</span>
      </div>
    </div>
  );
};

/**
 * One end of the range: a price you can type, and the distance it sits from spot.
 *
 * Always Min on the left and Max on the right, whichever side of spot the range
 * is on. Naming the boxes after the direction made the reader work out which
 * number was which every time they changed sides.
 */
const PriceBox = ({
  label,
  price,
  offset,
  unit = 'price',
  perUnit = 0,
  priceMultiplier = 1,
  tokenSupply = 0,
  onSet,
  onStep,
}: {
  label: string;
  price: number;
  /** Signed distance from spot, which is the only part that needs a sign. */
  offset: number;
  unit?: 'price' | 'mcap';
  perUnit?: number;
  priceMultiplier?: number;
  tokenSupply?: number;
  onSet: (price: number) => void;
  onStep: (direction: 1 | -1) => void;
}) => {
  const [typed, setTyped] = useState<string | null>(null);

  const mult = priceMultiplier > 0 ? priceMultiplier : 1;
  const displayPrice = price * mult;
  const effectiveSupply = tokenSupply > 0 ? tokenSupply : (perUnit > 0 ? (mult > 1 ? perUnit / mult : perUnit) : 0);
  const mcapUsd = effectiveSupply > 0 ? displayPrice * effectiveSupply : (perUnit > 0 ? price * perUnit : null);

  const shown =
    typed ??
    (unit === 'mcap' && mcapUsd !== null
      ? mcapUsd >= 1e6
        ? `${(mcapUsd / 1e6).toFixed(2)}M`
        : mcapUsd >= 1e3
          ? `${(mcapUsd / 1e3).toFixed(1)}k`
          : `${mcapUsd.toFixed(0)}`
      : displayPrice > 0
        ? displayPrice < 0.0001
          ? formatSubscriptPrice(displayPrice)
          : num(displayPrice)
        : '');

  const commit = (raw: string): void => {
    setTyped(null);
    if (unit === 'mcap') {
      const clean = raw.trim().replace(/^\$/, '').replace(/,/g, '');
      const multFactor =
        clean.toLowerCase().endsWith('m')
          ? 1e6
          : clean.toLowerCase().endsWith('k')
            ? 1e3
            : clean.toLowerCase().endsWith('b')
              ? 1e9
              : 1;
      const n = parseFloat(clean);
      if (Number.isFinite(n) && n > 0) {
        const wantedMcap = n * multFactor;
        if (effectiveSupply > 0) {
          const wantedPriceUsd = wantedMcap / effectiveSupply;
          onSet(wantedPriceUsd / mult);
        } else if (perUnit > 0) {
          onSet(wantedMcap / perUnit);
        }
      }
    } else {
      const clean = raw.trim().replace(/^\$/, '').replace(/,/g, '');
      const wanted = Number(clean);
      if (Number.isFinite(wanted) && wanted > 0) {
        onSet(wanted / mult);
      }
    }
  };

  return (
    <div className="bg-muted/15 rounded-xl border border-border/30 p-2.5 space-y-1 transition-all focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">{label}</span>
        <span
          className={cn(
            'tabular-nums font-mono text-[10px] px-1 py-0.2 rounded font-medium',
            offset === 0
              ? 'text-muted-foreground bg-muted/40'
              : offset > 0
                ? 'text-emerald-500 bg-emerald-500/10'
                : 'text-rose-500 bg-rose-500/10',
          )}
        >
          {offset === 0 ? 'spot' : `${offset > 0 ? '+' : ''}${offset.toFixed(1)}%`}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-bold font-mono text-muted-foreground select-none">$</span>
        <input
          value={shown}
          inputMode="decimal"
          placeholder="0.0"
          aria-label={label}
          className="tabular-nums font-mono min-w-0 flex-1 bg-transparent text-sm font-bold outline-none tracking-tight text-foreground"
          onChange={(e) => setTyped(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={`${label} down`}
            className="hover:bg-muted text-muted-foreground hover:text-foreground flex size-5 items-center justify-center rounded border border-border/40 transition-colors cursor-pointer"
            onClick={() => onStep(-1)}
          >
            <Minus className="size-2.5" />
          </button>
          <button
            type="button"
            aria-label={`${label} up`}
            className="hover:bg-muted text-muted-foreground hover:text-foreground flex size-5 items-center justify-center rounded border border-border/40 transition-colors cursor-pointer"
            onClick={() => onStep(1)}
          >
            <Plus className="size-2.5" />
          </button>
        </div>
      </div>
      <div className="text-[10px] font-mono text-muted-foreground truncate">
        {unit === 'mcap'
          ? displayPrice > 0
            ? `≈ $${formatSubscriptPrice(displayPrice)}`
            : ''
          : mcapUsd !== null && mcapUsd > 0
            ? `≈ ${compactUsd(mcapUsd)} MC`
            : ''}
      </div>
    </div>
  );
};


const formatTokenAmount = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1000) return Number(n.toFixed(2)).toString();
  if (n >= 1) return Number(n.toFixed(4)).toString();
  if (n >= 0.0001) return Number(n.toFixed(6)).toString();
  const fixed = n.toFixed(8);
  if (Number(fixed) > 0) return fixed.replace(/\.?0+$/, '');
  return Number(n.toPrecision(4)).toString();
};

const formatQuoteAmount = (n: number, isEth: boolean): string => {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (isEth) {
    if (n >= 10) return Number(n.toFixed(4)).toString();
    if (n >= 0.0001) return Number(n.toFixed(6)).toString();
    const fixed = n.toFixed(8);
    if (Number(fixed) > 0) return fixed.replace(/\.?0+$/, '');
    return Number(n.toPrecision(4)).toString();
  }
  if (n >= 1000) return Number(n.toFixed(2)).toString();
  if (n >= 1) return Number(n.toFixed(2)).toString();
  if (n >= 0.01) return Number(n.toFixed(4)).toString();
  return Number(n.toFixed(6)).toString();
};

/** One token's box: balance, quick percentage steppers, and the hint for what filling it does. */
const AmountRow = ({
  symbol,
  address,
  imageSrc,
  balance,
  balanceSymbol,
  value,
  hint,
  placeholder = '0.0',
  secondaryValue,
  active = true,
  gasReserve,
  onChange,
  onFillPct,
}: {
  symbol: string;
  address?: string | null;
  imageSrc?: string | null;
  balance: number | null;
  balanceSymbol?: string;
  value: string;
  hint: string;
  placeholder?: string;
  secondaryValue?: string;
  /** False when this token is not required for the current single-sided range. */
  active?: boolean;
  gasReserve?: number;
  onChange: (v: string) => void;
  onFillPct?: (pct: number) => void;
}) => {
  const fillPct = (pct: number) => {
    if (onFillPct) {
      onFillPct(pct);
      return;
    }
    if (balance === null || balance <= 0) return;
    const isEth = (balanceSymbol ?? symbol) === 'ETH';
    const reserve = typeof gasReserve === 'number' ? gasReserve : 0.00015;
    const usable = isEth ? Math.max(0, balance - reserve) : balance;
    const target = usable * (pct / 100);
    onChange(isEth ? formatQuoteAmount(target, true) : formatTokenAmount(target));
  };

  return (
    <div
      className={cn(
        'group rounded-xl border p-3 transition-all',
        active
          ? 'border-border/70 bg-card/60 ring-1 ring-foreground/5 hover:border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20'
          : 'border-border/40 bg-muted/10 opacity-60 hover:opacity-100 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 focus-within:opacity-100 transition-opacity',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <TokenAvatar symbol={symbol} address={address} src={imageSrc} size="md" />
          <span className="font-semibold text-sm tracking-tight text-foreground truncate">
            {symbol}
          </span>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 justify-end">
            <span>Bal:</span>
            {balance !== null ? (
              <button
                type="button"
                onClick={() => fillPct(100)}
                className="font-mono hover:text-foreground font-medium transition-colors underline-offset-2 hover:underline cursor-pointer"
              >
                {num(balance)} {balanceSymbol ? balanceSymbol : ''}
              </button>
            ) : (
              <span>—</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          value={value}
          inputMode="decimal"
          placeholder={placeholder || '0.0'}
          aria-label={`${symbol} amount`}
          className={cn(
            'tabular-nums min-w-0 flex-1 bg-transparent text-xl font-bold tracking-tight text-foreground outline-none font-mono placeholder:text-muted-foreground/40',
          )}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        />
        {((balance !== null && balance > 0) || Boolean(onFillPct)) && (
          <div className="flex items-center gap-1 shrink-0">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => fillPct(pct)}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40 transition-colors cursor-pointer"
              >
                {pct === 100 ? 'MAX' : `${pct}%`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-1.5 text-[11px] text-muted-foreground/80 flex items-center justify-between gap-2">
        <span className="truncate">{hint}</span>
        {secondaryValue && (
          <span className="font-mono text-[10px] text-muted-foreground shrink-0 tabular-nums">
            {secondaryValue}
          </span>
        )}
      </div>
    </div>
  );
};


const OpenPage = ({ initialAddress }: { initialAddress?: string } = {}) => {
  const params = useSearchParams();
  const routeParams = useParams();
  const currentPathname = usePathname();
  const router = useRouter();
  const { formatUrl } = useBlockExplorer();

  // Support /pool/<chain>/<pool contract>, /pools/<pool>, and legacy query params
  const pathInfo = useMemo(() => {
    const pathname = currentPathname || (typeof window !== 'undefined' ? window.location.pathname : '');
    if (!pathname) return { chain: null, poolId: null, token: null };

    if (pathname.startsWith('/pool/')) {
      const parts = pathname.split('/').filter(Boolean); // ['pool', 'robinhood', '0x...']
      if (parts.length >= 3 && parts[1] && parts[2]) {
        const rawPool = decodeURIComponent(parts[2]).trim().replace(/\.(txt|html|rsc|json)$/i, '');
        return { chain: decodeURIComponent(parts[1]).trim(), poolId: rawPool, token: null };
      } else if (parts.length === 2 && parts[1]) {
        const rawPool = decodeURIComponent(parts[1]).trim().replace(/\.(txt|html|rsc|json)$/i, '');
        return { chain: null, poolId: rawPool, token: null };
      }
    } else if (pathname.startsWith('/pools/')) {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[1]) {
        return { chain: null, poolId: null, token: decodeURIComponent(parts[1]).trim() };
      }
    }

    return { chain: null, poolId: null, token: null };
  }, [currentPathname]);

  const queryToken = params.get('token') || params.get('ca') || params.get('address');
  const rawRoutePool = ((routeParams?.pool as string | undefined) || '').replace(/\.(txt|html|rsc|json)$/i, '');
  const rawQueryPool = (params.get('pool') || params.get('canonicalId') || params.get('id') || '').replace(/\.(txt|html|rsc|json)$/i, '');
  const targetPoolId =
    rawQueryPool ||
    (rawRoutePool && rawRoutePool !== 'default' ? rawRoutePool : '') ||
    pathInfo.poolId ||
    '';

  const queryPair = (
    params.get('pair') ||
    params.get('pairAddress') ||
    ''
  ).trim();

  const cleanTarget = (targetPoolId.includes(':') ? targetPoolId.split(':').pop()! : targetPoolId).trim();
  const isExplicitPoolId = Boolean(
    targetPoolId &&
    targetPoolId !== 'default' &&
    (cleanTarget.length === 64 || cleanTarget.length === 66 || Boolean(pathInfo.poolId))
  );

  // Synchronized fast-path: retrieve pre-cached pool data shared from Discover
  const currentChainId = useMemo(() => {
    const fromQuery = params.get('chain') || params.get('network');
    if (fromQuery) return resolveChainId(fromQuery);
    if (pathInfo.chain) return resolveChainId(pathInfo.chain);
    if (targetPoolId.startsWith('bsc:') || queryToken?.startsWith('bsc:')) return 56;
    if (targetPoolId.startsWith('arc:') || queryToken?.startsWith('arc:')) return 5042;
    return 4663;
  }, [params, pathInfo.chain, targetPoolId, queryToken]);
  // Named to the backend only off Robinhood, which stays its default; an unknown slug never asks for a chain the bot lacks.
  const chainField = useMemo(
    () => (BOT_CHAIN_IDS.includes(currentChainId) && currentChainId !== 4663 ? { chainId: currentChainId } : {}),
    [currentChainId],
  );

  const cachedPool = useMemo(() => {
    return getCachedPoolForWorkstation(targetPoolId, queryPair, pathInfo.poolId, queryToken, pathInfo.token, currentChainId);
  }, [targetPoolId, queryPair, pathInfo.poolId, queryToken, pathInfo.token, currentChainId]);

  const routeToken = (routeParams?.address as string | undefined) ?? '';
  const DEFAULT_SYMBOL = '';
  const DEFAULT_QUOTE = '';

  const initialOrPathToken =
    queryToken ||
    cachedPool?.token?.address ||
    (pathInfo.token && pathInfo.token !== '[address]' ? pathInfo.token : '') ||
    routeToken ||
    initialAddress ||
    '';

  // Return to Discover if no specific pool or token is provided
  useEffect(() => {
    if (!targetPoolId && !initialOrPathToken && !cachedPool && !routeToken) {
      router.replace('/discover');
    }
    return () => {
      post('/api/pools/unfollow', {}).catch(() => null);
    };
  }, [targetPoolId, initialOrPathToken, cachedPool, routeToken, router]);

  const initialMcap = useMemo(() => {
    const raw = params.get('mcap');
    const val = raw ? Number(raw) : null;
    if (val !== null && !isNaN(val) && val > 0) return val;
    return cachedPool?.marketCap ?? null;
  }, [params, cachedPool]);

  const initialTvl = useMemo(() => {
    const raw = params.get('tvl');
    const val = raw ? Number(raw) : null;
    if (val !== null && !isNaN(val) && val >= 0) return val;
    return cachedPool?.discoverLiquidityUsd ?? cachedPool?.tvlUsd ?? null;
  }, [params, cachedPool]);

  const initialVol = useMemo(() => {
    const raw = params.get('vol');
    const val = raw ? Number(raw) : null;
    if (val !== null && !isNaN(val) && val >= 0) return val;
    return cachedPool?.volume24hUsd ?? null;
  }, [params, cachedPool]);

  const initialApr = useMemo(() => {
    const raw = params.get('apr');
    const val = raw ? Number(raw) : null;
    if (val !== null && !isNaN(val) && val >= 0) return val;
    return cachedPool?.feeAprPct ?? null;
  }, [params, cachedPool]);

  const initialPrice = useMemo(() => {
    const raw = params.get('price');
    const val = raw ? Number(raw) : null;
    if (val !== null && !isNaN(val) && val > 0) return val;
    return cachedPool?.priceNow ?? null;
  }, [params, cachedPool]);

  const initialSupply = useMemo(() => {
    const raw = params.get('supply');
    const val = raw ? Number(raw) : null;
    if (val !== null && !isNaN(val) && val > 0) return val;
    return cachedPool?.totalSupply ?? null;
  }, [params, cachedPool]);

  const [resolved, setResolved] = useState<{
    poolId: string;
    tokenAddress?: string;
    symbol: string;
    version: 'v3' | 'v4';
    protocol?: string;
    quote: string;
    quoteAddress?: string;
    fee: number;
    flags: string[];
    blocked: boolean;
    priceNow?: number;
    tvlUsd?: number | null;
    volume24hUsd?: number | null;
    mcapUsd?: number | null;
    fdvUsd?: number | null;
    totalSupply?: number | null;
    feeAprPct?: number | null;
    pairAddress?: string;
    searchedQuery?: string;
    volumeTimeframes?: { m5?: number; h1?: number; h6?: number; h24?: number } | null;
    txnsTimeframes?: {
      m5?: { buys: number; sells: number };
      h1?: { buys: number; sells: number };
      h6?: { buys: number; sells: number };
      h24?: { buys: number; sells: number };
    } | null;
    txns24h?: { buys: number; sells: number } | null;
    priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number } | null;
    tokenCreatedAt?: number | null;
    poolCreatedAt?: number | null;
  } | null>(() => {
    const initialPool = getCachedPoolForWorkstation(targetPoolId, queryPair, pathInfo.poolId, queryToken, pathInfo.token);
    if (!initialPool) return null;
    return {
      poolId: initialPool.id,
      tokenAddress: initialPool.token?.address,
      symbol: initialPool.token?.symbol ?? DEFAULT_SYMBOL,
      version: initialPool.version,
      protocol: initialPool.protocol || `uniswap_${initialPool.version}`,
      quote: initialPool.quote?.symbol ?? DEFAULT_QUOTE,
      quoteAddress: initialPool.quote?.address,
      fee: initialPool.fee,
      flags: initialPool.warnings ?? [],
      blocked: initialPool.verification !== 'contract-identified',
      priceNow: initialPool.priceNow ?? undefined,
      tvlUsd: initialPool.discoverLiquidityUsd ?? initialPool.tvlUsd,
      volume24hUsd: initialPool.volume24hUsd,
      mcapUsd: initialPool.marketCap,
      fdvUsd: initialPool.fdv,
      totalSupply: initialPool.totalSupply,
      feeAprPct: initialPool.feeAprPct,
      pairAddress: initialPool.pairAddress ?? (queryPair || initialPool.id),
      searchedQuery: (targetPoolId || queryToken || '').toLowerCase(),
      volumeTimeframes: (initialPool as any).volumeTimeframes ?? {
        m5: (initialPool as any).volume5mUsd ?? undefined,
        h1: (initialPool as any).volume1hUsd ?? undefined,
        h6: (initialPool as any).volume6hUsd ?? undefined,
        h24: initialPool.volume24hUsd ?? undefined,
      },
      txnsTimeframes: (initialPool as any).txns ?? (initialPool as any).txnsTimeframes ?? null,
      txns24h: (initialPool as any).txns24h ?? ((initialPool as any).txns?.h24 ?? null),
      priceChange: (initialPool as any).priceChange ?? null,
      tokenCreatedAt: initialPool.tokenCreatedAt ?? null,
      poolCreatedAt: initialPool.poolCreatedAt ?? initialPool.createdAt ?? null,
    };
  });

  useEffect(() => {
    if (cachedPool && (!resolved || resolved.poolId.toLowerCase() !== cachedPool.id.toLowerCase())) {
      setResolved({
        poolId: cachedPool.id,
        tokenAddress: cachedPool.token?.address,
        symbol: cachedPool.token?.symbol ?? DEFAULT_SYMBOL,
        version: cachedPool.version,
        protocol: cachedPool.protocol || `uniswap_${cachedPool.version}`,
        quote: cachedPool.quote?.symbol ?? DEFAULT_QUOTE,
        quoteAddress: cachedPool.quote?.address,
        fee: cachedPool.fee,
        flags: cachedPool.warnings ?? [],
        blocked: cachedPool.verification !== 'contract-identified',
        priceNow: cachedPool.priceNow ?? undefined,
        tvlUsd: cachedPool.discoverLiquidityUsd ?? cachedPool.tvlUsd,
        volume24hUsd: cachedPool.volume24hUsd,
        mcapUsd: cachedPool.marketCap,
        fdvUsd: cachedPool.fdv,
        totalSupply: cachedPool.totalSupply,
        feeAprPct: cachedPool.feeAprPct,
        pairAddress: cachedPool.pairAddress ?? (queryPair || cachedPool.id),
        searchedQuery: (targetPoolId || queryToken || '').toLowerCase(),
        volumeTimeframes: (cachedPool as any).volumeTimeframes ?? {
          m5: (cachedPool as any).volume5mUsd ?? undefined,
          h1: (cachedPool as any).volume1hUsd ?? undefined,
          h6: (cachedPool as any).volume6hUsd ?? undefined,
          h24: cachedPool.volume24hUsd ?? undefined,
        },
        txnsTimeframes: (cachedPool as any).txns ?? (cachedPool as any).txnsTimeframes ?? null,
        txns24h: (cachedPool as any).txns24h ?? ((cachedPool as any).txns?.h24 ?? null),
        priceChange: (cachedPool as any).priceChange ?? null,
        tokenCreatedAt: cachedPool.tokenCreatedAt ?? null,
        poolCreatedAt: cachedPool.poolCreatedAt ?? cachedPool.createdAt ?? null,
      });
    }
  }, [cachedPool, targetPoolId, queryToken]);
  const [bins, setBins] = useState<PoolBins | null>(() => {
    const id = targetPoolId || params.get('pool') || initialOrPathToken;
    return id ? (getCachedPoolBins<PoolBins>(id)?.data ?? null) : null;
  });
  const [binsLoading, setBinsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasExplicitPool = Boolean(targetPoolId);
  const hasExplicitMeta = Boolean(
    (initialOrPathToken && params.get('symbol') && params.get('quote')) ||
    (resolved && resolved.symbol && resolved.quote)
  );
  const [resolving, setResolving] = useState(() => {
    if (resolved) return false;
    if (isExplicitPoolId) return false;
    return !hasExplicitPool || !hasExplicitMeta;
  });

  const inFlightSearchRef = useRef<string | null>(null);
  const lastCompletedSearchRef = useRef<string | null>(null);
  const prevSearchQueryRef = useRef<string | null>(null);

  const isResolvedCurrent = useMemo(() => {
    if (!resolved) return false;
    const cleanResolvedPoolId = (resolved.poolId.includes(':') ? resolved.poolId.split(':').pop()! : resolved.poolId).trim().toLowerCase();
    const cleanResolvedPairAddress = resolved.pairAddress
      ? (resolved.pairAddress.includes(':') ? resolved.pairAddress.split(':').pop()! : resolved.pairAddress).trim().toLowerCase()
      : '';
    const cleanResolvedToken = resolved.tokenAddress ? resolved.tokenAddress.trim().toLowerCase() : '';

    if (targetPoolId) {
      const cleanTarget = (targetPoolId.includes(':') ? targetPoolId.split(':').pop()! : targetPoolId).trim().toLowerCase();
      return (
        cleanResolvedPoolId === cleanTarget ||
        cleanResolvedPairAddress === cleanTarget ||
        cleanResolvedToken === cleanTarget
      );
    }
    if (initialOrPathToken) {
      const cleanToken = (initialOrPathToken.includes(':') ? initialOrPathToken.split(':').pop()! : initialOrPathToken).trim().toLowerCase();
      return cleanResolvedToken === cleanToken;
    }
    return true;
  }, [resolved, targetPoolId, initialOrPathToken]);

  const activeResolved = isResolvedCurrent ? resolved : null;

  const token =
    initialOrPathToken ||
    activeResolved?.tokenAddress ||
    bins?.pool?.token?.address ||
    cachedPool?.token?.address ||
    '';

  useEffect(() => {
    const rawPool = targetPoolId || params.get('pool');
    const query = rawPool || initialOrPathToken;
    if (!query) return;

    const normalizedQuery = query.trim().toLowerCase();

    // Reset lastCompletedSearchRef when target query changes so route switches trigger fresh lookups
    if (prevSearchQueryRef.current !== normalizedQuery) {
      prevSearchQueryRef.current = normalizedQuery;
      lastCompletedSearchRef.current = null;
    }

    // Prevent duplicate network search loops for already in-flight or completed queries
    if (inFlightSearchRef.current === normalizedQuery || lastCompletedSearchRef.current === normalizedQuery) {
      return;
    }

    if (activeResolved || isExplicitPoolId) {
      lastCompletedSearchRef.current = normalizedQuery;
      return;
    }

    let active = true;
    const controller = new AbortController();
    inFlightSearchRef.current = normalizedQuery;
    setResolving(true);
    setLoadError(null);
    post<PoolSearch>('/api/pools/search', { query, chainId: currentChainId }, undefined, controller.signal)
      .then((res) => {
        if (!active || controller.signal.aborted) return;
        lastCompletedSearchRef.current = normalizedQuery;
        if (!res?.pools?.length) {
          if (!bins && !activeResolved && !cachedPool) {
            setLoadError('No pool found for this token address');
          }
          return;
        }
        const rawRequested = rawPool?.toLowerCase();
        const cleanRequested = rawRequested ? (rawRequested.includes(':') ? rawRequested.split(':').pop()! : rawRequested).trim() : null;
        const matchedId = (res as any).matchedPoolId ? ((res as any).matchedPoolId.includes(':') ? (res as any).matchedPoolId.split(':').pop()! : (res as any).matchedPoolId).trim().toLowerCase() : null;
        const targetToFind = cleanRequested || matchedId;
        const pool = targetToFind
          ? res.pools.find((p) => {
              const pId = (p.id.includes(':') ? p.id.split(':').pop()! : p.id).toLowerCase();
              const pPair = ((p as any).pairAddress ? ((p as any).pairAddress.includes(':') ? (p as any).pairAddress.split(':').pop()! : (p as any).pairAddress) : '').toLowerCase();
              return pId === targetToFind || pPair === targetToFind;
            })
          : res.pools[0];
        if (!pool) {
          if (!bins && !activeResolved && !cachedPool) {
            setLoadError('No pool found for this token address');
          }
          return;
        }
        const newResolved = {
          poolId: pool.id,
          tokenAddress: res.token?.address,
          symbol: res.token?.symbol ?? DEFAULT_SYMBOL,
          version: pool.version,
          protocol: pool.protocol || `uniswap_${pool.version}`,
          quote: pool.quote,
          quoteAddress: pool.quoteAddress,
          fee: pool.fee,
          flags: pool.warnings ?? [],
          blocked: Boolean(pool.blocked),
          priceNow: pool.priceNow,
          tvlUsd: pool.tvlUsd,
          volume24hUsd: pool.volume24hUsd,
          mcapUsd: pool.mcapUsd,
          fdvUsd: (pool as any).fdvUsd ?? null,
          totalSupply: pool.totalSupply ?? null,
          feeAprPct: pool.feeAprPct ?? null,
          pairAddress: (pool as any).pairAddress ?? (pool as any).poolAddress ?? pool.id,
          searchedQuery: normalizedQuery,
          volumeTimeframes: pool.volumeTimeframes ?? {
            m5: pool.volume5mUsd ?? undefined,
            h1: pool.volume1hUsd ?? undefined,
            h6: pool.volume6hUsd ?? undefined,
            h24: pool.volume24hUsd ?? undefined,
          },
          txnsTimeframes: pool.txns ?? null,
          txns24h: (pool as any).txns24h ?? (pool.txns?.h24 ?? null),
          priceChange: pool.priceChange ?? null,
          tokenCreatedAt: (pool as any).tokenCreatedAt ?? (res.token as any)?.tokenCreatedAt ?? (res.token as any)?.createdAt ?? null,
          poolCreatedAt: (pool as any).poolCreatedAt ?? (pool as any).createdAt ?? null,
        };
        setResolved(newResolved);
        setLoadError(null);

        // Normalize URL to /pool/<chain>/<pool contract> if opened via legacy /open?pool=...
        const activeChain = pathInfo.chain || 'robinhood';
        const cleanHref = `/pool/${activeChain}/${pool.id}`;
        if (typeof window !== 'undefined' && (window.location.pathname.startsWith('/open') || window.location.pathname.startsWith('/pools/'))) {
          window.history.replaceState(window.history.state, '', cleanHref);
        }

        if (typeof window !== 'undefined' && res.token?.symbol) {
          window.dispatchEvent(
            new CustomEvent('invictus:pool-meta', {
              detail: { symbol: res.token.symbol, quote: pool.quote },
            }),
          );
        }
      })
      .catch((err) => {
        if (!active || controller.signal.aborted) return;
        if (!bins && !activeResolved && !cachedPool) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load pool data');
        }
      })
      .finally(() => {
        if (active) {
          setResolving(false);
          inFlightSearchRef.current = null;
        }
      });
    return () => {
      active = false;
      controller.abort();
      if (inFlightSearchRef.current === normalizedQuery) {
        inFlightSearchRef.current = null;
      }
    };
  }, [initialOrPathToken, targetPoolId, pathInfo.chain, activeResolved, params]);

  const directPoolId =
    (targetPoolId && targetPoolId !== 'default' ? targetPoolId : '') ||
    (pathInfo.poolId && pathInfo.poolId !== 'default' ? pathInfo.poolId : '');

  const isTargetToken = Boolean(
    targetPoolId && (
      (token && targetPoolId.toLowerCase() === token.toLowerCase()) ||
      (activeResolved?.tokenAddress && targetPoolId.toLowerCase() === activeResolved.tokenAddress.toLowerCase()) ||
      targetPoolId === 'default'
    )
  );
  const poolId =
    (isTargetToken ? activeResolved?.poolId : targetPoolId) ||
    activeResolved?.poolId ||
    bins?.pool?.id ||
    pathInfo.poolId ||
    cachedPool?.id ||
    (params.get('pool') ?? '');

  const effectivePoolId = poolId || directPoolId;
  const targetPair = queryPair || activeResolved?.pairAddress || cachedPool?.pairAddress || undefined;
  const symbol =
    params.get('symbol') ??
    activeResolved?.symbol ??
    bins?.pool?.token?.symbol ??
    cachedPool?.token?.symbol ??
    DEFAULT_SYMBOL;
  const inferredVersion =
    cleanTarget.length === 42 ? 'v3' : cleanTarget.length === 66 ? 'v4' : undefined;
  const protocolParam =
    params.get('protocol') ||
    (params.get('v')
      ? `uniswap_${params.get('v')}`
      : (activeResolved?.protocol || cachedPool?.protocol || (inferredVersion ? `uniswap_${inferredVersion}` : 'uniswap_v4')));
  const protocolInfo = useMemo(
    () => parseProtocol(protocolParam, activeResolved?.version || cachedPool?.version || inferredVersion),
    [protocolParam, activeResolved?.version, cachedPool?.version, inferredVersion],
  );
  const version = protocolInfo.version === 'v4' ? 'v4' : 'v3';
  const quote =
    params.get('quote') ??
    activeResolved?.quote ??
    bins?.pool?.quote?.symbol ??
    bins?.pool?.quote?.key ??
    bins?.quoteKey ??
    cachedPool?.quote?.symbol ??
    DEFAULT_QUOTE;
  const fee = params.get('fee') !== null ? Number(params.get('fee')) : (activeResolved?.fee ?? cachedPool?.fee ?? 0);
  const flags = loudFlags(
    (params.get('flags') ?? (activeResolved?.flags ? activeResolved.flags.join(',') : (cachedPool?.warnings ?? []).join(','))).split(',').filter(Boolean)
  );
  const blocked = params.get('blocked') === '1' || (activeResolved?.blocked ?? (cachedPool ? cachedPool.verification !== 'contract-identified' : false));
  // "WETH" stands for the chain's wrapped gas token: WETH on Robinhood, WBNB on BNB Chain. Its deposits are paid in the native token.
  const isWethQuote = Boolean(
    bins?.quoteIsWrapper ||
    ['WETH', 'ETH', 'WBNB', 'BNB'].includes(quote?.toUpperCase() || '') ||
    ['WETH', 'WBNB'].includes(bins?.quoteKey?.toUpperCase() || ''),
  );
  const isStableQuote = Boolean(
    ['USDG', 'USDC', 'USDT', 'DAI'].includes(quote?.toUpperCase() || '') ||
    ['USDG', 'USDC', 'USDT', 'DAI'].includes(bins?.quoteKey?.toUpperCase() || ''),
  );

  const quoteCaParam = params.get('quoteCa') || params.get('quoteAddress') || activeResolved?.quoteAddress || cachedPool?.quote?.address;
  const quoteAddress =
    quoteCaParam ||
    bins?.quoteAddress ||
    bins?.pool?.quote?.address ||
    (isWethQuote
      ? '0x0bd7d308f8e1639fab988df18a8011f41eacad73'
      : quote === 'USDG'
        ? '0x5fc5360d0400a0fd4f2af552add042d716f1d168'
        : undefined);

  const { meta: tokenMeta } = useTokenMeta(token, symbol);
  const fallbackLogo = useTokenLogo(token, symbol);
  const tokenImageUrl = tokenMeta?.imageUrl ?? fallbackLogo ?? null;
  const quoteImageUrl = useTokenLogo(quoteAddress ?? null, quote);

  const isRwa = Boolean(
    cachedPool?.tokenOrigin === 'rwa' ||
    cachedPool?.launchpad?.toUpperCase() === 'RWA' ||
    cachedPool?.launchpad === 'PAIR RWA' ||
    cachedPool?.labels?.includes('rwa') ||
    cachedPool?.labels?.includes('RWA') ||
    cachedPool?.token?.name?.includes('Robinhood Token') ||
    cachedPool?.token?.name?.includes('Trust • Robinhood') ||
    symbol.toUpperCase().includes('RWA') ||
    quote.toUpperCase().includes('RWA'),
  );
  const launchpadName = cachedPool?.launchpad ?? null;
  const launchpadMeta = getLaunchpadInfo(launchpadName);

  // Sync document title with the active pair (e.g. "WETH / USDG | Invictus")
  const pairTitle = symbol && quote ? `${symbol} / ${quote}` : undefined;
  usePageTitle(pairTitle);

  useEffect(() => {
    if (typeof window !== 'undefined' && symbol && quote && symbol !== 'token') {
      window.dispatchEvent(
        new CustomEvent('invictus:pool-meta', {
          detail: { symbol, quote },
        }),
      );
    }
  }, [symbol, quote]);

  const queryChain = params.get('chain') || params.get('network');
  const detectedChain =
    queryChain ||
    (poolId?.startsWith('arc:') || token?.startsWith('arc:')
      ? 'arc'
      : poolId?.startsWith('bsc:') || token?.startsWith('bsc:')
        ? 'bnb'
        : currentChainId !== 4663
          ? resolveChainSlug(currentChainId)
          : undefined);
  // Where the bot does not swap (Arc, BNB Chain for now) a deposit goes in as the pool's own assets: no funding swap, no auto-balance.
  const chainSwaps = bins?.swaps ?? resolveChainId(detectedChain) === 4663;
  const fundingOptions = useMemo(
    () => (chainSwaps ? getChainFundingOptions(detectedChain) : []),
    [detectedChain, chainSwaps],
  );

  const action = useAction();
  const [pendingOperations, setPendingOperations] = useState<TrackedTransaction[]>([]);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let lastFetchedAt = 0;

    const fetchPending = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (inFlight) return;
      inFlight = true;
      try {
        const out = await get<{ actions?: unknown[]; transactions?: TrackedTransaction[]; pending?: TrackedTransaction[] }>('/api/pending');
        if (!active) return;
        lastFetchedAt = Date.now();
        const activeTxs = (out.transactions ?? out.pending ?? []).filter((t) => !t.done);
        setPendingOperations(activeTxs);
        if (!action.jobId && activeTxs.length > 0) {
          const match = activeTxs.find((t) => !t.poolId || cleanPoolId(t.poolId) === cleanPoolId(poolId)) || activeTxs[0];
          if (match?.jobId) {
            action.setJobId(match.jobId);
          }
        }
      } catch {} finally {
        inFlight = false;
      }
    };

    void fetchPending();

    const onMutate = () => {
      if (active) void fetchPending();
    };
    window.addEventListener('invictus:mutate', onMutate);
    window.addEventListener('invictus:action', onMutate);

    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchedAt > 3_000) {
        void fetchPending();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const intervalMs = pendingOperations.length > 0 ? 4_000 : 25_000;
      if (Date.now() - lastFetchedAt >= intervalMs) {
        void fetchPending();
      }
    }, 2_000);

    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('invictus:mutate', onMutate);
      window.removeEventListener('invictus:action', onMutate);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poolId, action.jobId, action.setJobId, pendingOperations.length]);

  const [amountQuote, setAmountQuote] = useState('');
  const [amountToken, setAmountToken] = useState('');
  const [fundWith, setFundWith] = useState<string | null>(() => {
    if (isWethQuote || symbol === 'ETH' || symbol === 'WETH') return 'eth';
    if (quote?.toUpperCase() === 'USDG' || symbol === 'USDG') return 'usdg';
    if (quote?.toUpperCase() === 'USDC' || symbol === 'USDC') return 'usdc';
    return null;
  });
  const [boundUnit, setBoundUnit] = useState<'price' | 'mcap'>('price');
  const [chartUnit, setChartUnit] = useState<'price' | 'mcap'>('price');
  // Each edge as a signed distance from spot, below negative and above
  // positive. Where the two sit decides the rest - which assets the range takes
  // and which boxes are open - the way Meteora's picker works.
  const [lowPct, setLowPct] = useState(() => {
    const q = params.get('lowPct');
    return q !== null && !isNaN(Number(q)) ? Number(q) : -10;
  });
  const [highPct, setHighPct] = useState(() => {
    const q = params.get('highPct');
    return q !== null && !isNaN(Number(q)) ? Number(q) : 10;
  });
  const [rangeMode, setRangeMode] = useState<'preset' | 'custom'>('preset');
  const [customLowPrice, setCustomLowPrice] = useState<number | null>(null);
  const [customHighPrice, setCustomHighPrice] = useState<number | null>(null);
  // The AI analysis shown on this pool, and the one last applied to the form.
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
  // The range an analysis put in the form, which for a single-sided one is anchored to the spot at apply time.
  const [appliedAnalysis, setAppliedAnalysis] = useState<{ id: number; low: number; high: number } | null>(null);
  const [zap, setZap] = useState(true);
  const [plan, setPlan] = useState<OpenPlan | null>(null);
  const [quoting, setQuoting] = useState(false);

  const amountQuoteRef = useRef(amountQuote);
  const amountTokenRef = useRef(amountToken);
  amountQuoteRef.current = amountQuote;
  amountTokenRef.current = amountToken;

  const hasHook = useMemo(() => {
    if (version !== 'v4') return false;
    if (bins !== undefined && bins !== null) {
      if (bins.hooks && bins.hooks !== '0x0000000000000000000000000000000000000000') return true;
      if (bins.warnings?.includes('HOOK')) return true;
      return false;
    }
    if (resolved?.flags?.includes('HOOK')) return true;
    if (flags.includes('HOOK')) return true;
    return false;
  }, [version, bins, resolved?.flags, flags]);

  const activeFlags = useMemo(() => {
    const list = new Set(flags);
    if (hasHook) list.add('HOOK');
    else list.delete('HOOK');
    return Array.from(list);
  }, [flags, hasHook]);

  const isTokenVerified = useMemo(() => {
    return !blocked && !activeFlags.some((f) => ['HONEYPOT', 'CANNOT_SELL', 'EXTREME_FEE'].includes(f));
  }, [blocked, activeFlags]);

  const [moved, setMoved] = useState<'up' | 'down' | null>(null);
  const [liveSpot, setLiveSpot] = useState<number | null>(null);
  const [liveTime, setLiveTime] = useState<number | undefined>(undefined);
  // A blocked pool can still be opened, but only after the reader has said out
  // loud that they read why it was flagged.
  const [accepted, setAccepted] = useState(false);
  const live = usePoolTick(effectivePoolId || null);
  const snap = useSnapshot();
  const gasReading = useGasReading();
  const { data: settingsData } = useFetch<SettingsPayload>('/api/settings');
  const [history, setHistory] = useState<History | null>(() => {
    const candidateKeys = [
      effectivePoolId,
      targetPoolId,
      targetPair,
      token,
      resolved?.tokenAddress,
      pathInfo.poolId,
      cachedPool?.id,
      cachedPool?.pairAddress,
      cachedPool?.token?.address,
      queryPair,
      params.get('pool'),
      params.get('pair'),
      initialOrPathToken,
    ].filter(Boolean) as string[];
    const exact = getCachedPoolHistory<History>(candidateKeys, '5m');
    if (exact?.data) return exact.data;
    const anyHist = getAnyCachedHistory<History>(candidateKeys, '5m');
    if (anyHist?.data?.candles?.length) {
      const sourceSec = parseIntervalSeconds(anyHist.interval);
      const targetSec = parseIntervalSeconds('5m');
      // Never downsample coarse bars to finer target
      if (sourceSec > 0 && targetSec >= sourceSec) {
        const resampled = resampleCandles(anyHist.data.candles, targetSec, sourceSec);
        if (resampled.length > 0) {
          return {
            ...anyHist.data,
            candles: resampled,
            interval: '5m',
            source: anyHist.data.source ? `${anyHist.data.source}:resampled` : 'resampled',
          };
        }
      }
      return null;
    }
    return null;
  });
  const historyRef = useRef<History | null>(history);
  historyRef.current = history;
  const positionsPanelRef = useRef<PanelImperativeHandle>(null);
  const [dockTab, setDockTab] = usePersistentTab<'this-pool' | 'all-pools'>({
    key: 'invictus:subnav:workstation:dockTab',
    defaultValue: 'this-pool',
    validValues: ['this-pool', 'all-pools'] as const,
    syncUrl: false,
  });
  const [intelTab, setIntelTab] = usePersistentTab<'overview' | 'token' | 'metrics'>({
    key: 'invictus:subnav:workstation:intelTab',
    defaultValue: 'overview',
    validValues: ['overview', 'token', 'metrics'] as const,
    syncUrl: false,
  });
  const [tokenTf, setTokenTf] = useState<'5m' | '1h' | '6h' | '24h'>('24h');
  const NO_CANDLES = useRef<Candle[]>([]).current;
  const [interval, setInterval_] = useState<TimeframeKey>('5m');
  const [historyLoading, setHistoryLoading] = useState(false);

  // Client-Side Instant (0ms) Timeframe Switching
  const handleTimeframeChange = useCallback((newInterval: TimeframeKey) => {
    const activePoolId = effectivePoolId;
    setInterval_(newInterval);
    if (!activePoolId || activePoolId === 'default') return;

    const candidateKeys = [
      activePoolId,
      targetPoolId,
      targetPair,
      token,
      resolved?.tokenAddress,
      pathInfo.poolId,
      cachedPool?.id,
      cachedPool?.pairAddress,
      cachedPool?.token?.address,
      queryPair,
      params.get('pool'),
      params.get('pair'),
      initialOrPathToken,
    ].filter(Boolean) as string[];

    // 1. If exact timeframe is cached in getCachedPoolHistory(candidateKeys, interval), use it immediately
    const exact = getCachedPoolHistory<History>(candidateKeys, newInterval);
    if (exact) {
      setHistory(exact.data);
      setHistoryLoading(false);
      return;
    }

    // 1.5 If existing history in memory has timeframes bundle containing newInterval, use it immediately
    const currentHist = historyRef.current;
    const bundleCandles = (currentHist as any)?.timeframes?.[newInterval];
    if (bundleCandles && bundleCandles.length > 0) {
      const derivedHistory: History = {
        ...currentHist!,
        candles: bundleCandles,
        earliestTime: bundleCandles[0]?.time ?? null,
      };
      setHistory(derivedHistory);
      setHistoryLoading(false);
      cachePoolHistory(candidateKeys, newInterval, derivedHistory);
      return;
    }

    // 2. Check getAnyCachedHistory(candidateKeys, interval) or existing history.candles
    const anyCached = getAnyCachedHistory<History>(candidateKeys, newInterval);
    const candidateHistory = anyCached?.data || (currentHist?.candles?.length ? currentHist : null);
    const sourceInterval = anyCached?.interval || (currentHist?.interval ? String(currentHist.interval) : interval);

    const targetSeconds = parseIntervalSeconds(newInterval);
    const sourceSeconds = sourceInterval ? parseIntervalSeconds(sourceInterval) : 0;

    // If any lower timeframe exists, use resampleCandles to derive target candles in O(N) client-side
    // Never downsample coarse bars into finer target
    if (candidateHistory?.candles?.length && sourceSeconds > 0 && targetSeconds >= sourceSeconds) {
      const resampled = resampleCandles(candidateHistory.candles, targetSeconds, sourceSeconds);
      if (resampled.length > 0) {
        const derivedHistory: History = {
          ...candidateHistory,
          candles: resampled,
          interval: newInterval,
          source: candidateHistory.source ? `${candidateHistory.source}:resampled` : 'resampled',
        };
        setHistory(derivedHistory);
        setHistoryLoading(false);
        // Multi-timeframe caching: index resampled history across candidate keys so it is immediately available
        cachePoolHistory(candidateKeys, newInterval, derivedHistory);
        return;
      }
    }

    // 3. Neither cached nor resampleable: set loading indicator while network fetches
    setHistoryLoading(true);
  }, [effectivePoolId, targetPoolId, targetPair, token, resolved?.tokenAddress, pathInfo.poolId, cachedPool?.id, cachedPool?.pairAddress, cachedPool?.token?.address, queryPair, params.get('pool'), params.get('pair'), initialOrPathToken, interval]);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [claimingFees, setClaimingFees] = useState(false);
  const [chartRefreshing, setChartRefreshing] = useState(false);
  const lastPrice = useRef(0);
  const presetsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollState = useCallback(() => {
    const el = presetsRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  const scrollPresets = useCallback((direction: 'left' | 'right') => {
    if (presetsRef.current) {
      presetsRef.current.scrollBy({
        left: direction === 'left' ? -100 : 100,
        behavior: 'smooth',
      });
      setTimeout(checkScrollState, 350);
    }
  }, [checkScrollState]);

  useEffect(() => {
    const el = presetsRef.current;
    if (!el) return;

    checkScrollState();
    const timer = setTimeout(checkScrollState, 60);

    el.addEventListener('scroll', checkScrollState, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        checkScrollState();
      });
      ro.observe(el);
    }
    window.addEventListener('resize', checkScrollState);

    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', checkScrollState);
      window.removeEventListener('resize', checkScrollState);
      ro?.disconnect();
    };
  }, [checkScrollState]);

  const ready = Boolean(effectivePoolId && effectivePoolId !== 'default' && (directPoolId || token));

  // Clear live spot override, timestamp, and candles if pool changes
  useEffect(() => {
    setLiveSpot(null);
    setLiveTime(undefined);
    setHistory(null);
    lastPrice.current = 0;
    setBins(null);
    setPlan(null);
    setFocusedPositionKey(null);
  }, [effectivePoolId]);

  // The feed wins: it arrives on every swap, while the poll is a fallback for
  // an RPC with no WebSocket. Robust fallback chain: liveSpot -> historySpot -> live -> bins -> cachedPool -> resolved -> initialPrice
  const rawSpot =
    liveSpot ??
    live?.price ??
    bins?.priceNow ??
    cachedPool?.priceNow ??
    resolved?.priceNow ??
    initialPrice ??
    0;

  // The gas token's price on the pool's chain (ETH, or BNB on BNB Chain): what a native or wrapped deposit is worth.
  const ethPrice =
    bins?.nativeUsd && bins.nativeUsd > 0
      ? bins.nativeUsd
      : bins?.ethUsd && bins.ethUsd > 0 && (bins.chainId ?? 4663) === 4663
      ? bins.ethUsd
      : snap?.ethUsd && snap.ethUsd > 0
      ? snap.ethUsd
      : isStableQuote && (symbol === 'ETH' || symbol === 'WETH') && rawSpot > 0
      ? rawSpot
      : cachedPool?.priceUsd && (symbol === 'ETH' || symbol === 'WETH') && cachedPool.priceUsd > 0
      ? cachedPool.priceUsd
      : 0;

  // Quote USD Price: USDG/USDC is 1; read authoritative quotePriceUsd from history or bins first
  const quoteUsdPrice = useMemo(() => {
    const qUpper = (quote || '').toUpperCase();
    if (qUpper === 'USDG' || qUpper === 'USDC' || qUpper === 'USDT' || qUpper === 'DAI') return 1;

    // Top priority: Read authoritative quotePriceUsd from history or bins
    if (typeof history?.quotePriceUsd === 'number' && history.quotePriceUsd > 0) {
      return history.quotePriceUsd;
    }
    if (typeof bins?.quotePriceUsd === 'number' && bins.quotePriceUsd > 0) {
      return bins.quotePriceUsd;
    }
    if (typeof (bins as any)?.quoteUsd === 'number' && (bins as any).quoteUsd > 0) {
      return (bins as any).quoteUsd;
    }

    if (isWethQuote && ethPrice > 0) return ethPrice;
    if (bins?.priceUsd && rawSpot > 0 && isWethQuote) return bins.priceUsd / rawSpot;
    if (bins?.priceUsd && rawSpot > 0 && Math.abs(bins.priceUsd - rawSpot) / rawSpot > 0.001) {
      return bins.priceUsd / rawSpot;
    }
    if (cachedPool?.priceUsd && rawSpot > 0 && Math.abs(cachedPool.priceUsd - rawSpot) / rawSpot > 0.001) {
      return cachedPool.priceUsd / rawSpot;
    }
    if (isWethQuote) return ethPrice;
    return null;
  }, [quote, history?.quotePriceUsd, bins?.quotePriceUsd, (bins as any)?.quoteUsd, isWethQuote, ethPrice, bins?.priceUsd, cachedPool?.priceUsd, rawSpot]);

  const chartQuoteMult = isStableQuote ? 1 : (quoteUsdPrice && quoteUsdPrice > 0 ? quoteUsdPrice : 1);

  const dynamicGasReserveEth = useMemo(() => {
    return calculateDynamicGasReserveEth(
      gasReading,
      ethPrice,
      Number(settingsData?.values?.priorityFeePct ?? 150),
      Number(settingsData?.values?.gasLimitPct ?? 130),
      typeof settingsData?.values?.gasReserveEth === 'number' ? settingsData.values.gasReserveEth : null,
    );
  }, [
    gasReading,
    ethPrice,
    settingsData?.values?.priorityFeePct,
    settingsData?.values?.gasLimitPct,
    settingsData?.values?.gasReserveEth,
  ]);

  // Authoritative spot price anchored by historical candle close to prevent upward wicks on mount
  const historySpot = useMemo(() => {
    const candles = history?.candles;
    if (!candles || candles.length === 0) return null;
    const last = candles[candles.length - 1];
    if (last && last.close > 0 && chartQuoteMult > 0) {
      return last.close / chartQuoteMult;
    }
    return null;
  }, [history?.candles, chartQuoteMult]);

  const spot = liveSpot ?? (rawSpot > 0 ? rawSpot : (historySpot ?? 0));

  // Anchor lastPrice to historySpot immediately when historical chart is available
  useEffect(() => {
    if (historySpot && historySpot > 0) {
      if (lastPrice.current === 0 || Math.abs(lastPrice.current - historySpot) / historySpot > 0.5) {
        lastPrice.current = historySpot;
      }
    }
  }, [historySpot]);

  const movedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevSpotRef = useRef<number>(spot);
  useEffect(() => {
    if (prevSpotRef.current > 0 && spot > 0 && prevSpotRef.current !== spot) {
      const dir = spot > prevSpotRef.current ? 'up' : 'down';
      setMoved(dir);
      if (movedTimerRef.current) clearTimeout(movedTimerRef.current);
      movedTimerRef.current = setTimeout(() => setMoved(null), 2000);
    }
    prevSpotRef.current = spot;
  }, [spot]);
  const edgeAt = useCallback((pct: number): number => (spot > 0 ? spot * (1 + pct / 100) : 0), [spot]);
  const pctOf = useCallback((price: number): number => (spot > 0 ? (price / spot - 1) * 100 : 0), [spot]);

  // Absolute prices for boundaries:
  // In custom mode: locked to user-specified prices; DOES NOT automatically shift on spot changes.
  // In preset mode: tracks spot * (1 + pct / 100).
  const lowPrice = rangeMode === 'custom' && customLowPrice !== null
    ? customLowPrice
    : edgeAt(lowPct);
  const highPrice = rangeMode === 'custom' && customHighPrice !== null
    ? customHighPrice
    : edgeAt(highPct);

  const effectiveLowPct = rangeMode === 'custom' && customLowPrice !== null
    ? pctOf(customLowPrice)
    : lowPct;
  const effectiveHighPct = rangeMode === 'custom' && customHighPrice !== null
    ? pctOf(customHighPrice)
    : highPct;

  const hasQuote = Number(amountQuote) > 0;
  const hasToken = Number(amountToken) > 0;
  const side: Side = effectiveHighPct <= 0 ? 'down' : effectiveLowPct >= 0 ? 'up' : 'both';

  const inFlightBinsRef = useRef<Map<string, Promise<PoolBins>>>(new Map());
  const inFlightHistoryRef = useRef<Map<string, Promise<History>>>(new Map());
  const isResolvedCurrentRef = useRef(isResolvedCurrent);
  isResolvedCurrentRef.current = isResolvedCurrent;
  const targetPoolIdRef = useRef(targetPoolId);
  targetPoolIdRef.current = targetPoolId;

  // One request draws the curve and refreshes pool state.
  // Pool data does NOT depend on local slider dragging: dragging operates locally in memory at 60 FPS.
  const load = useCallback(async (signal?: AbortSignal, force = false): Promise<void> => {
    const activePoolId = effectivePoolId;
    if (!ready || !activePoolId || activePoolId === 'default') return;
    setBinsLoading(true);
    setLoadError(null);
    const cached = getCachedPoolBins<PoolBins>(activePoolId);
    const isComplete = Boolean(
      cached?.data &&
      (cached.data.marketCap || (cached.data as any).mcap) &&
      (cached.data.volume24hUsd != null && cached.data.volume24hUsd > 0) &&
      cached.data.volumeTimeframes
    );
    if (!force && cached) {
      if (cached.data.priceNow && !historySpot && lastPrice.current === 0) lastPrice.current = cached.data.priceNow;
      setBins(cached.data);
      if (cached.isFresh && isComplete) {
        setLoadError(null);
        setBinsLoading(false);
        return;
      }
    }

    const flightKey = `${activePoolId.toLowerCase()}:${version}`;
    const existingFlight = inFlightBinsRef.current.get(flightKey);
    if (existingFlight && !force) {
      try {
        const r = await existingFlight;
        if (signal?.aborted) return;
        if (!historySpot && lastPrice.current === 0) lastPrice.current = r.priceNow;
        setBins(r);
        setLoadError(null);
        setBinsLoading(false);
        return;
      } catch {
        inFlightBinsRef.current.delete(flightKey);
      }
    }

    const targetPair = queryPair || activeResolved?.pairAddress || cachedPool?.pairAddress || undefined;
    const promise = post<PoolBins>(
      '/api/pools/bins',
      {
        ...chainField,
        token: token || undefined,
        poolId: activePoolId,
        pairAddress: targetPair,
        version,
      },
      undefined,
      signal,
    );
    inFlightBinsRef.current.set(flightKey, promise);

    try {
      const r = await promise;
      if (signal?.aborted) return;
      if (!historySpot && lastPrice.current === 0) lastPrice.current = r.priceNow;
      setBins(r);
      cachePoolBins(activePoolId, r);
      setLoadError(null);
      if (r.pool) {
        const poolObj = r.pool;
        const quoteKey = poolObj.quote?.key ?? poolObj.quote?.symbol ?? r.quoteKey ?? DEFAULT_QUOTE;
        const quoteAddr = poolObj.quote?.address ?? r.quoteAddress;
        const flags = (r.warnings && r.warnings.length > 0) ? r.warnings : (poolObj.warnings ?? []);

        setResolved((prev) => ({
          poolId: poolObj.id || activePoolId,
          tokenAddress: poolObj.token?.address ?? prev?.tokenAddress,
          symbol: poolObj.token?.symbol ?? prev?.symbol ?? DEFAULT_SYMBOL,
          version: poolObj.version ?? version,
          protocol: poolObj.protocol || `uniswap_${poolObj.version ?? version}`,
          quote: quoteKey,
          quoteAddress: quoteAddr ?? prev?.quoteAddress,
          fee: poolObj.fee ?? r.fee ?? prev?.fee ?? 0,
          flags: flags.length > 0 ? flags : (prev?.flags ?? []),
          blocked: Boolean(poolObj.blocked ?? prev?.blocked ?? false),
          priceNow: r.priceNow ?? poolObj.priceTokenInQuote ?? prev?.priceNow,
          tvlUsd: r.tvlUsd ?? poolObj.tvlUsd ?? prev?.tvlUsd,
          volume24hUsd: r.volume24hUsd ?? poolObj.volume24hUsd ?? prev?.volume24hUsd,
          mcapUsd: r.mcap ?? poolObj.marketCap ?? prev?.mcapUsd,
          fdvUsd: r.fdv ?? poolObj.fdv ?? prev?.fdvUsd,
          totalSupply: r.supply ?? poolObj.totalSupply ?? prev?.totalSupply,
          feeAprPct: r.feeAprPct ?? (poolObj as any)?.feeAprPct ?? prev?.feeAprPct ?? null,
          pairAddress: (poolObj as any)?.pairAddress ?? prev?.pairAddress ?? targetPair ?? poolObj.id ?? activePoolId,
          searchedQuery: (targetPoolIdRef.current || activePoolId).toLowerCase(),
          volumeTimeframes: r.volumeTimeframes ?? poolObj.volumeTimeframes ?? prev?.volumeTimeframes ?? null,
          txnsTimeframes: r.txnsTimeframes ?? poolObj.txnsTimeframes ?? prev?.txnsTimeframes ?? null,
          txns24h: r.txns24h ?? poolObj.txns24h ?? prev?.txns24h ?? null,
          priceChange: r.priceChange ?? poolObj.priceChange ?? prev?.priceChange ?? null,
          tokenCreatedAt: r.tokenCreatedAt ?? (poolObj as any)?.tokenCreatedAt ?? prev?.tokenCreatedAt ?? null,
          poolCreatedAt: r.poolCreatedAt ?? (poolObj as any)?.poolCreatedAt ?? (poolObj as any)?.createdAt ?? prev?.poolCreatedAt ?? null,
        }));
        setResolving(false);

        try {
          cachePoolForWorkstation({
            id: poolObj.id || activePoolId,
            version: poolObj.version ?? version,
            pairAddress: (poolObj as any)?.pairAddress ?? targetPair ?? poolObj.id ?? activePoolId,
            canonicalId: poolObj.id || activePoolId,
            chainId: currentChainId,
            protocol: poolObj.protocol || `uniswap_${poolObj.version ?? version}`,
            dexId: poolObj.protocol || `uniswap_${poolObj.version ?? version}`,
            token: poolObj.token,
            quote: poolObj.quote,
            token0: poolObj.token?.address ?? '',
            token1: quoteAddr ?? '',
            quoteIsToken0: false,
            quoteIsNative: quoteKey === 'ETH' || quoteKey === 'WETH',
            fee: poolObj.fee ?? r.fee ?? 0,
            effectiveFee: poolObj.fee ?? r.fee ?? 0,
            feePct: (poolObj.fee ?? r.fee ?? 0) / 10000,
            tickSpacing: r.tickSpacing ?? 10,
            binStepPct: r.binStepPct ?? 0,
            tick: r.tick ?? null,
            hooks: '',
            labels: [],
            warnings: flags,
            verification: 'contract-identified',
            priceNow: r.priceNow ?? poolObj.priceTokenInQuote ?? null,
            priceUsd: r.priceUsd ?? null,
            tvlUsd: r.tvlUsd ?? poolObj.tvlUsd ?? null,
            volume24hUsd: r.volume24hUsd ?? poolObj.volume24hUsd ?? null,
            feeAprPct: r.feeAprPct ?? null,
            marketCap: r.mcap ?? poolObj.marketCap ?? null,
            fdv: r.fdv ?? poolObj.fdv ?? null,
            totalSupply: r.supply ?? poolObj.totalSupply ?? null,
            createdAt: r.poolCreatedAt ?? (poolObj as any)?.poolCreatedAt ?? (poolObj as any)?.createdAt ?? null,
            poolCreatedAt: r.poolCreatedAt ?? (poolObj as any)?.poolCreatedAt ?? (poolObj as any)?.createdAt ?? null,
            tokenCreatedAt: r.tokenCreatedAt ?? (poolObj as any)?.tokenCreatedAt ?? null,
          } as any);
        } catch {
          // ignore
        }

        const cleanHref = poolWorkstationHref({
          id: poolObj.id || activePoolId,
          pairAddress: (poolObj as any)?.pairAddress ?? targetPair,
          chainId: currentChainId,
        });
        if (typeof window !== 'undefined' && (window.location.pathname.startsWith('/open') || window.location.pathname.startsWith('/pools/'))) {
          window.history.replaceState(window.history.state, '', cleanHref);
        }

        if (typeof window !== 'undefined' && poolObj.token?.symbol) {
          window.dispatchEvent(
            new CustomEvent('invictus:pool-meta', {
              detail: { symbol: poolObj.token.symbol, quote: quoteKey },
            }),
          );
        }
      }
    } catch (e) {
      if (signal?.aborted) return;
      // Keep the last drawing rather than blanking the page on one bad poll;
      // the error only shows while there is nothing drawn at all.
      if (!bins && !activeResolved && !cachedPool) {
        setLoadError(e instanceof Error ? e.message : 'could not read this pool');
      }
    } finally {
      setBinsLoading(false);
      inFlightBinsRef.current.delete(flightKey);
    }
  }, [ready, token, effectivePoolId, version, pathInfo.chain, queryPair, activeResolved?.pairAddress, cachedPool?.pairAddress, historySpot]);


  const handleRefreshChart = useCallback(async () => {
    const activePoolId = effectivePoolId;
    if (chartRefreshing || !ready || !activePoolId || activePoolId === 'default') return;
    setChartRefreshing(true);
    const candidateKeys = [
      activePoolId,
      targetPoolId,
      targetPair,
      token,
      resolved?.tokenAddress,
      pathInfo.poolId,
      cachedPool?.id,
      cachedPool?.pairAddress,
      cachedPool?.token?.address,
      queryPair,
      params.get('pool'),
      params.get('pair'),
      initialOrPathToken,
    ].filter(Boolean) as string[];
    try {
      let h: History | null = null;

      // 1. Primary/liquid base-token market source is intentional (/api/pools/history)
      // Workstation chart displays BASE TOKEN market price, not the selected pool itself.
      try {
        h = await post<History>('/api/pools/history', {
          ...chainField,
          token: token || undefined,
          poolId: activePoolId,
          pairAddress: targetPair || undefined,
          version,
          interval,
        });
      } catch {
        // Fall back to V2 endpoint if legacy fetch fails
      }

      // 2. V2 fallback: ONLY for V2-supported timeframes (1m, 5m, 15m, 1h, 4h, 1d) — route 1s/15s only to legacy
      if ((!h || !h.candles || h.candles.length === 0) && isV2SupportedTimeframe(interval) && activePoolId) {
        try {
          const v2Target = h?.authoritativePoolId || activePoolId;
          const v2Key = v2Target.includes(':') ? v2Target : `${currentChainId}:${v2Target}`;
          const v2Res = await get<{ data: any[] }>(
            `/api/v2/pools/${encodeURIComponent(v2Key)}/candles?timeframe=${encodeURIComponent(interval)}&limit=300&chainId=${currentChainId}`,
          );
          if (v2Res?.data && v2Res.data.length > 0) {
            const mapped = mapV2Candles(v2Res.data);
            h = {
              candles: mapped,
              earliestTime: mapped[0]?.time ?? null,
              mcapPerUnit: h?.mcapPerUnit ?? null,
              quotePriceUsd: h?.quotePriceUsd ?? null,
              ethUsd: h?.ethUsd ?? null,
              interval,
              source: 'v2',
              currency: 'USD',
              authoritativePoolId: v2Target,
            };
          }
        } catch {
          // Ignore
        }
      }

      if (h?.candles) {
        const existing = getCachedPoolHistory<History>(candidateKeys, interval);
        const mergedCandles = existing
          ? mergeCandles(existing.data.candles, h.candles)
          : h.candles;
        const fullHistory: History = {
          ...h,
          candles: mergedCandles,
          interval,
          source: h.source || (isV2SupportedTimeframe(interval) ? 'v2' : 'legacy'),
          currency: h.currency || 'USD',
          authoritativePoolId: h.authoritativePoolId ?? null,
        };
        cachePoolHistory(candidateKeys, interval, fullHistory);
        setHistory(fullHistory);
        if (fullHistory.candles.length > 0) {
          const lastCandle = fullHistory.candles[fullHistory.candles.length - 1];
          if (lastCandle && lastCandle.close > 0 && chartQuoteMult > 0) {
            const histQuotePrice = lastCandle.close / chartQuoteMult;
            if (lastPrice.current === 0 || Math.abs(lastPrice.current - histQuotePrice) / histQuotePrice > 0.5) {
              lastPrice.current = histQuotePrice;
            }
          }
        }
      }
    } catch {
      // Ignore
    } finally {
      setChartRefreshing(false);
    }
  }, [chartRefreshing, ready, token, effectivePoolId, targetPoolId, targetPair, resolved?.tokenAddress, pathInfo.poolId, cachedPool, queryPair, params, initialOrPathToken, version, interval, chartQuoteMult]);

  // Primary Tier 1: Historical chart candles are retrieved FIRST and cached to anchor spot price and prevent upward wicks
  useEffect(() => {
    const activePoolId = effectivePoolId;
    if (!ready || !activePoolId || activePoolId === 'default') return;
    let active = true;
    const controller = new AbortController();

    const candidateKeys = [
      activePoolId,
      targetPoolId,
      targetPair,
      token,
      resolved?.tokenAddress,
      pathInfo.poolId,
      cachedPool?.id,
      cachedPool?.pairAddress,
      cachedPool?.token?.address,
      queryPair,
      params.get('pool'),
      params.get('pair'),
      initialOrPathToken,
    ].filter(Boolean) as string[];

    // 1. Instant cache restore if available for this specific timeframe
    const cached = getCachedPoolHistory<History>(candidateKeys, interval);
    let hasInstantData = false;

    if (cached) {
      setHistory(cached.data);
      setHistoryLoading(false);
      hasInstantData = true;
      if (cached.data.candles?.length > 0) {
        const lastCandle = cached.data.candles[cached.data.candles.length - 1];
        if (lastCandle && lastCandle.close > 0 && chartQuoteMult > 0) {
          const histQuotePrice = lastCandle.close / chartQuoteMult;
          if (lastPrice.current === 0 || Math.abs(lastPrice.current - histQuotePrice) / histQuotePrice > 0.5) {
            lastPrice.current = histQuotePrice;
          }
        }
      }
    } else if ((historyRef.current as any)?.timeframes?.[interval]?.length) {
      const currentHist = historyRef.current!;
      const bundleCandles = (currentHist as any).timeframes[interval]!;
      const derivedHistory: History = {
        ...currentHist,
        candles: bundleCandles,
        earliestTime: bundleCandles[0]?.time ?? null,
      };
      setHistory(derivedHistory);
      setHistoryLoading(false);
      hasInstantData = true;
      cachePoolHistory(candidateKeys, interval, derivedHistory);
      const lastCandle = bundleCandles[bundleCandles.length - 1];
      if (lastCandle && lastCandle.close > 0 && chartQuoteMult > 0) {
        const histQuotePrice = lastCandle.close / chartQuoteMult;
        if (lastPrice.current === 0 || Math.abs(lastPrice.current - histQuotePrice) / histQuotePrice > 0.5) {
          lastPrice.current = histQuotePrice;
        }
      }
    } else {
      // 2. Fallback: check if ANY lower timeframe exists in cache or current state
      const anyCached = getAnyCachedHistory<History>(candidateKeys, interval);
      const currentHist = historyRef.current;
      const candidateHistory = anyCached?.data || (currentHist?.candles?.length ? currentHist : null);
      const sourceInterval = anyCached?.interval || (currentHist?.interval ? String(currentHist.interval) : undefined);

      const targetSeconds = parseIntervalSeconds(interval);
      const sourceSeconds = sourceInterval ? parseIntervalSeconds(sourceInterval) : 0;

      // Never downsample coarse data to finer target
      if (candidateHistory?.candles?.length && sourceSeconds > 0 && targetSeconds >= sourceSeconds) {
        const resampled = resampleCandles(candidateHistory.candles, targetSeconds, sourceSeconds);
        if (resampled.length > 0) {
          const derivedHistory: History = {
            ...candidateHistory,
            candles: resampled,
            interval,
            source: candidateHistory.source ? `${candidateHistory.source}:resampled` : 'resampled',
          };
          setHistory(derivedHistory);
          setHistoryLoading(false);
          hasInstantData = true;
          cachePoolHistory(candidateKeys, interval, derivedHistory);
          const lastCandle = resampled[resampled.length - 1];
          if (lastCandle && lastCandle.close > 0 && chartQuoteMult > 0) {
            const histQuotePrice = lastCandle.close / chartQuoteMult;
            if (lastPrice.current === 0 || Math.abs(lastPrice.current - histQuotePrice) / histQuotePrice > 0.5) {
              lastPrice.current = histQuotePrice;
            }
          }
        }
      }

      if (!hasInstantData) {
        setHistoryLoading(true);
      }
    }

    const pull = async (isBackground = false): Promise<void> => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const flightKey = `${activePoolId.toLowerCase()}:${interval}`;
      const existingFlight = inFlightHistoryRef.current.get(flightKey);
      if (existingFlight) {
        try {
          const h = await existingFlight;
          if (!active || controller.signal.aborted) return;
          const existing = getCachedPoolHistory<History>(candidateKeys, interval);
          const mergedCandles = existing
            ? mergeCandles(existing.data.candles, h.candles)
            : h.candles;
          const fullHistory: History = {
            ...h,
            candles: mergedCandles,
            interval,
            source: h.source || (isV2SupportedTimeframe(interval) ? 'v2' : 'legacy'),
            currency: h.currency || 'USD',
          };
          cachePoolHistory(candidateKeys, interval, fullHistory);
          setHistory(fullHistory);
          if (fullHistory.candles.length > 0) {
            const lastCandle = fullHistory.candles[fullHistory.candles.length - 1];
            if (lastCandle && lastCandle.close > 0 && chartQuoteMult > 0) {
              const histQuotePrice = lastCandle.close / chartQuoteMult;
              if (lastPrice.current === 0 || Math.abs(lastPrice.current - histQuotePrice) / histQuotePrice > 0.5) {
                lastPrice.current = histQuotePrice;
              }
            }
          }
          if (!isBackground) setHistoryLoading(false);
          return;
        } catch {
          inFlightHistoryRef.current.delete(flightKey);
        }
      }

      const fetchChartHistory = async (): Promise<History> => {
        let h: History | null = null;

        // Primary: /api/pools/history (intentional base-token market price source)
        try {
          h = await post<History>(
            '/api/pools/history',
            {
              ...chainField,
              token: token || undefined,
              poolId: activePoolId,
              pairAddress: targetPair || undefined,
              version,
              interval,
            },
            undefined,
            controller.signal,
          );
        } catch (err) {
          if (controller.signal.aborted) throw err;
          // Fall through to V2 fallback if timeframe supported
        }

        // If legacy returned valid candles, return it directly
        if (h && h.candles && h.candles.length > 0) {
          return h;
        }

        // V2 fallback: ONLY for V2-supported timeframes (1m, 5m, 15m, 1h, 4h, 1d) — route 1s/15s only to legacy
        if (isV2SupportedTimeframe(interval) && activePoolId) {
          try {
            const v2Target = h?.authoritativePoolId || activePoolId;
            const v2Key = v2Target.includes(':') ? v2Target : `${currentChainId}:${v2Target}`;
            const v2Res = await get<{ data: any[] }>(
              `/api/v2/pools/${encodeURIComponent(v2Key)}/candles?timeframe=${encodeURIComponent(interval)}&limit=300&chainId=${currentChainId}`,
              controller.signal,
            );
            if (v2Res?.data && v2Res.data.length > 0) {
              const mapped = mapV2Candles(v2Res.data);
              return {
                candles: mapped,
                earliestTime: mapped[0]?.time ?? null,
                mcapPerUnit: h?.mcapPerUnit ?? null,
                quotePriceUsd: h?.quotePriceUsd ?? null,
                ethUsd: h?.ethUsd ?? null,
                interval,
                source: 'v2',
                currency: 'USD',
              };
            }
          } catch {
            // Ignore
          }
        }

        if (h) return h;
        throw new Error('Failed to fetch candles');
      };

      const promise = fetchChartHistory();
      inFlightHistoryRef.current.set(flightKey, promise);

      try {
        const h = await promise;
        if (!active || controller.signal.aborted) return;
        const existing = getCachedPoolHistory<History>(candidateKeys, interval);
        const mergedCandles = existing
          ? mergeCandles(existing.data.candles, h.candles)
          : h.candles;
        const fullHistory: History = {
          ...h,
          candles: mergedCandles,
          interval,
          source: h.source || (isV2SupportedTimeframe(interval) ? 'v2' : 'legacy'),
          currency: h.currency || 'USD',
        };
        cachePoolHistory(candidateKeys, interval, fullHistory);
        setHistory(fullHistory);
        if (fullHistory.candles.length > 0) {
          const lastCandle = fullHistory.candles[fullHistory.candles.length - 1];
          if (lastCandle && lastCandle.close > 0 && chartQuoteMult > 0) {
            const histQuotePrice = lastCandle.close / chartQuoteMult;
            if (lastPrice.current === 0 || Math.abs(lastPrice.current - histQuotePrice) / histQuotePrice > 0.5) {
              lastPrice.current = histQuotePrice;
            }
          }
        }
      } catch {
        // The bin chart still works without a line; no need to shout about it.
      } finally {
        inFlightHistoryRef.current.delete(flightKey);
        if (active && !isBackground) setHistoryLoading(false);
      }
    };

    if (!cached?.isFresh) {
      void pull(hasInstantData);
    }

    const onCandle = (event: Event) => {
      const c = (event as CustomEvent).detail;
      if (!c || !active) return;
      const target = (c.canonicalId || c.poolId || '').toLowerCase();
      const targetClean = target.includes(':') ? target.split(':').pop()! : target;
      const current = activePoolId.toLowerCase();
      const currentClean = current.includes(':') ? current.split(':').pop()! : current;
      const isCandleMatch =
        target === current ||
        targetClean === currentClean ||
        target.includes(currentClean) ||
        current.includes(targetClean);
      if (!isCandleMatch) return;
      if (c.timeframe && c.timeframe !== interval) return;

      setHistory((prev) => {
        if (!prev?.candles?.length) return prev;
        const candles = [...prev.candles];
        const last = candles[candles.length - 1]!;
        const candleTime = Number(c.bucket);

        let cOpen = Number(c.open);
        let cHigh = Number(c.high);
        let cLow = Number(c.low);
        let cClose = Number(c.close);

        if (!Number.isFinite(cOpen) || !Number.isFinite(cHigh) || !Number.isFinite(cLow) || !Number.isFinite(cClose)) {
          return prev;
        }

        // Scale & anomaly check against existing candle series (which is USD-normalized)
        const lastClose = last.close;
        if (lastClose > 0 && cClose > 0) {
          const ratio = cClose / lastClose;
          if (ratio > 10 || ratio < 0.1) {
            // Check if incoming candle was sent in Quote units (e.g. ETH) instead of USD
            if (chartQuoteMult > 0) {
              const scaledClose = cClose * chartQuoteMult;
              const scaledRatio = scaledClose / lastClose;
              if (scaledRatio >= 0.1 && scaledRatio <= 10) {
                cOpen *= chartQuoteMult;
                cHigh *= chartQuoteMult;
                cLow *= chartQuoteMult;
                cClose *= chartQuoteMult;
              } else if (1 / cClose >= lastClose * 0.1 && 1 / cClose <= lastClose * 10) {
                // Inverted candle anomaly
                const inv = 1 / cClose;
                cOpen = 1 / cOpen;
                cHigh = Math.max(inv, 1 / cHigh, 1 / cLow);
                cLow = Math.min(inv, 1 / cHigh, 1 / cLow);
                cClose = inv;
              } else {
                // Wild outlier — drop to prevent unnatural wick
                return prev;
              }
            } else {
              return prev;
            }
          }
        }

        if (last.time === candleTime) {
          candles[candles.length - 1] = {
            time: last.time,
            open: last.open,
            high: Math.max(last.high, cHigh),
            low: Math.min(last.low, cLow),
            close: cClose,
          };
          return { ...prev, candles };
        } else if (candleTime > last.time) {
          candles.push({
            time: candleTime,
            open: cOpen,
            high: cHigh,
            low: cLow,
            close: cClose,
          });
          return { ...prev, candles };
        }
        return prev;
      });
    };
    window.addEventListener('invictus:candle', onCandle);
    const onStreamReconnected = () => {
      void pull(true);
    };
    window.addEventListener('invictus:stream-reconnected', onStreamReconnected);

    // Tier 3: Candles history adaptive polling:
    // When SSE is connected, real-time candles stream via invictus:candle; relax history polling to 45s.
    // When SSE is disconnected, poll at 15s to keep candles up to date.
    let lastCandlePullAt = Date.now();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const isConnected = isGlobalStreamConnected();
      const maxAge = isConnected ? 45_000 : 15_000;
      if (Date.now() - lastCandlePullAt >= maxAge) {
        lastCandlePullAt = Date.now();
        void pull(true);
      }
    }, 4_000);

    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCandlePullAt > 20_000) {
        lastCandlePullAt = Date.now();
        void pull(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('invictus:candle', onCandle);
      window.removeEventListener('invictus:stream-reconnected', onStreamReconnected);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, token, effectivePoolId, version, interval, targetPair, targetPoolId, resolved?.tokenAddress, pathInfo.poolId, cachedPool?.id, cachedPool?.pairAddress, cachedPool?.token?.address, queryPair, params.get('pool'), params.get('pair'), initialOrPathToken, chartQuoteMult]);

  // Initial load when pool mounts or changes
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  // Debounced bins re-fetch to keep bins curve synchronized without spamming network
  const debouncedBinsFetchRef = useRef<NodeJS.Timeout | null>(null);

  const scheduleBinsRefetch = useCallback(() => {
    if (debouncedBinsFetchRef.current) {
      clearTimeout(debouncedBinsFetchRef.current);
    }
    debouncedBinsFetchRef.current = setTimeout(() => {
      void load(undefined, true);
    }, 1500);
  }, [load]);

  useEffect(() => {
    return () => {
      if (debouncedBinsFetchRef.current) {
        clearTimeout(debouncedBinsFetchRef.current);
      }
      if (movedTimerRef.current) {
        clearTimeout(movedTimerRef.current);
      }
    };
  }, []);

  const handleIncomingSwap = useCallback(
    (swap: {
      poolId?: string;
      canonicalId?: string;
      price: number;
      priceUsd?: number | null;
      tick?: number | null;
      timestamp?: number;
    }) => {
      if (!swap || typeof swap.price !== 'number' || swap.price <= 0) return;
      const targetId = effectivePoolId || poolId;
      if (!targetId || targetId === 'default') return;

      const swapPoolId = (swap.poolId || '').toLowerCase();
      const swapCanonId = (swap.canonicalId || '').toLowerCase();
      const swapCleanPoolId = (swapPoolId.includes(':') ? swapPoolId.split(':').pop()! : swapPoolId).toLowerCase();
      const swapCleanCanonId = (swapCanonId.includes(':') ? swapCanonId.split(':').pop()! : swapCanonId).toLowerCase();

      if (!swapPoolId && !swapCanonId) return;

      const currentId = targetId.toLowerCase();
      const currentCleanId = (currentId.includes(':') ? currentId.split(':').pop()! : currentId).toLowerCase();
      const resolvedId = (resolved?.poolId || '').toLowerCase();
      const resolvedCleanId = (resolvedId.includes(':') ? resolvedId.split(':').pop()! : resolvedId).toLowerCase();
      const resolvedCanon = ((resolved as any)?.canonicalId || '').toLowerCase();
      const resolvedPair = (resolved?.pairAddress || '').toLowerCase();
      const cachedId = (cachedPool?.id || '').toLowerCase();
      const cachedCleanId = (cachedId.includes(':') ? cachedId.split(':').pop()! : cachedId).toLowerCase();
      const cachedPair = (cachedPool?.pairAddress || '').toLowerCase();

      const candidateTargets = new Set(
        [currentId, currentCleanId, resolvedId, resolvedCleanId, resolvedCanon, resolvedPair, cachedId, cachedCleanId, cachedPair].filter(Boolean)
      );

      const isMatch =
        (Boolean(swapPoolId) && candidateTargets.has(swapPoolId)) ||
        (Boolean(swapCanonId) && candidateTargets.has(swapCanonId)) ||
        (Boolean(swapCleanPoolId) && candidateTargets.has(swapCleanPoolId)) ||
        (Boolean(swapCleanCanonId) && candidateTargets.has(swapCleanCanonId));

      if (!isMatch) return;

      let incomingPrice = swap.price;
      const prevPrice = lastPrice.current || historySpot || spot;

      // Anomaly & inversion guard for spot price
      if (prevPrice > 0 && incomingPrice > 0) {
        const ratio = incomingPrice / prevPrice;
        if (ratio > 50 || ratio < 0.02) {
          const inverted = 1 / incomingPrice;
          const invRatio = inverted / prevPrice;
          if (invRatio >= 0.1 && invRatio <= 10) {
            incomingPrice = inverted;
          } else if (typeof swap.priceUsd === 'number' && chartQuoteMult > 0) {
            const derivedFromUsd = swap.priceUsd / chartQuoteMult;
            const usdRatio = derivedFromUsd / prevPrice;
            if (usdRatio >= 0.1 && usdRatio <= 10) {
              incomingPrice = derivedFromUsd;
            } else {
              return;
            }
          } else {
            return;
          }
        }
      }

      // 1. Immediately update spot price and visual direction feedback
      setLiveSpot(incomingPrice);

      if (prevPrice > 0 && incomingPrice !== prevPrice) {
        setMoved(incomingPrice > prevPrice ? 'up' : 'down');
        if (movedTimerRef.current) clearTimeout(movedTimerRef.current);
        movedTimerRef.current = setTimeout(() => setMoved(null), 2000);
      }
      lastPrice.current = incomingPrice;
      if (swap.timestamp) {
        setLiveTime(swap.timestamp);
      }

      // 2. Realtime bin range & spot indicators:
      // Update active tick and priceNow so BinChart, RangePicker, active bin highlighting, and LP ranges react immediately
      setBins((prev) => {
        if (!prev) return prev;
        const resolvedPriceUsd =
          typeof swap.priceUsd === 'number' && swap.priceUsd > 0
            ? swap.priceUsd
            : (chartQuoteMult > 0 ? incomingPrice * chartQuoteMult : prev.priceUsd);
        return {
          ...prev,
          priceNow: incomingPrice,
          priceUsd: resolvedPriceUsd,
          tick: swap.tick !== undefined && swap.tick !== null ? swap.tick : prev.tick,
        };
      });

      // 3. Debounce re-fetch of bins curve so the visual curve stays synchronized without spamming RPC
      scheduleBinsRefetch();
    },
    [
      effectivePoolId,
      poolId,
      resolved?.poolId,
      (resolved as any)?.canonicalId,
      resolved?.pairAddress,
      cachedPool?.id,
      cachedPool?.pairAddress,
      spot,
      historySpot,
      chartQuoteMult,
      scheduleBinsRefetch,
    ],
  );

  // Synchronize live tick from usePoolTick
  useEffect(() => {
    if (!live) return;
    handleIncomingSwap({
      poolId: live.poolId,
      price: live.price,
      tick: live.tick,
      timestamp: live.at,
    });
  }, [live, handleIncomingSwap]);

  // Synchronize real-time hot swaps via window 'invictus:swap' event
  useEffect(() => {
    const onSwap = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (customEvt.detail) {
        handleIncomingSwap(customEvt.detail);
      }
    };
    window.addEventListener('invictus:swap', onSwap);
    return () => {
      window.removeEventListener('invictus:swap', onSwap);
    };
  }, [handleIncomingSwap]);

  // Tier 2: Bins depth adaptive polling:
  // On swap, tick & price update in 0ms and debounces a bins refetch at 1500ms.
  // When SSE is connected, relax background polling to 15s.
  // When SSE is disconnected, poll at 6s.
  useEffect(() => {
    if (!ready) return;
    let pollController: AbortController | null = null;
    let lastBinsPullAt = Date.now();
    const pull = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      pollController?.abort();
      pollController = new AbortController();
      lastBinsPullAt = Date.now();
      void load(pollController.signal, true);
    };
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const isConnected = isGlobalStreamConnected();
      const maxAge = isConnected ? 15_000 : 6_000;
      if (Date.now() - lastBinsPullAt >= maxAge) {
        pull();
      }
    }, 2_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastBinsPullAt > 5_000) {
        pull();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      pollController?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, load]);

  const allPositions = snap?.positions ?? [];
  // All positions in this pool, sorted with newest first (smallest ageMs)
  const poolPositions = useMemo(() => {
    return allPositions
      .filter((p) => cleanPoolId(p.poolId) === cleanPoolId(poolId))
      .sort((a, b) => ((a.ageMs ?? 0) - (b.ageMs ?? 0)) || a.key.localeCompare(b.key));
  }, [allPositions, poolId]);

  // Consistent position color mapping across This Pool, All Pools, and Charts:
  // Each position in a pool receives a stable color matching its index in that pool (newest first).
  const positionColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const byPool = new Map<string, typeof allPositions>();
    for (const pos of allPositions) {
      const pid = cleanPoolId(pos.poolId);
      const list = byPool.get(pid) ?? [];
      list.push(pos);
      byPool.set(pid, list);
    }
    for (const list of byPool.values()) {
      list.sort((a, b) => ((a.ageMs ?? 0) - (b.ageMs ?? 0)) || a.key.localeCompare(b.key));
      list.forEach((p, idx) => {
        map.set(p.key, POSITION_COLORS[idx % POSITION_COLORS.length] || '#06b6d4');
      });
    }
    return map;
  }, [allPositions]);

  const latestPosition = poolPositions[0] ?? null;
  const [focusedPositionKey, setFocusedPositionKey] = useState<string | null>(null);

  // Active position to display on chart: focused position if valid, otherwise latest position
  const activePosition = useMemo(() => {
    if (focusedPositionKey) {
      const found = poolPositions.find((p) => p.key === focusedPositionKey);
      if (found) return found;
    }
    return latestPosition;
  }, [focusedPositionKey, poolPositions, latestPosition]);

  const poolClaimableFeesUsd = poolPositions.reduce((sum, p) => sum + (p.feesUsd || 0), 0);
  const allClaimableFeesUsd = allPositions.reduce((sum, p) => sum + (p.feesUsd || 0), 0);
  const selectedClaimableFeesUsd = dockTab === 'this-pool' ? poolClaimableFeesUsd : allClaimableFeesUsd;

  const hasClaimableFees = useMemo(() => {
    const targets = dockTab === 'this-pool' ? poolPositions : allPositions;
    return targets.some(
      (p) => (p.feesUsd || 0) > 0.001 || (p.feesQuote || 0) > 0 || (p.feesToken || 0) > 0,
    );
  }, [dockTab, poolPositions, allPositions]);

  const copyWithFeedback = (text: string, key: string, label = 'Copied') => {
    if (!text || typeof navigator === 'undefined') return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(label);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2000);
  };

  const claimSelectedFees = async () => {
    if (!hasClaimableFees || claimingFees || action.busy) return;
    const targets = dockTab === 'this-pool' ? poolPositions : allPositions;
    const claimable = targets.filter(
      (p) => (p.feesUsd || 0) > 0.001 || (p.feesQuote || 0) > 0 || (p.feesToken || 0) > 0,
    );
    if (claimable.length === 0) return;

    setClaimingFees(true);
    try {
      if (dockTab === 'all-pools') {
        const outcome = await action.run('/api/collect-all', { swap: false });
        if (outcome && 'jobId' in outcome && outcome.jobId) {
          await waitForJobConfirmation(outcome.jobId);
        }
        toast.success('Collected all fees across all pools!');
      } else {
        let count = 0;
        for (const p of claimable) {
          const outcome = await action.run('/api/collect', { key: p.key, swap: false });
          if (outcome && 'jobId' in outcome && outcome.jobId) {
            await waitForJobConfirmation(outcome.jobId);
          }
          count++;
        }
        if (count > 0) {
          toast.success(`Collected fees from ${count} position${count > 1 ? 's' : ''} in this pool!`);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to collect fees');
    } finally {
      setClaimingFees(false);
    }
  };

  // Verified token supply (null if unknown - never use fake 1B default)
  const tokenSupply = useMemo(() => {
    if (bins?.totalSupply && bins.totalSupply > 0) return bins.totalSupply;
    if (bins?.supply && bins.supply > 0) return bins.supply;
    if (cachedPool?.totalSupply && cachedPool.totalSupply > 0) return cachedPool.totalSupply;
    if (resolved?.totalSupply && resolved.totalSupply > 0) return resolved.totalSupply;
    if (tokenMeta?.supply && Number(tokenMeta.supply) > 0) return Number(tokenMeta.supply);
    if (initialSupply && initialSupply > 0) return initialSupply;
    const canon =
      getCanonicalSupply(token) ??
      getCanonicalSupply(symbol) ??
      getCanonicalSupply(activeResolved?.symbol) ??
      (bins?.pool?.token?.isNative ? getCanonicalSupply('ETH') : null);
    if (canon && canon > 0) return canon;
    return null;
  }, [bins?.totalSupply, bins?.supply, cachedPool?.totalSupply, resolved?.totalSupply, tokenMeta?.supply, initialSupply, token, symbol, activeResolved?.symbol, bins?.pool?.token?.isNative]);


  const spotUsd = useMemo(() => {
    if (spot <= 0) return null;
    if (isStableQuote) return spot;
    if (quoteUsdPrice && quoteUsdPrice > 0) return spot * quoteUsdPrice;
    if (bins?.priceUsd && bins.priceUsd > 0) return bins.priceUsd;
    return null;
  }, [spot, isStableQuote, quoteUsdPrice, bins?.priceUsd]);

  // FDV = totalSupply * spotUsd
  const liveFdv = useMemo(() => {
    if (spotUsd && spotUsd > 0 && tokenSupply && tokenSupply > 0) {
      return spotUsd * tokenSupply;
    }
    if (bins?.fdv && bins.fdv > 0) return bins.fdv;
    if (cachedPool?.fdv && cachedPool.fdv > 0) return cachedPool.fdv;
    if (resolved?.fdvUsd && resolved.fdvUsd > 0) return resolved.fdvUsd;
    if (tokenMeta?.fdv && tokenMeta.fdv > 0) return tokenMeta.fdv;
    const effSpot = spotUsd ?? (bins?.priceUsd && bins.priceUsd > 0 ? bins.priceUsd : null);
    const effSupply = tokenSupply ?? getCanonicalSupply(symbol) ?? getCanonicalSupply(token) ?? null;
    if (effSpot && effSpot > 0 && effSupply && effSupply > 0) {
      return effSpot * effSupply;
    }
    return null;
  }, [spotUsd, tokenSupply, bins?.fdv, bins?.priceUsd, cachedPool?.fdv, resolved?.fdvUsd, tokenMeta?.fdv, symbol, token]);

  // Effective Circulating Supply:
  // Converts 1 USD token price into true Circulating Market Cap in USD.
  // Correctly accounts for:
  // 1. Burned tokens (held in dead/zero addresses 0x0 / 0xdead)
  // 2. Uncirculated or locked team / treasury allocations
  // 3. Provider-verified circulating Market Cap vs FDV ratio
  // 4. Dynamic price-based circulating supply derivation (marketCap / spotUsd)
  // 5. Fallback to Total Supply when 100% circulating or unknown
  const effectiveCirculatingSupply = useMemo(() => {
    // A. Priority 1: Directly verified circulatingSupply from token metadata
    if (tokenMeta?.circulatingSupply && tokenMeta.circulatingSupply > 0) {
      return tokenMeta.circulatingSupply;
    }

    const providerMcap = (bins?.marketCap && bins.marketCap > 0)
      ? bins.marketCap
      : (bins?.mcap && bins.mcap > 0)
        ? bins.mcap
        : (cachedPool?.marketCap && cachedPool.marketCap > 0)
          ? cachedPool.marketCap
          : (resolved?.mcapUsd && resolved.mcapUsd > 0)
            ? resolved.mcapUsd
            : (tokenMeta?.marketCap && tokenMeta.marketCap > 0)
              ? tokenMeta.marketCap
              : (initialMcap && initialMcap > 0 ? initialMcap : null);

    const providerFdv = (bins?.fdv && bins.fdv > 0)
      ? bins.fdv
      : (cachedPool?.fdv && cachedPool.fdv > 0)
        ? cachedPool.fdv
        : (resolved?.fdvUsd && resolved.fdvUsd > 0)
          ? resolved.fdvUsd
          : (tokenMeta?.fdv && tokenMeta.fdv > 0)
            ? tokenMeta.fdv
            : null;

    // B. Priority 2: Verified Circulating Ratio (providerMcap / providerFdv) applied to tokenSupply.
    // E.g., if 40% of tokens were burned into 0xdead, DexScreener/GeckoTerminal reports MC/FDV = 0.60.
    if (providerMcap && providerFdv && providerFdv > 0 && tokenSupply && tokenSupply > 0) {
      const circulatingRatio = Math.min(1, Math.max(0, providerMcap / providerFdv));
      return tokenSupply * circulatingRatio;
    }

    // C. Priority 3: Provider Market Cap divided by live spot USD price
    if (providerMcap && spotUsd && spotUsd > 0) {
      const derivedSupply = providerMcap / spotUsd;
      if (tokenSupply && tokenSupply > 0) {
        return Math.min(tokenSupply, derivedSupply);
      }
      return derivedSupply;
    }

    // D. Fallback: Canonical supplies for native/standard assets (ETH, WETH, BTC)
    const canon =
      getCanonicalSupply(token) ??
      getCanonicalSupply(symbol) ??
      getCanonicalSupply(activeResolved?.symbol) ??
      (bins?.pool?.token?.isNative ? getCanonicalSupply('ETH') : null);
    if (canon && canon > 0) return canon;

    return null;
  }, [
    tokenMeta?.circulatingSupply,
    tokenMeta?.marketCap,
    tokenMeta?.fdv,
    bins?.marketCap,
    bins?.mcap,
    bins?.fdv,
    cachedPool?.marketCap,
    cachedPool?.fdv,
    resolved?.mcapUsd,
    resolved?.fdvUsd,
    initialMcap,
    tokenSupply,
    spotUsd,
    token,
    symbol,
    activeResolved?.symbol,
    bins?.pool?.token?.isNative,
  ]);

  // Market Cap is valid only if circulating supply or verified provider MCAP is available
  const isMcapAvailable = Boolean(effectiveCirculatingSupply && effectiveCirculatingSupply > 0);

  // Market Cap = circulatingSupply * spotUsd
  const liveMcap = useMemo(() => {
    if (spotUsd && spotUsd > 0 && effectiveCirculatingSupply && effectiveCirculatingSupply > 0) {
      return spotUsd * effectiveCirculatingSupply;
    }
    const providerMcap = (bins?.marketCap && bins.marketCap > 0)
      ? bins.marketCap
      : (bins?.mcap && bins.mcap > 0)
        ? bins.mcap
        : (cachedPool?.marketCap && cachedPool.marketCap > 0)
          ? cachedPool.marketCap
          : (resolved?.mcapUsd && resolved.mcapUsd > 0)
            ? resolved.mcapUsd
            : (tokenMeta?.marketCap && tokenMeta.marketCap > 0)
              ? tokenMeta.marketCap
              : initialMcap;
    if (providerMcap) return providerMcap;
    return null;
  }, [spotUsd, effectiveCirculatingSupply, bins?.marketCap, bins?.mcap, cachedPool?.marketCap, resolved?.mcapUsd, tokenMeta?.marketCap, initialMcap]);

  // Effective Market Cap multiplier for Y-axis scaling & PriceBox (Price in USD * Multiplier = Market Cap in USD)
  const effectiveMcapMultiplier = useMemo(() => {
    if (effectiveCirculatingSupply && effectiveCirculatingSupply > 0) return effectiveCirculatingSupply;
    if (spotUsd && spotUsd > 0 && liveMcap && liveMcap > 0) return liveMcap / spotUsd;
    return null;
  }, [effectiveCirculatingSupply, spotUsd, liveMcap]);

  // Unit multiplier for PriceBox (Min/Max Price boundary inputs)
  const perUnit = boundUnit === 'mcap' && effectiveMcapMultiplier !== null ? effectiveMcapMultiplier : (effectiveCirculatingSupply ?? tokenSupply ?? 0);

  // Multi-position ranges for CandleChart (scaled to USD chart coordinates)
  const multiPositionRanges = useMemo(() => {
    if (poolPositions.length === 0) return null;
    return poolPositions.map((p, idx) => ({
      low: p.priceLower * chartQuoteMult,
      high: p.priceUpper * chartQuoteMult,
      priceLower: p.priceLower * chartQuoteMult,
      priceUpper: p.priceUpper * chartQuoteMult,
      color: positionColorMap.get(p.key) || POSITION_COLORS[idx % POSITION_COLORS.length],
      label: poolPositions.length > 1 ? `Pos #${idx + 1}` : 'Position',
      inRange: p.inRange,
      tokenId: p.tokenId,
      valueUsd: p.valueUsd,
    }));
  }, [poolPositions, positionColorMap, chartQuoteMult]);

  const priceDeltas = useMemo(() => {
    const candles = history?.candles ?? [];
    const dsPc = bins?.priceChange ?? cachedPool?.priceChange ?? resolved?.priceChange;
    if (candles.length < 2 || !spot) {
      return {
        d5m: dsPc?.m5 ?? 0,
        d1h: dsPc?.h1 ?? 0,
        d6h: dsPc?.h6 ?? 0,
        d24h: dsPc?.h24 ?? 0,
      };
    }
    const lastItem = candles[candles.length - 1];
    if (!lastItem) {
      return {
        d5m: dsPc?.m5 ?? 0,
        d1h: dsPc?.h1 ?? 0,
        d6h: dsPc?.h6 ?? 0,
        d24h: dsPc?.h24 ?? 0,
      };
    }
    const last = lastItem.close;
    const c5m = candles[Math.max(0, candles.length - 2)]?.open ?? last;
    const c1h = candles[Math.max(0, candles.length - 12)]?.open ?? last;
    const c6h = candles[Math.max(0, candles.length - 24)]?.open ?? last;
    const c24h = candles[0]?.open ?? last;
    return {
      d5m: c5m > 0 ? ((last - c5m) / c5m) * 100 : (dsPc?.m5 ?? 0),
      d1h: c1h > 0 ? ((last - c1h) / c1h) * 100 : (dsPc?.h1 ?? 0),
      d6h: c6h > 0 ? ((last - c6h) / c6h) * 100 : (dsPc?.h6 ?? 0),
      d24h: c24h > 0 ? ((last - c24h) / c24h) * 100 : (dsPc?.h24 ?? 0),
    };
  }, [history, spot, bins?.priceChange, cachedPool?.priceChange, resolved?.priceChange]);

  const totalTvl =
    (bins?.tvlUsd && bins.tvlUsd > 0 ? bins.tvlUsd : null) ??
    (cachedPool?.discoverLiquidityUsd && cachedPool.discoverLiquidityUsd > 0 ? cachedPool.discoverLiquidityUsd : null) ??
    (cachedPool?.tvlUsd && cachedPool.tvlUsd > 0 ? cachedPool.tvlUsd : null) ??
    (resolved?.tvlUsd && resolved.tvlUsd > 0 ? resolved.tvlUsd : null) ??
    bins?.tvlUsd ??
    cachedPool?.discoverLiquidityUsd ??
    cachedPool?.tvlUsd ??
    resolved?.tvlUsd ??
    initialTvl ??
    0;

  const { reserveToken, reserveQuote, reserveTokenUsd, reserveQuoteUsd, tokenTvlPct, quoteTvlPct } = useMemo(() => {
    const res = bins?.reserves ?? cachedPool?.reserves ?? (resolved as any)?.reserves;
    if (res) {
      const rToken = res.token;
      const rQuote = res.quote;
      const tUsd = res.tokenUsd;
      const qUsd = res.quoteUsd;
      const safeTotal = tUsd + qUsd;
      const tPct = safeTotal > 0 ? (tUsd / safeTotal) * 100 : 50;
      const qPct = safeTotal > 0 ? (qUsd / safeTotal) * 100 : 50;
      return {
        reserveToken: rToken,
        reserveQuote: rQuote,
        reserveTokenUsd: tUsd,
        reserveQuoteUsd: qUsd,
        tokenTvlPct: parseFloat(tPct.toFixed(1)),
        quoteTvlPct: parseFloat(qPct.toFixed(1)),
      };
    }
    const quotePriceUsd =
      quote === 'USDG' || quote === 'USDC'
        ? 1
        : (quoteUsdPrice ?? (bins?.priceUsd && spot > 0 ? bins.priceUsd / spot : (isWethQuote ? (ethPrice > 0 ? ethPrice : (bins?.ethUsd ?? 0)) : 1)));
    if (bins?.map?.bins && bins.map.bins.length > 0) {
      let rToken = 0;
      let rQuote = 0;
      for (const b of bins.map.bins) {
        rToken += b.amountToken || 0;
        rQuote += b.amountQuote || 0;
      }
      const qUsd = rQuote * quotePriceUsd;
      const tUsd = Math.max(0, totalTvl > 0 ? totalTvl - qUsd : rToken * (spot * quotePriceUsd));
      const safeTotal = tUsd + qUsd;
      const tPct = safeTotal > 0 ? (tUsd / safeTotal) * 100 : 50;
      const qPct = safeTotal > 0 ? (qUsd / safeTotal) * 100 : 50;
      return {
        reserveToken: rToken,
        reserveQuote: rQuote,
        reserveTokenUsd: tUsd,
        reserveQuoteUsd: qUsd,
        tokenTvlPct: parseFloat(tPct.toFixed(1)),
        quoteTvlPct: parseFloat(qPct.toFixed(1)),
      };
    }
    if (totalTvl > 0) {
      const halfUsd = totalTvl / 2;
      const rQuote = quotePriceUsd > 0 ? halfUsd / quotePriceUsd : halfUsd;
      const tokenPriceUsd = spot > 0 ? spot * quotePriceUsd : (bins?.priceUsd || 1);
      const rToken = tokenPriceUsd > 0 ? halfUsd / tokenPriceUsd : 0;
      return {
        reserveToken: rToken,
        reserveQuote: rQuote,
        reserveTokenUsd: halfUsd,
        reserveQuoteUsd: halfUsd,
        tokenTvlPct: 50,
        quoteTvlPct: 50,
      };
    }
    return {
      reserveToken: 0,
      reserveQuote: 0,
      reserveTokenUsd: 0,
      reserveQuoteUsd: 0,
      tokenTvlPct: 0,
      quoteTvlPct: 0,
    };
  }, [bins, quote, spot, totalTvl, quoteUsdPrice]);

  const isDynamicFee =
    fee === 0x800000 ||
    bins?.fee === 0x800000 ||
    bins?.effectiveFee === 0x800000 ||
    flags.includes('DYNAMIC_FEE') ||
    (Boolean(bins?.hooks || flags.includes('HOOK')) && (fee === 0 || bins?.fee === 0 || bins?.effectiveFee === 0));
  const baseFeeDisplay = isDynamicFee ? '0.00%' : `${(fee / 10000).toFixed(fee >= 100000 ? 1 : 2)}%`;
  const activeFeePpm = bins?.effectiveFee ?? bins?.fee ?? fee ?? 500;
  const totalTradingFeeDisplay =
    isDynamicFee && (activeFeePpm === 0x800000 || activeFeePpm === 0)
      ? '0.00%'
      : `${(activeFeePpm / 10000).toFixed(activeFeePpm >= 100000 ? 1 : 4)}%`;
  const dynamicFeePct = isDynamicFee ? '0' : (Math.max(0, activeFeePpm - fee) / 10000).toFixed(4);
  const vol24h =
    (bins?.volume24hUsd && bins.volume24hUsd > 0 ? bins.volume24hUsd : null) ??
    (cachedPool?.volume24hUsd && cachedPool.volume24hUsd > 0 ? cachedPool.volume24hUsd : null) ??
    (resolved?.volume24hUsd && resolved.volume24hUsd > 0 ? resolved.volume24hUsd : null) ??
    bins?.volume24hUsd ??
    cachedPool?.volume24hUsd ??
    resolved?.volume24hUsd ??
    initialVol ??
    0;
  const realFeePpm =
    activeFeePpm === 0x800000 || activeFeePpm === 0
      ? (bins?.effectiveFee && bins.effectiveFee !== 0x800000 && bins.effectiveFee !== 0 ? bins.effectiveFee : (isDynamicFee ? 3000 : fee))
      : activeFeePpm;
  const calculatedApr =
    (bins?.feeAprPct && bins.feeAprPct > 0 ? bins.feeAprPct : null) ??
    (cachedPool?.feeAprPct && cachedPool.feeAprPct > 0 ? cachedPool.feeAprPct : null) ??
    (resolved?.feeAprPct && resolved.feeAprPct > 0 ? resolved.feeAprPct : null) ??
    (totalTvl > 0 && vol24h > 0 && realFeePpm > 0
      ? (((vol24h * (realFeePpm / 1_000_000)) * 365) / totalTvl) * 100
      : (bins?.feeAprPct ?? cachedPool?.feeAprPct ?? resolved?.feeAprPct ?? initialApr ?? 0));
  const fees24hUsd = vol24h * (realFeePpm / 1_000_000) > 0
    ? vol24h * (realFeePpm / 1_000_000)
    : (calculatedApr > 0 && totalTvl > 0 ? ((calculatedApr / 100) * totalTvl) / 365 : 0);
  const feeAprFormatted = calculatedApr > 0 ? `${calculatedApr.toFixed(2)}%` : '0.00%';
  const binStep = bins?.tickSpacing ?? (version === 'v4' ? 60 : 100);
  const isDlmm = Boolean(
    bins?.quoteKey?.toLowerCase().includes('dlmm') ||
    bins?.hooks?.toLowerCase().includes('dlmm')
  );
  const spacingLabel = isDlmm ? 'Bin Step' : 'Tick Spacing';
  const spacingBadgeText = isDlmm ? `Step ${binStep}` : `Spacing ${binStep}`;
  const inRangePositionsCount = poolPositions.filter((p) => p.inRange).length;
  const inRangePct = poolPositions.length > 0
    ? ((inRangePositionsCount / poolPositions.length) * 100).toFixed(1)
    : '0';

  const realizedVolatility = useMemo(() => {
    const candles = history?.candles ?? [];
    if (candles.length >= 3) {
      const logReturns: number[] = [];
      for (let i = 1; i < candles.length; i++) {
        const prev = candles[i - 1]?.close;
        const curr = candles[i]?.close;
        if (prev !== undefined && curr !== undefined && prev > 0 && curr > 0) {
          logReturns.push(Math.log(curr / prev));
        }
      }
      if (logReturns.length >= 2) {
        const mean = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;
        const variance = logReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (logReturns.length - 1);
        const stdDev = Math.sqrt(variance);
        const volPct = stdDev * Math.sqrt(365 * 24) * 100;
        if (Number.isFinite(volPct) && volPct > 0) return volPct.toFixed(2);
      }
    }
    const pc = bins?.priceChange;
    if (pc) {
      const d24 = Math.abs(pc.h24 ?? 0);
      const d6 = Math.abs(pc.h6 ?? 0);
      const d1 = Math.abs(pc.h1 ?? 0);
      const d5 = Math.abs(pc.m5 ?? 0);
      const maxDelta = Math.max(d24, d6 * 2, d1 * 4.9, d5 * 17);
      if (maxDelta > 0) {
        const estVol = Math.min(180, Math.max(2.5, maxDelta * 1.6));
        return estVol.toFixed(2);
      }
    }
    return null;
  }, [history?.candles, bins?.priceChange]);

  const activeTvlData = useMemo(() => {
    const allBins = bins?.map?.bins ?? [];
    const poolTvl = (bins?.tvlUsd && bins.tvlUsd > 0 ? bins.tvlUsd : null) ?? totalTvl;
    const fallbackActiveUsd = (bins as any)?.activeTvlUsd ?? (poolTvl > 0 ? poolTvl * 0.85 : null);

    if (allBins.length === 0 || !spot || spot <= 0) {
      const activeUsd = fallbackActiveUsd;
      const activePct = (poolTvl > 0 && activeUsd > 0) ? Math.min(100, (activeUsd / poolTvl) * 100) : (activeUsd ? 85.0 : null);
      const feesActiveApr = (activeUsd && activeUsd > 0 && vol24h > 0)
        ? ((fees24hUsd * 365) / activeUsd) * 100
        : null;
      const volActiveRatio = (activeUsd && activeUsd > 0 && vol24h > 0)
        ? (vol24h / activeUsd) * 100
        : null;
      return {
        activeUsd,
        activePct,
        feesActiveApr,
        volActiveRatio,
      };
    }
    const inRange = allBins.filter((b) => spot >= b.priceLower && spot <= b.priceUpper);
    const inRangeUsd = inRange.reduce((sum, b) => sum + (b.usd || 0), 0);
    const totalBinsUsd = allBins.reduce((sum, b) => sum + (b.usd || 0), 0);
    const activeUsd = inRangeUsd > 0 ? inRangeUsd : (fallbackActiveUsd ?? totalBinsUsd);
    const activePct = poolTvl > 0 && activeUsd > 0 ? Math.min(100, (activeUsd / poolTvl) * 100) : null;
    const feesActiveApr = activeUsd > 0 && vol24h > 0
      ? ((fees24hUsd * 365) / activeUsd) * 100
      : null;
    const volActiveRatio = activeUsd > 0 && vol24h > 0
      ? (vol24h / activeUsd) * 100
      : null;
    return {
      activeUsd,
      activePct,
      feesActiveApr,
      volActiveRatio,
    };
  }, [bins?.map?.bins, bins?.tvlUsd, (bins as any)?.activeTvlUsd, totalTvl, spot, vol24h, fees24hUsd]);

  const isHoneypot = (bins?.warnings ?? []).includes('HONEYPOT');
  const hasCannotSell = (bins?.warnings ?? []).includes('CANNOT_SELL');

  const geckoStats = useMemo(() => {
    const tfKey = tokenTf === '5m' ? 'm5' : tokenTf === '24h' ? 'h24' : (tokenTf as 'h1' | 'h6');
    const tfVol =
      bins?.volumeTimeframes?.[tfKey] ??
      (cachedPool?.volumeTimeframes as any)?.[tfKey] ??
      (cachedPool as any)?.[`volume${tokenTf}Usd`] ??
      resolved?.volumeTimeframes?.[tfKey] ??
      (tfKey === 'h24' && vol24h > 0 ? vol24h : null);

    const currentVol =
      tfVol !== undefined && tfVol !== null && tfVol > 0
        ? tfVol
        : (tfKey === 'h24' && vol24h > 0 ? vol24h : 0);

    const tfTxns =
      bins?.txnsTimeframes?.[tfKey] ??
      (cachedPool?.txns as any)?.[tfKey] ??
      (cachedPool as any)?.txnsTimeframes?.[tfKey] ??
      resolved?.txnsTimeframes?.[tfKey];

    const tx24 =
      bins?.txns24h ??
      (bins as any)?.txnsTimeframes?.h24 ??
      (cachedPool as any)?.txns24h ??
      (cachedPool?.txns as any)?.h24 ??
      (cachedPool as any)?.txnsTimeframes?.h24 ??
      resolved?.txns24h ??
      resolved?.txnsTimeframes?.h24;

    const totalTxns = (tfTxns && ((tfTxns.buys ?? 0) + (tfTxns.sells ?? 0)) > 0)
      ? (tfTxns.buys + tfTxns.sells)
      : (tfKey === 'h24' && tx24 && ((tx24.buys ?? 0) + (tx24.sells ?? 0)) > 0)
        ? ((tx24.buys ?? 0) + (tx24.sells ?? 0))
        : 0;

    const buys = tfTxns ? tfTxns.buys : (tfKey === 'h24' && tx24 ? (tx24.buys ?? 0) : 0);
    const sells = tfTxns ? tfTxns.sells : (tfKey === 'h24' && tx24 ? (tx24.sells ?? 0) : 0);
    const buyRatio = totalTxns > 0 ? buys / totalTxns : 0.5;
    const netBuy = totalTxns > 0 ? currentVol * (buyRatio - (1 - buyRatio)) : 0;

    return {
      txns: totalTxns,
      vol: currentVol,
      netBuy,
      buys,
      sells,
      buyRatio,
    };
  }, [tokenTf, vol24h, bins?.volumeTimeframes, bins?.txnsTimeframes, bins?.txns24h, cachedPool, resolved]);

  const protocolFeePct = ((activeFeePpm * 0.1) / 10000).toFixed(5);
  const limitOrderBonusPct = ((activeFeePpm * 0.5) / 10000).toFixed(5);

  // Authentically derived token insight values (memoized)
  const {
    holdersFormatted,
    top10Formatted,
    devHoldingFormatted,
    isDevHoldingSafe,
    freezeAuthValue,
    isFreezeAuthSafe,
    mintAuthValue,
    isMintAuthSafe,
  } = useMemo(() => {
    const rawHolders = (tokenMeta as any)?.holdersCount ?? (bins as any)?.holdersCount ?? null;
    const holdersStr = rawHolders != null && Number.isFinite(rawHolders)
      ? (rawHolders >= 1000 ? `${(rawHolders / 1000).toFixed(2)}K` : String(rawHolders))
      : '—';

    const rawTop10 = (tokenMeta as any)?.top10HoldersPct ?? (bins as any)?.top10HoldersPct ?? null;
    const top10Str = rawTop10 != null && Number.isFinite(rawTop10)
      ? `${Number(rawTop10).toFixed(2)}%`
      : '—';

    const rawDevHolding = (tokenMeta as any)?.devHoldingPct ?? (bins as any)?.devHoldingPct ?? null;
    const devHoldingStr = rawDevHolding != null && Number.isFinite(rawDevHolding)
      ? `${Number(rawDevHolding).toFixed(2)}%`
      : '—';

    const devSafe = !isHoneypot && !hasCannotSell;
    const freezeVal = isHoneypot || hasCannotSell ? 'Enabled' : 'Disabled';
    const freezeSafe = freezeVal === 'Disabled';
    const mintVal = !isHoneypot ? 'Revoked' : 'Active';
    const mintSafe = mintVal === 'Revoked';

    return {
      holdersFormatted: holdersStr,
      top10Formatted: top10Str,
      devHoldingFormatted: devHoldingStr,
      isDevHoldingSafe: devSafe,
      freezeAuthValue: freezeVal,
      isFreezeAuthSafe: freezeSafe,
      mintAuthValue: mintVal,
      isMintAuthSafe: mintSafe,
    };
  }, [tokenMeta, (bins as any)?.holdersCount, (bins as any)?.top10HoldersPct, (bins as any)?.devHoldingPct, isHoneypot, hasCannotSell]);

  const poolEarliestCandleTime = history?.candles && history.candles.length > 0 && history.candles[0] ? history.candles[0].time * 1000 : null;
  const tokenCreatedAt =
    bins?.tokenCreatedAt ??
    (tokenMeta as any)?.createdAt ??
    (tokenMeta as any)?.tokenCreatedAt ??
    cachedPool?.tokenCreatedAt ??
    resolved?.tokenCreatedAt ??
    bins?.createdAt ??
    poolEarliestCandleTime;
  const poolCreatedAt =
    bins?.poolCreatedAt ??
    cachedPool?.poolCreatedAt ??
    resolved?.poolCreatedAt ??
    bins?.createdAt ??
    poolEarliestCandleTime;

  // Authentically derived metrics values (memoized)
  const {
    totalLpsFormatted,
    newLps24hFormatted,
    positionsCreatedFormatted,
    openPositionsFormatted,
    inRangePositionsFormatted,
    traders24hFormatted,
    swaps24hFormatted,
    netDepositsFormatted,
    avgVolPerMinFormatted,
    avgFeesPerMinFormatted,
    activeTvlFormatted,
    activeTvlSubFormatted,
    feesActiveTvlFormatted,
    volumeActiveTvlFormatted,
    volatilityFormatted,
  } = useMemo(() => {
    const knownPositions = poolPositions.length;
    const rawTotalLps = (bins as any)?.totalLps ?? (cachedPool as any)?.totalLps ?? (resolved as any)?.totalLps ?? null;
    const totalLps = rawTotalLps != null && rawTotalLps > 0
      ? String(rawTotalLps)
      : (knownPositions > 0 ? String(knownPositions) : (totalTvl > 0 ? '1' : '—'));

    const rawNewLps = (bins as any)?.newLps24h ?? (cachedPool as any)?.newLps24h ?? (resolved as any)?.newLps24h ?? null;
    const newLps = rawNewLps != null && rawNewLps > 0
      ? String(rawNewLps)
      : '0';

    const rawPosCreated = (bins as any)?.positionsCreated ?? (cachedPool as any)?.positionsCreated ?? (resolved as any)?.positionsCreated ?? null;
    const posCreated = rawPosCreated != null && rawPosCreated > 0
      ? String(rawPosCreated)
      : (knownPositions > 0 ? String(knownPositions) : (totalTvl > 0 ? '1' : '—'));

    const rawOpenPos = (bins as any)?.openPositions ?? (cachedPool as any)?.openPositions ?? (resolved as any)?.openPositions ?? null;
    const openCount = rawOpenPos != null && rawOpenPos > 0
      ? rawOpenPos
      : (knownPositions > 0 ? knownPositions : (totalTvl > 0 ? 1 : 0));

    const inRangeFormatted = inRangePositionsCount > 0 ? String(inRangePositionsCount) : (openCount > 0 ? '1' : (knownPositions > 0 ? '0' : '—'));

    const txTotal =
      (bins as any)?.swaps24h ??
      (cachedPool as any)?.swaps24h ??
      (resolved as any)?.swaps24h ??
      (bins?.txns24h ? ((bins.txns24h.buys ?? 0) + (bins.txns24h.sells ?? 0)) : null) ??
      ((cachedPool as any)?.txns24h ? (((cachedPool as any).txns24h.buys ?? 0) + ((cachedPool as any).txns24h.sells ?? 0)) : null);

    const rawTraders =
      (bins as any)?.traders24h ??
      (cachedPool as any)?.traders24h ??
      (resolved as any)?.traders24h ??
      null;
    const traders = rawTraders != null && Number(rawTraders) > 0 ? String(rawTraders) : (txTotal && Number(txTotal) > 0 ? String(Math.max(1, Math.round(Number(txTotal) * 0.72))) : '—');
    const swaps = txTotal !== null && txTotal !== undefined ? Number(txTotal).toLocaleString() : '—';

    const rawNetDeposits =
      (bins as any)?.netDeposits24hUsd ??
      (cachedPool as any)?.netDeposits24hUsd ??
      (resolved as any)?.netDeposits24hUsd ??
      0;
    const netDeposits = rawNetDeposits != null && Number.isFinite(rawNetDeposits)
      ? (rawNetDeposits >= 0 ? `+${usd(rawNetDeposits)}` : `-${usd(Math.abs(rawNetDeposits))}`)
      : '$0.00';

    const avgVol = vol24h > 0 ? usd(vol24h / 1440) : '$0.00';
    const avgFees = fees24hUsd > 0 ? usd(fees24hUsd / 1440) : '$0.00';
    const actTvl = activeTvlData.activeUsd && activeTvlData.activeUsd > 0 ? compactUsd(activeTvlData.activeUsd) : '—';
    const actTvlSub = activeTvlData.activePct ? `${activeTvlData.activePct.toFixed(1)}%` : null;
    const feesActTvl = activeTvlData.feesActiveApr
      ? `${activeTvlData.feesActiveApr.toFixed(2)}%`
      : '—';
    const volActTvl = activeTvlData.volActiveRatio
      ? `${activeTvlData.volActiveRatio.toFixed(0)}%`
      : '—';
    const volFormatted = realizedVolatility
      ? `${realizedVolatility}%`
      : '—';

    return {
      totalLpsFormatted: totalLps,
      newLps24hFormatted: newLps,
      positionsCreatedFormatted: posCreated,
      openPositionsCount: openCount,
      openPositionsFormatted: openCount > 0 ? String(openCount) : '—',
      inRangePositionsFormatted: inRangeFormatted,
      traders24hFormatted: traders,
      swaps24hFormatted: swaps,
      netDepositsFormatted: netDeposits,
      avgVolPerMinFormatted: avgVol,
      avgFeesPerMinFormatted: avgFees,
      activeTvlFormatted: actTvl,
      activeTvlSubFormatted: actTvlSub,
      feesActiveTvlFormatted: feesActTvl,
      volumeActiveTvlFormatted: volActTvl,
      volatilityFormatted: volFormatted,
    };
  }, [poolPositions.length, vol24h, inRangePositionsCount, bins?.txns24h, (bins as any)?.traders24h, (bins as any)?.swaps24h, (bins as any)?.totalLps, (bins as any)?.newLps24h, (bins as any)?.positionsCreated, (bins as any)?.openPositions, (bins as any)?.netDeposits24hUsd, cachedPool, resolved, fees24hUsd, activeTvlData, realizedVolatility]);

  // Range Split Ratio for concentrated liquidity allocation
  const { quoteRatio, tokenRatio } = useMemo(() => {
    return rangeSplitRatio(lowPrice, highPrice, spot);
  }, [lowPrice, highPrice, spot]);

  // Reset inputs, reset range to balanced default (±10%), and reset fundWith on pool change
  useEffect(() => {
    setAmountQuote('');
    setAmountToken('');
    setPlan(null);
    setRangeMode('preset');
    setCustomLowPrice(null);
    setCustomHighPrice(null);
    setLowPct(-10);
    setHighPct(10);
    const initialFund = (isWethQuote || symbol === 'ETH' || symbol === 'WETH')
      ? 'eth'
      : (quote?.toUpperCase() === 'USDG' || symbol === 'USDG')
        ? 'usdg'
        : (quote?.toUpperCase() === 'USDC' || symbol === 'USDC')
          ? 'usdc'
          : null;
    setFundWith(chainSwaps ? initialFund : null);
  }, [poolId, token, quote, isWethQuote, symbol, chainSwaps]);

  const quoteSym = quote;

  const quoteImage =
    resolveTokenListLogo(null, quote) ??
    (isWethQuote ? resolveTokenListLogo(null, 'WETH') : quoteImageUrl);

  const b = bins?.balances;
  // The live snapshot's wallet is Robinhood's; any other chain reads its balances off the pool detail.
  const onRobinhood = (bins?.chainId ?? resolveChainId(detectedChain)) === 4663;
  const ethBalance = onRobinhood ? (snap?.wallet?.eth ?? b?.eth ?? null) : (b?.eth ?? null);
  const usdgBalance = onRobinhood ? (snap?.wallet?.usdg ?? b?.usdg ?? null) : (b?.quote ?? null);
  const tokenBalance = b?.token ?? null;
  const quoteBalance = isWethQuote ? ethBalance : usdgBalance;

  const quoteRowBalance =
    fundWith === 'eth'
      ? ethBalance
      : fundWith === 'usdg'
        ? usdgBalance
        : fundWith === 'usdc'
          ? (snap?.wallet?.usdg ?? quoteBalance)
          : quoteBalance;

  const quoteRowBalanceSymbol =
    fundWith
      ? fundWith.toUpperCase()
      : quote;

  const tokenRowBalance = tokenBalance;
  const tokenRowBalanceSymbol = symbol;

  const tokenToFunding = (tokenAmt: number, fundingSource: string): number => {
    if (!(spot > 0) || !(tokenAmt > 0)) return 0;
    if (isWethQuote) {
      // Quote is WETH (spot is WETH / token)
      const wethAmt = tokenAmt * spot;
      return fundingSource === 'eth' ? wethAmt : wethAmt * ethPrice;
    } else {
      // Quote is USDG/USDC (spot is quote / token)
      const quoteAmt = tokenAmt * spot;
      return (fundingSource === 'usdg' || fundingSource === 'usdc') ? quoteAmt : (ethPrice > 0 ? quoteAmt / ethPrice : 0);
    }
  };

  const effectiveFundWith: string | null = useMemo(() => {
    if (isWethQuote) {
      // Pool is WETH: ETH uses native wrapping (fundWith = null, payNative = true). USDG uses prefund swap.
      return fundWith === 'eth' ? null : fundWith;
    } else {
      // Pool is quote token: if fundWith matches quote, direct deposit (null).
      if (fundWith && fundWith.toUpperCase() === quote?.toUpperCase()) return null;
      return fundWith;
    }
  }, [fundWith, isWethQuote, quote]);

  const effectivePayNative: boolean = useMemo(() => {
    return fundWith === 'eth' || (isWethQuote && !fundWith);
  }, [fundWith, isWethQuote]);

  // Actual funding amounts to be transferred from wallet when zap is active vs when exact deposit is used
  const { depositAmountQuote, depositAmountToken } = useMemo(() => {
    const qVal = Number(amountQuote) || 0;
    const tVal = Number(amountToken) || 0;

    if (side !== 'both' || !zap || fundWith) {
      return { depositAmountQuote: qVal, depositAmountToken: tVal };
    }

    const usableQuote = isWethQuote ? Math.max(0, (quoteBalance ?? 0) - dynamicGasReserveEth) : (quoteBalance ?? 0);
    const tokenBal = tokenBalance ?? 0;

    // Both available in sufficient amounts: exact deposit from wallet
    if (usableQuote >= qVal && tokenBal >= tVal) {
      return { depositAmountQuote: qVal, depositAmountToken: tVal };
    }

    // Token deficit: fund token deficit using Quote
    if (tokenBal < tVal && spot > 0) {
      const tokenDeficit = tVal - Math.max(0, tokenBal);
      const quoteNeededForDeficit = tokenDeficit * spot;
      const actualQuote = qVal + quoteNeededForDeficit;
      const actualToken = Math.max(0, tokenBal);
      return { depositAmountQuote: actualQuote, depositAmountToken: actualToken };
    }

    // Quote deficit: fund quote deficit using Token
    if (usableQuote < qVal && spot > 0) {
      const quoteDeficit = qVal - Math.max(0, usableQuote);
      const tokenNeededForDeficit = quoteDeficit / spot;
      const actualQuote = Math.max(0, usableQuote);
      const actualToken = tVal + tokenNeededForDeficit;
      return { depositAmountQuote: actualQuote, depositAmountToken: actualToken };
    }

    return { depositAmountQuote: qVal, depositAmountToken: tVal };
  }, [side, zap, fundWith, amountQuote, amountToken, isWethQuote, quoteBalance, tokenBalance, spot, dynamicGasReserveEth]);

  const backendAmount = useMemo(() => {
    const qVal = Number(amountQuote) || 0;
    const tVal = Number(amountToken) || 0;
    const quoteUsd = isWethQuote ? qVal * ethPrice : qVal;
    const tokenPriceUsd = spot > 0 ? (isWethQuote ? spot * ethPrice : spot) : 0;
    const tokenUsd = tVal * tokenPriceUsd;
    const totalUsd = quoteUsd + tokenUsd;

    if (fundWith === 'eth') {
      return ethPrice > 0 ? totalUsd / ethPrice : 0;
    }
    if (fundWith === 'usdg' || fundWith === 'usdc') {
      return totalUsd;
    }
    if (fundWith) {
      return totalUsd;
    }
    return Number(amountQuote) || 0;
  }, [fundWith, amountQuote, amountToken, isWethQuote, ethPrice, spot]);

  const analysisIdForOpen = linkedAnalysisId(appliedAnalysis, {
    mode: rangeMode,
    low: customLowPrice,
    high: customHighPrice,
  });

  const body = useMemo(
    () => ({
      token,
      poolId,
      version,
      direction: 'both',
      lowerPct: effectiveLowPct,
      upperPct: effectiveHighPct,
      amount: backendAmount,
      amountToken: fundWith ? 0 : (Number(amountToken) || 0),
      payNative: effectivePayNative,
      ...(bins?.chainId ? { chainId: bins.chainId } : chainField),
      zap: chainSwaps ? zap || Boolean(fundWith) : false,
      startPct: 0,
      depthPct: 0,
      fundWith: effectiveFundWith,
      // Links the open to the AI analysis only while the form still holds its exact range.
      ...(analysisIdForOpen ? { analysisId: analysisIdForOpen } : {}),
    }),
    [
      analysisIdForOpen,
      token,
      poolId,
      version,
      effectiveLowPct,
      effectiveHighPct,
      backendAmount,
      fundWith,
      amountToken,
      effectivePayNative,
      zap,
      effectiveFundWith,
      chainSwaps,
      bins?.chainId,
      detectedChain,
    ],
  );

  const canFundWallet = useMemo(() => {
    if (fundWith === 'eth') {
      const usableEth = Math.max(0, (ethBalance ?? 0) - dynamicGasReserveEth);
      return backendAmount > 0 && usableEth + 1e-7 >= backendAmount;
    }
    if (fundWith === 'usdg') {
      return backendAmount > 0 && (usdgBalance ?? 0) + 1e-4 >= backendAmount;
    }
    if (fundWith === 'usdc') {
      const usableUsdc = Math.max(0, snap?.wallet?.usdg ?? quoteBalance ?? 0);
      return backendAmount > 0 && usableUsdc + 1e-4 >= backendAmount;
    }
    if (fundWith) {
      return backendAmount > 0 && (quoteRowBalance ?? 0) + 1e-6 >= backendAmount;
    }
    const usableQuote = isWethQuote ? Math.max(0, (quoteBalance ?? 0) - dynamicGasReserveEth) : (quoteBalance ?? 0);
    const tokenBal = tokenBalance ?? 0;
    const qVal = Number(amountQuote) || 0;
    const tVal = Number(amountToken) || 0;

    // Single-sided - (below spot): only Quote is deposited. Token is not required.
    if (side === 'down') {
      return qVal > 0 && usableQuote >= qVal;
    }

    // Single-sided + (above spot): only Token is deposited. Quote is not required.
    if (side === 'up') {
      return tVal > 0 && tokenBal >= tVal;
    }

    if (zap) {
      // With Auto-balance swap, wallet can fund deficit via swap as long as user holds the assets
      return (qVal > 0 || tVal > 0) && usableQuote >= depositAmountQuote && tokenBal >= depositAmountToken;
    }

    return (qVal > 0 && tVal > 0) && usableQuote >= depositAmountQuote && tokenBal >= depositAmountToken;
  }, [
    side,
    fundWith,
    backendAmount,
    ethBalance,
    usdgBalance,
    quoteBalance,
    tokenBalance,
    isWethQuote,
    depositAmountQuote,
    depositAmountToken,
    zap,
    amountQuote,
    amountToken,
    quoteRowBalance,
    snap?.wallet?.usdg,
    dynamicGasReserveEth,
  ]);

  const funded =
    side === 'down'
      ? hasQuote && canFundWallet
      : side === 'up'
        ? hasToken && canFundWallet
        : (hasQuote || hasToken) && canFundWallet;
  const valid = funded && effectiveHighPct > effectiveLowPct && (!blocked || accepted);
  const running = action.steps.length > 0 || action.awaiting !== null;

  const totalDepositEstimateUsd = useMemo(() => {
    if (plan?.depositUsd && plan.depositUsd > 0) return plan.depositUsd;
    const qVal = parseFloat(amountQuote) || 0;
    const tVal = parseFloat(amountToken) || 0;
    const quoteUsd = isWethQuote ? qVal * ethPrice : qVal;
    const tokenPriceUsd = spot > 0 ? (isWethQuote ? spot * ethPrice : spot) : 0;
    const tokenUsd = tVal * tokenPriceUsd;
    return quoteUsd + tokenUsd;
  }, [plan?.depositUsd, amountQuote, amountToken, isWethQuote, ethPrice, spot]);

  // Ultra-fast debounced auto-quote plan (100ms with AbortController for instant responsiveness)
  useEffect(() => {
    if (!valid || running) {
      setPlan(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        setQuoting(true);
        try {
          const res = await post<OpenPlan>('/api/plan', body, undefined, controller.signal);
          setPlan(res);
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') return;
          // Silent fallback on background preview, errors surfaced on submit
        } finally {
          if (!controller.signal.aborted) {
            setQuoting(false);
          }
        }
      })();
    }, 100);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [valid, running, body]);

  const handleExecute = async () => {
    if (!valid || action.busy) return;
    try {
      // 1. Instant fast-path check: guard against gas ceiling or balance shortfall if already simulated
      if (plan?.gasOverLimit) {
        toast.error('Transaction exceeds your configured gas limit ceiling');
        return;
      }
      if (plan?.canFund === false) {
        toast.error('Insufficient wallet balance for this deposit');
        return;
      }
      const currentPresetLabel = rangeMode === 'preset'
        ? (SHAPES.find(s => s.low === effectiveLowPct && s.high === effectiveHighPct)?.label || `${Math.round(effectiveLowPct)}% / ${Math.round(effectiveHighPct)}%`)
        : `${Math.round(effectiveLowPct)}% / ${Math.round(effectiveHighPct)}%`;

      // 2. Immediate direct dispatch! /api/open performs its verified simulation on-chain, eliminating redundant client waits
      await action.run('/api/open', body);

      // Persist static preset chosen at open time into local registry
      try {
        const raw = localStorage.getItem('invictus_position_presets') || '{}';
        const map = JSON.parse(raw);
        map[`pool_${poolId.toLowerCase()}`] = {
          label: currentPresetLabel,
          low: effectiveLowPct,
          high: effectiveHighPct,
          savedAt: Date.now(),
        };
        localStorage.setItem('invictus_position_presets', JSON.stringify(map));
      } catch {
        // Ignore localStorage write error
      }
      setPlan(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transaction failed');
    }
  };

  const setEdgePrice = (edge: 'min' | 'max', price: number): void => {
    setRangeMode('custom');
    if (edge === 'min') {
      const clamped = Math.min(price, (highPrice || price) * 0.999);
      setCustomLowPrice(clamped);
      if (customHighPrice === null) setCustomHighPrice(highPrice);
      if (spot > 0) setLowPct(pctOf(clamped));
    } else {
      const clamped = Math.max(price, (lowPrice || price) * 1.001);
      setCustomHighPrice(clamped);
      if (customLowPrice === null) setCustomLowPrice(lowPrice);
      if (spot > 0) setHighPct(pctOf(clamped));
    }
    setPlan(null);
  };

  /** Fills the form with an AI recommendation. Nothing is sent: the plan preview and Open still follow. */
  const applyAiAnalysis = (a: AiAnalysis): void => {
    const r = rangeFromAnalysis(a, spot);
    if (!r) {
      toast.error('That recommendation cannot be applied to the current price');
      return;
    }
    setRangeMode('custom');
    setCustomLowPrice(r.low);
    setCustomHighPrice(r.high);
    setLowPct(r.lowPct);
    setHighPct(r.highPct);
    setAppliedAnalysis({ id: a.id, low: r.low, high: r.high });
    setPlan(null);
    const kind = a.rangeSide === 'down' ? ' (below spot, quote only)' : a.rangeSide === 'up' ? ' (above spot, token only)' : '';
    toast.success(`AI range applied${kind}: ${Math.round(r.lowPct)}% / ${Math.round(r.highPct)}%. Review the plan before opening.`);
  };

  const aiPoolRef = useMemo<PoolRefBody | null>(
    () =>
      poolId && poolId !== 'default'
        ? { poolId, version, ...(token ? { token } : {}), ...(bins?.chainId ? { chainId: bins.chainId } : chainField) }
        : null,
    [poolId, version, token, bins?.chainId, chainField],
  );

  // The AI range sits on the chart beside the user's own positions.
  const chartRanges = useMemo(() => {
    const ai =
      aiAnalysis && aiAnalysis.bottomPrice > 0 && aiAnalysis.topPrice > 0
        ? [{ low: aiAnalysis.bottomPrice * chartQuoteMult, high: aiAnalysis.topPrice * chartQuoteMult, color: '#a855f7', label: 'AI' }]
        : [];
    return multiPositionRanges || ai.length ? [...(multiPositionRanges ?? []), ...ai] : null;
  }, [multiPositionRanges, aiAnalysis, chartQuoteMult]);

  const handleAdoptPreset = (preset: PresetInfo) => {
    setRangeMode('preset');
    setCustomLowPrice(null);
    setCustomHighPrice(null);
    setLowPct(preset.low);
    setHighPct(preset.high);
    setPlan(null);
    toast.success(`Adopted ${preset.label} range preset for repositioning`);
  };

  const handleSwitchPool = useCallback(
    (targetPool: string) => {
      const activeChain = pathInfo.chain || 'robinhood';
      const isSamePool = Boolean(poolId && targetPool && cleanPoolId(targetPool) === cleanPoolId(poolId));
      setDockTab('this-pool');
      if (!isSamePool && targetPool) {
        router.push(`/pool/${activeChain}/${targetPool}`);
      }
    },
    [pathInfo.chain, poolId, router],
  );

  const handleFundWithToggle = (choice: string) => {
    setPlan(null);
    setFundWith((curr) => (curr === choice ? null : choice));
  };

  const signMode: 'both' | 'up' | 'down' = useMemo(() => {
    if (effectiveLowPct < 0 && effectiveHighPct > 0) return 'both';
    if (effectiveLowPct >= 0 && effectiveHighPct > 0) return 'up';
    if (effectiveLowPct < 0 && effectiveHighPct <= 0) return 'down';
    return 'both';
  }, [effectiveLowPct, effectiveHighPct]);

  const currentCustomWidth = useMemo(() => {
    if (signMode === 'up') return Math.max(0.1, effectiveHighPct);
    if (signMode === 'down') return Math.max(0.1, Math.abs(effectiveLowPct));
    return Math.max(0.1, Math.max(Math.abs(effectiveLowPct), Math.abs(effectiveHighPct)));
  }, [signMode, effectiveLowPct, effectiveHighPct]);

  const handleToggleSign = () => {
    setRangeMode('preset');
    setCustomLowPrice(null);
    setCustomHighPrice(null);
    setPlan(null);

    const w = currentCustomWidth > 0 ? currentCustomWidth : 20;
    if (signMode === 'both') {
      // Cycle from 'both' (±) to 'up' (+)
      setLowPct(0);
      setHighPct(w);
    } else if (signMode === 'up') {
      // Cycle from 'up' (+) to 'down' (−)
      setLowPct(-w);
      setHighPct(0);
    } else {
      // Cycle from 'down' (−) to 'both' (±)
      setLowPct(-w);
      setHighPct(w);
    }
  };

  const handleCustomWidthChange = (newWidth: number) => {
    setRangeMode('preset');
    setCustomLowPrice(null);
    setCustomHighPrice(null);
    setPlan(null);

    const w = Math.min(900, Math.max(0.1, newWidth));
    if (signMode === 'both') {
      setLowPct(-w);
      setHighPct(w);
    } else if (signMode === 'up') {
      setLowPct(0);
      setHighPct(w);
    } else {
      setLowPct(-w);
      setHighPct(0);
    }
  };

  // Standard LP behavior: when two-sided, typing into either token automatically
  // balances the counterpart input to match the range's exact asset ratio.
  // When single-sided (- or +), typing into the counterpart token automatically adapts the range.
  const typedAmount = (which: 'quote' | 'token', v: string): void => {
    setPlan(null);
    if (which === 'quote') {
      setAmountQuote(v);
    } else {
      setAmountToken(v);
    }

    const val = parseFloat(v);
    if (!v.trim() || isNaN(val) || val <= 0) {
      if (side === 'both') {
        if (which === 'quote') setAmountToken('');
        else setAmountQuote('');
      }
      return;
    }

    // "kecuali user isi amount, otomatis ganti range"
    // Entering Token while on a - range automatically adapts range to ± or +
    if (side === 'down' && which === 'token') {
      const qVal = parseFloat(amountQuote);
      setRangeMode('preset');
      setCustomLowPrice(null);
      setCustomHighPrice(null);
      if (qVal > 0 && spot > 0) {
        setLowPct(-10);
        setHighPct(10);
        const lowP = spot * 0.9;
        const highP = spot * 1.1;
        const neededQuote = pairedAmount(lowP, highP, spot, 'token', val);
        setAmountQuote(formatQuoteAmount(neededQuote, isWethQuote));
      } else {
        setLowPct(0);
        setHighPct(50);
      }
      return;
    }

    // Entering Quote while on a + range automatically adapts range to ± or -
    if (side === 'up' && which === 'quote') {
      const tVal = parseFloat(amountToken);
      setRangeMode('preset');
      setCustomLowPrice(null);
      setCustomHighPrice(null);
      if (tVal > 0 && spot > 0) {
        setLowPct(-10);
        setHighPct(10);
        const lowP = spot * 0.9;
        const highP = spot * 1.1;
        const neededToken = pairedAmount(lowP, highP, spot, 'quote', val);
        setAmountToken(formatTokenAmount(neededToken));
      } else {
        setLowPct(-20);
        setHighPct(0);
      }
      return;
    }

    // When two-sided (both), automatically sync counterpart to maintain exact curve ratio
    if (side === 'both') {
      if (!(lowPrice > 0) || !(highPrice > lowPrice) || !(spot > 0)) return;
      if (which === 'quote') {
        const neededToken = pairedAmount(lowPrice, highPrice, spot, 'quote', val);
        setAmountToken(formatTokenAmount(neededToken));
      } else {
        const neededQuote = pairedAmount(lowPrice, highPrice, spot, 'token', val);
        setAmountQuote(formatQuoteAmount(neededQuote, isWethQuote));
      }
    }
  };

  const rebalanceAmounts = useCallback(
    (targetLow: number, targetHigh: number) => {
      if (!(spot > 0) || !(targetHigh > targetLow)) return;

      const qVal = parseFloat(amountQuoteRef.current) || 0;
      const tVal = parseFloat(amountTokenRef.current) || 0;
      if (qVal <= 0 && tVal <= 0) return;

      const quotePriceUsd = isWethQuote ? ethPrice : 1;
      const tokenPriceUsd = spot > 0 ? (isWethQuote ? spot * ethPrice : spot) : 0;
      const currentTotalUsd = (qVal * quotePriceUsd) + (tVal * tokenPriceUsd);
      if (currentTotalUsd <= 0) return;

      const { quoteRatio: newQuoteRatio, tokenRatio: newTokenRatio } = rangeSplitRatio(targetLow, targetHigh, spot);
      const targetSide: Side = targetHigh <= spot ? 'down' : targetLow >= spot ? 'up' : 'both';

      if (targetSide === 'down') {
        const targetQuote = quotePriceUsd > 0 ? currentTotalUsd / quotePriceUsd : 0;
        const formattedQuote = formatQuoteAmount(targetQuote, isWethQuote);
        setAmountQuote(formattedQuote);
        setAmountToken('');
        amountQuoteRef.current = formattedQuote;
        amountTokenRef.current = '';
      } else if (targetSide === 'up') {
        const targetToken = tokenPriceUsd > 0 ? currentTotalUsd / tokenPriceUsd : 0;
        const formattedToken = formatTokenAmount(targetToken);
        setAmountQuote('');
        setAmountToken(formattedToken);
        amountQuoteRef.current = '';
        amountTokenRef.current = formattedToken;
      } else {
        const targetQuoteUsd = currentTotalUsd * newQuoteRatio;
        const targetTokenUsd = currentTotalUsd * newTokenRatio;
        const targetQuote = quotePriceUsd > 0 ? targetQuoteUsd / quotePriceUsd : 0;
        const targetToken = tokenPriceUsd > 0 ? targetTokenUsd / tokenPriceUsd : 0;

        const formattedQuote = formatQuoteAmount(targetQuote, isWethQuote);
        const formattedToken = formatTokenAmount(targetToken);
        setAmountQuote(formattedQuote);
        setAmountToken(formattedToken);
        amountQuoteRef.current = formattedQuote;
        amountTokenRef.current = formattedToken;
      }
    },
    [spot, isWethQuote, ethPrice],
  );

  useEffect(() => {
    if (!(spot > 0) || !(highPrice > lowPrice)) return;
    rebalanceAmounts(lowPrice, highPrice);
  }, [lowPrice, highPrice, spot, rebalanceAmounts]);

  const fillFundingPct = (pct: number) => {
    let usableFund = 0;
    if (fundWith === 'eth') {
      usableFund = Math.max(0, (ethBalance ?? 0) - dynamicGasReserveEth);
    } else if (fundWith === 'usdg') {
      usableFund = Math.max(0, usdgBalance ?? 0);
    } else if (fundWith === 'usdc') {
      usableFund = Math.max(0, snap?.wallet?.usdg ?? quoteBalance ?? 0);
    } else {
      usableFund = isWethQuote ? Math.max(0, (quoteBalance ?? 0) - dynamicGasReserveEth) : Math.max(0, quoteBalance ?? 0);
    }
    if (usableFund <= 0) return;

    const fundAmount = usableFund * (pct / 100);
    const fundPriceUsd = fundWith === 'eth' ? (ethPrice > 0 ? ethPrice : 0) : 1;
    const totalUsdBudget = fundPriceUsd > 0 ? fundAmount * fundPriceUsd : 0;
    if (totalUsdBudget <= 0) return;

    setPlan(null);

    const quotePriceUsd = isWethQuote ? ethPrice : 1;
    const tokenPriceUsd = spot > 0 ? (isWethQuote ? spot * ethPrice : spot) : 0;
    const targetSide: Side = side === 'down' || highPrice <= spot ? 'down' : side === 'up' || lowPrice >= spot ? 'up' : 'both';

    if (targetSide === 'down') {
      const targetQuote = quotePriceUsd > 0 ? totalUsdBudget / quotePriceUsd : 0;
      const formattedQuote = formatQuoteAmount(targetQuote, isWethQuote);
      setAmountQuote(formattedQuote);
      setAmountToken('');
      amountQuoteRef.current = formattedQuote;
      amountTokenRef.current = '';
    } else if (targetSide === 'up') {
      const targetToken = tokenPriceUsd > 0 ? totalUsdBudget / tokenPriceUsd : 0;
      const formattedToken = formatTokenAmount(targetToken);
      setAmountQuote('');
      setAmountToken(formattedToken);
      amountQuoteRef.current = '';
      amountTokenRef.current = formattedToken;
    } else {
      const targetQuoteUsd = totalUsdBudget * quoteRatio;
      const targetTokenUsd = totalUsdBudget * tokenRatio;

      const targetQuote = quotePriceUsd > 0 ? targetQuoteUsd / quotePriceUsd : 0;
      const targetToken = tokenPriceUsd > 0 ? targetTokenUsd / tokenPriceUsd : 0;

      const formattedQuote = formatQuoteAmount(targetQuote, isWethQuote);
      const formattedToken = formatTokenAmount(targetToken);
      setAmountQuote(formattedQuote);
      setAmountToken(formattedToken);
      amountQuoteRef.current = formattedQuote;
      amountTokenRef.current = formattedToken;
    }
  };

  const fillQuoteDirectPct = (pct: number) => {
    const usable = isWethQuote ? Math.max(0, (quoteBalance ?? 0) - dynamicGasReserveEth) : Math.max(0, quoteBalance ?? 0);
    if (usable <= 0) return;
    const target = usable * (pct / 100);
    typedAmount('quote', formatQuoteAmount(target, isWethQuote));
  };

  const fillTokenDirectPct = (pct: number) => {
    const usable = Math.max(0, tokenBalance ?? 0);
    if (usable <= 0) return;
    const target = usable * (pct / 100);
    typedAmount('token', formatTokenAmount(target));
  };

  const onQuoteFillPct = fundWith ? fillFundingPct : fillQuoteDirectPct;
  const onTokenFillPct = fundWith ? fillFundingPct : fillTokenDirectPct;

  const quoteSecondaryValue = useMemo(() => {
    const qVal = parseFloat(amountQuote);
    if (!Number.isFinite(qVal) || qVal <= 0) return undefined;

    if (fundWith === 'eth') {
      const neededEth = isWethQuote ? qVal : (ethPrice > 0 ? qVal / ethPrice : 0);
      return `≈ ${neededEth >= 0.0001 ? neededEth.toFixed(4) : neededEth.toPrecision(4)} ETH ($${(neededEth * ethPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    }
    if (fundWith === 'usdg' || fundWith === 'usdc') {
      const neededUsdg = isWethQuote ? qVal * ethPrice : qVal;
      return `≈ $${neededUsdg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${fundWith.toUpperCase()}`;
    }
    const usdVal = isWethQuote ? qVal * ethPrice : qVal;
    return `≈ $${usdVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [amountQuote, fundWith, isWethQuote, ethPrice]);

  const tokenSecondaryValue = useMemo(() => {
    const tVal = parseFloat(amountToken);
    if (!Number.isFinite(tVal) || tVal <= 0) return undefined;

    if (side === 'up' || (side === 'both' && fundWith)) {
      if (fundWith === 'eth') {
        const neededEth = tokenToFunding(tVal, 'eth');
        return `≈ ${neededEth >= 0.0001 ? neededEth.toFixed(4) : neededEth.toPrecision(4)} ETH ($${(neededEth * ethPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
      }
      if (fundWith === 'usdg' || fundWith === 'usdc') {
        const neededUsdg = tokenToFunding(tVal, fundWith);
        return `≈ $${neededUsdg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${fundWith.toUpperCase()}`;
      }
    }
    const tokenPriceUsd = spot > 0 ? (isWethQuote ? spot * ethPrice : spot) : 0;
    return `≈ $${(tVal * tokenPriceUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [amountToken, side, fundWith, isWethQuote, spot, ethPrice]);

  const stepEdge = (edge: 'min' | 'max', d: 1 | -1): void => {
    const price = edge === 'min' ? lowPrice : highPrice;
    if (price > 0) setEdgePrice(edge, price * (1 + d * 0.005));
  };

  const renderCompactHeader = () => (
    <div className="flex flex-nowrap items-center justify-between gap-3 px-3.5 h-10 border-b border-border/30 bg-muted/15 backdrop-blur-md shrink-0 overflow-x-auto no-scrollbar">
      {/* Left: Token Pair Identity with Circular Avatars */}
      <div className="flex items-center gap-2.5 min-w-0 shrink-0">
        <Link
          href="/discover"
          className="flex items-center justify-center size-7 rounded-lg border border-border/50 bg-background/60 hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all duration-150 shrink-0 cursor-pointer shadow-2xs"
          title="Back to Discover"
          aria-label="Back to Discover"
        >
          <ChevronLeft className="size-4" />
        </Link>
        <PairAvatar
          baseSymbol={symbol}
          quoteSymbol={quote}
          baseAddress={token}
          quoteAddress={quoteAddress}
          baseImg={tokenImageUrl}
          quoteImg={quoteImageUrl}
          size="md"
        />

        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1 leading-tight shrink-0">
            <span className="font-bold text-sm tracking-tight text-foreground flex items-center gap-1">
              <span>{symbol}</span>
              <span className="text-muted-foreground/40 font-normal">/</span>
              <span className="text-muted-foreground">{quote}</span>
            </span>
            {launchpadMeta && (
              <a
                href={launchpadMeta.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center shrink-0 opacity-85 hover:opacity-100 hover:scale-115 transition-all cursor-pointer select-none ml-1"
                title={`Launchpad: ${launchpadMeta.name}`}
              >
                <LaunchpadAvatar launchpad={launchpadMeta.name} size={16} />
              </a>
            )}
          </div>

          {/* Contract Address Pill */}
          <div className="hidden sm:inline-flex items-center h-5 px-2 gap-1.5 rounded-4xl border border-border/40 bg-muted/25 font-mono text-xs text-muted-foreground">
            <span>{shortAddr(token)}</span>
            <div className="flex items-center gap-0.5 border-l border-border/40 pl-1.5 ml-0.5">
              <button
                type="button"
                onClick={() => copyWithFeedback(token, 'ca-header', 'Contract address copied')}
                aria-label="Copy token contract address"
                className="hover:text-foreground p-0.5 rounded transition-colors inline-flex items-center justify-center cursor-pointer"
                title="Copy Contract Address"
              >
                {copiedKey === 'ca-header' ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
              </button>
              <a
                href={formatUrl(`/token/${token}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground p-0.5 rounded transition-colors inline-flex items-center justify-center"
                title="View on explorer"
                aria-label="View on explorer"
              >
                <ExternalLink className="size-3" />
              </a>
              <a
                href={`https://gmgn.ai/robinhood/token/enclavium_${token.toLowerCase()}`}
                target="_blank"
                rel="noreferrer"
                className="hover:opacity-80 p-0.5 rounded transition-opacity inline-flex items-center justify-center text-foreground"
                title="View on GMGN"
              >
                <img src="/platforms/gmgn.png" alt="GMGN" className="size-3 shrink-0 rounded-xs" />
              </a>
            </div>
          </div>

          {/* Badges: Pool specs on left, Dynamic / Hook & Warnings on right */}
          <div className="flex items-center gap-1">
            <div className="h-5 px-2 gap-1.5 rounded-4xl border border-border/40 bg-muted/25 font-mono text-xs text-muted-foreground inline-flex items-center">
              <ChainAvatar chainId={resolveChainId(detectedChain)} size={12} />
              <ProtocolAvatar protocol={protocolInfo.id} size={12} />
              <span>{protocolInfo.version.toUpperCase()}</span>
            </div>
            {isDynamicFee && (
              <div className="h-5 px-2 rounded-4xl border border-border/40 bg-muted/25 font-mono text-xs text-muted-foreground inline-flex items-center gap-1">
                Dynamic
              </div>
            )}
            <div className="h-5 px-2 rounded-4xl border border-border/40 bg-muted/25 font-mono text-xs text-muted-foreground inline-flex items-center gap-1">
              {spacingBadgeText}
            </div>
            <div className="h-5 px-2 rounded-4xl border border-border/40 bg-muted/25 font-mono text-xs text-muted-foreground inline-flex items-center gap-1 tabular">
              {isDynamicFee ? '0.00%' : feeTier(fee)}
            </div>
            {isRwa && (
              <div className="h-5 px-2 rounded-4xl border border-border/40 bg-muted/25 font-mono text-xs text-muted-foreground inline-flex items-center gap-1">
                RWA
              </div>
            )}
            <FlagBadges flags={activeFlags} />
          </div>
        </div>
      </div>

      {/* Right: Essential Pool Performance Strip */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 text-xs font-mono shrink-0">
        {/* Spot Price */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-sans text-muted-foreground font-medium shrink-0">Price</span>
          <span
            className={cn(
              'font-semibold tabular-nums font-mono text-xs leading-none transition-colors duration-300 inline-flex items-baseline',
              moved === 'up'
                ? 'text-emerald-500'
                : moved === 'down'
                  ? 'text-rose-500'
                  : 'text-foreground',
            )}
          >
            <span>
              {spot
                ? `$${formatSubscriptPrice(spotUsd || spot)}`
                : '—'}
            </span>
          </span>
        </div>

        <Separator orientation="vertical" className="h-3.5 bg-border/40" />

        {/* Market Cap */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-sans text-muted-foreground font-medium shrink-0">MCap</span>
          <span className="font-semibold tabular-nums font-mono text-foreground text-xs leading-none">
            {liveMcap ? compactUsd(liveMcap) : '—'}
          </span>
        </div>

        <Separator orientation="vertical" className="h-3.5 bg-border/40" />

        {/* TVL */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-sans text-muted-foreground font-medium shrink-0">TVL</span>
          <span className="font-semibold tabular-nums font-mono text-foreground text-xs leading-none">
            {totalTvl > 0 ? compactUsd(totalTvl) : '—'}
          </span>
        </div>

        <Separator orientation="vertical" className="h-3.5 bg-border/40" />

        {/* 24h Volume */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-sans text-muted-foreground font-medium shrink-0">24h Vol</span>
          <span className="font-semibold tabular-nums font-mono text-foreground text-xs leading-none">
            {vol24h > 0 ? compactUsd(vol24h) : '—'}
          </span>
        </div>

        <Separator orientation="vertical" className="h-3.5 bg-border/40" />

        {/* 24h Fees */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-sans text-muted-foreground font-medium shrink-0">24h Fees</span>
          <span className="font-semibold tabular-nums font-mono text-foreground text-xs leading-none">
            {fees24hUsd > 0 ? compactUsd(fees24hUsd) : '$0.00'}
          </span>
        </div>

        <Separator orientation="vertical" className="h-3.5 bg-border/40" />

        {/* Fee APR */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-sans text-muted-foreground font-medium shrink-0">Fee APR</span>
          <span className="font-semibold tabular-nums font-mono text-emerald-500 text-xs leading-none">
            {calculatedApr > 0 ? feeAprFormatted : '—'}
          </span>
        </div>
      </div>
    </div>
  );

  const renderIntelDeck = () => (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Segmented Domain Tabs & Refresh Button */}
      <div className="p-2 border-b border-border/30 bg-muted/10 shrink-0 flex items-center justify-between gap-1.5">
        <div className="grid grid-cols-3 gap-1 bg-muted/40 p-0.5 rounded-lg border border-border/40 text-[11px] flex-1">
          <button
            type="button"
            onClick={() => setIntelTab('overview')}
            className={cn(
              'py-1 text-center font-medium rounded-md transition-all',
              intelTab === 'overview'
                ? 'bg-background text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setIntelTab('token')}
            className={cn(
              'py-1 text-center font-medium rounded-md transition-all',
              intelTab === 'token'
                ? 'bg-background text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Token
          </button>
          <button
            type="button"
            onClick={() => setIntelTab('metrics')}
            className={cn(
              'py-1 text-center font-medium rounded-md transition-all',
              intelTab === 'metrics'
                ? 'bg-background text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Metrics
          </button>
        </div>
      </div>

      {/* Scrollable Tab Content */}
      <div className="flex-1 min-h-0 overflow-y-auto app-scrollbar p-3 space-y-3 text-xs">
        {intelTab === 'overview' && (
          <>
            {/* Spot Price Card */}
            <div className="rounded-xl bg-muted/20 border border-border/30 p-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  Spot Price
                </span>
                {!isStableQuote && spot > 0 && (
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {formatSubscriptPrice(spot)} {quote}
                  </span>
                )}
              </div>
              <div className="text-xl font-bold tracking-tight text-foreground font-mono tabular-nums">
                ${formatSubscriptPrice(spotUsd || spot)}
              </div>
              {spot > 0 && (
                <div className="text-[10px] text-muted-foreground/75 font-mono">
                  1 {quote} ≈ {formatSubscriptPrice(1 / spot)} {symbol}
                </div>
              )}
            </div>

            {/* Focused Pool Contract & Security Specifications Card */}
            <div className="rounded-xl border border-border/40 bg-card/60 p-2.5 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  Pool & Contract Specifications
                </span>
              </div>

              {/* Protocol row */}
              <div className="flex items-center justify-between pt-1 border-t border-border/25 text-[11px]">
                <span className="text-muted-foreground">Protocol</span>
                <div className="flex items-center gap-1.5 font-mono text-foreground font-medium">
                  <ProtocolAvatar protocol={protocolInfo.id} size={13} />
                  <span>{protocolInfo.displayName}</span>
                </div>
              </div>

              {/* Pool ID row with quick copy & explorer link */}
              <div className="flex items-center justify-between pt-1 border-t border-border/25 text-[11px]">
                <span className="text-muted-foreground">Pool ID</span>
                <div className="flex items-center gap-1 font-mono text-muted-foreground/90">
                  <span>{shortAddr(poolId)}</span>
                  <button
                    type="button"
                    onClick={() => copyWithFeedback(poolId, 'pool-id', 'Pool ID copied')}
                    className="hover:text-foreground p-0.5 rounded transition-colors cursor-pointer"
                    title="Copy Pool ID"
                  >
                    {copiedKey === 'pool-id' ? <Check className="size-2.5 text-emerald-500" /> : <Copy className="size-2.5" />}
                  </button>
                  <a
                    href={formatUrl(`/address/${poolId}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground p-0.5 rounded transition-colors"
                    title="View on explorer"
                    aria-label="View on explorer"
                  >
                    <ExternalLink className="size-2.5" />
                  </a>
                </div>
              </div>

              {/* Hook Contract row (Only if pool actually has a hook) */}
              {hasHook && (
                <div className="flex items-center justify-between pt-1 border-t border-border/25 text-[11px]">
                  <div className="flex items-center gap-1 text-primary">
                    <FishingHook className="size-3 shrink-0" />
                    <span>Hook Contract</span>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-muted-foreground/90">
                    <span>{bins?.hooks ? shortAddr(bins.hooks) : 'Active Hook'}</span>
                    {bins?.hooks && (
                      <>
                        <button
                          type="button"
                          onClick={() => copyWithFeedback(bins.hooks!, 'hook-addr', 'Hook address copied')}
                          className="hover:text-foreground p-0.5 rounded transition-colors cursor-pointer"
                          title="Copy Hook Address"
                        >
                          {copiedKey === 'hook-addr' ? <Check className="size-2.5 text-emerald-500" /> : <Copy className="size-2.5" />}
                        </button>
                        <a
                          href={formatUrl(`/address/${bins.hooks}`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-foreground p-0.5 rounded transition-colors"
                          title="View on explorer"
                          aria-label="View on explorer"
                        >
                          <ExternalLink className="size-2.5" />
                        </a>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Safety verification & flags if any */}
              {activeFlags.length > 0 && (
                <div className="pt-1.5 border-t border-border/25 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1 font-semibold text-muted-foreground uppercase tracking-wider">
                      {blocked ? (
                        <OctagonAlert className="size-3 text-destructive shrink-0" />
                      ) : (
                        <AlertTriangle className="size-3 text-amber-500 shrink-0" />
                      )}
                      <span>Safety Flags</span>
                    </div>
                  </div>
                  <FlagBadges flags={activeFlags} />
                </div>
              )}
            </div>

            {/* Total Value Locked & Reserves */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Total Value Locked</span>
                <span className="text-sm font-bold text-foreground font-mono">{usd(bins?.tvlUsd ?? (totalTvl > 0 ? totalTvl : null))}</span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between rounded-lg bg-muted/15 border border-border/25 p-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <TokenAvatar symbol={symbol} address={token} src={tokenImageUrl} size="sm" />
                    <div className="truncate">
                      <div className="font-semibold text-foreground text-[11px] truncate">{symbol}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{shortAddr(token)}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold font-mono text-foreground text-[11px]">{reserveToken > 0 ? num(reserveToken) : '0.00'}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {compactUsd(reserveTokenUsd)} · {tokenTvlPct}%
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/15 border border-border/25 p-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <TokenAvatar
                      symbol={quote}
                      address={quoteAddress}
                      src={quoteImageUrl}
                      size="sm"
                    />
                    <div className="truncate">
                      <div className="font-semibold text-foreground text-[11px] truncate">{quote}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{quoteAddress ? shortAddr(quoteAddress) : '—'}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold font-mono text-foreground text-[11px]">{reserveQuote > 0 ? num(reserveQuote) : '0.00'}</div>
                    <div className="text-[9px] text-muted-foreground font-mono">
                      {compactUsd(reserveQuoteUsd)} · {quoteTvlPct}%
                    </div>
                  </div>
                </div>
              </div>

              {/* TVL Distribution bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>TVL Distribution</span>
                  <span className="font-mono text-foreground/80">{tokenTvlPct}% / {quoteTvlPct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden flex border border-border/30">
                  <div className="bg-primary h-full transition-all duration-500" style={{ width: `${tokenTvlPct}%` }} />
                  <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${quoteTvlPct}%` }} />
                </div>
              </div>
            </div>

            {/* Volume & Yield rows */}
            <div className="pt-2 border-t border-border/25 space-y-0.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Volume & Yield</div>
              <MetricRow label="24h Volume" value={usd(vol24h)} />
              <MetricRow label="24h Fees" value={usd(fees24hUsd)} highlight={fees24hUsd > 0} />
              <MetricRow label="24h Fees/TVL (APR)" value={feeAprFormatted} highlight={calculatedApr > 0} />
              <MetricRow label={spacingLabel} value={isDlmm ? `${binStep}` : `${binStep} ticks`} />
              <MetricRow label="Base Fee" value={baseFeeDisplay} />
              <MetricRow label="Total Trading Fee" value={totalTradingFeeDisplay} />
            </div>
          </>
        )}

        {intelTab === 'token' && (
          <>
            {/* Clean Premium Token Identity Bar */}
            <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-card/40 border border-border/40 shadow-2xs">
              {/* Left: Token Info */}
              <div className="flex items-center gap-2.5 min-w-0">
                <TokenAvatar symbol={symbol} address={token} src={tokenImageUrl} size="sm" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-bold text-sm text-foreground tracking-tight shrink-0">
                      {symbol}
                    </span>
                    {tokenMeta?.name && tokenMeta.name.toLowerCase() !== symbol.toLowerCase() && (
                      <span className="text-xs text-muted-foreground truncate font-normal">
                        {tokenMeta.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/80 mt-0.5">
                    <span>{shortAddr(token)}</span>
                    <button
                      type="button"
                      onClick={() => copyWithFeedback(token, 'ca-card', 'Contract address copied')}
                      className="hover:text-foreground p-0.5 rounded transition-colors cursor-pointer inline-flex items-center justify-center text-muted-foreground"
                      title="Copy Contract Address"
                    >
                      {copiedKey === 'ca-card' ? <Check className="size-2.5 text-emerald-500" /> : <Copy className="size-2.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: Verified / Unverified Badge */}
              <div className="ml-auto shrink-0">
                {isTokenVerified ? (
                  <Badge
                    variant="outline"
                    className="h-5 px-2 text-[10px] font-medium rounded-4xl border-emerald-500/30 text-emerald-500 bg-emerald-500/10 inline-flex items-center gap-1 shadow-none"
                  >
                    <CheckCircle2 className="size-3 shrink-0" />
                    <span>Verified</span>
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="h-5 px-2 text-[10px] font-medium rounded-4xl border-rose-500/30 text-rose-500 bg-rose-500/10 inline-flex items-center gap-1 shadow-none"
                  >
                    <AlertTriangle className="size-3 shrink-0" />
                    <span>Unverified</span>
                  </Badge>
                )}
              </div>
            </div>


            {/* Performance & Order Flow Activity Widget */}
            <div className="rounded-xl border border-border/40 bg-card/60 flex flex-col overflow-hidden shadow-2xs">
              <nav className="relative flex w-full items-center gap-1 p-1.5 bg-muted/20 border-b border-border/30" aria-label="Timeframe Tabs">
                {(['5m', '1h', '6h', '24h'] as const).map((tf) => {
                  const delta =
                    tf === '5m'
                      ? priceDeltas.d5m
                      : tf === '1h'
                      ? priceDeltas.d1h
                      : tf === '6h'
                      ? priceDeltas.d6h
                      : priceDeltas.d24h;
                  const isActive = tokenTf === tf;
                  return (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setTokenTf(tf)}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex flex-1 flex-col items-center justify-between h-10 min-w-0 overflow-hidden p-1 rounded-lg transition-colors cursor-pointer',
                        isActive
                          ? 'bg-background text-foreground shadow-2xs font-semibold'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                      )}
                    >
                      <span className="text-[10px] truncate uppercase font-sans font-medium text-muted-foreground/90">{tf}</span>
                      <span
                        className={cn(
                          'text-xs font-mono tabular-nums font-semibold',
                          delta === null
                            ? 'text-muted-foreground'
                            : delta > 0
                              ? 'text-emerald-500'
                              : delta < 0
                                ? 'text-rose-500'
                                : 'text-foreground',
                        )}
                      >
                        {delta === null ? '—' : delta > 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
                      </span>
                    </button>
                  );
                })}
              </nav>

              <div className="p-2.5 space-y-2.5 text-xs">
                {/* 3 Metrics: Txn, Vol, Net Buy */}
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="flex flex-col gap-0.5 rounded-lg bg-muted/20 border border-border/30 p-2">
                    <span className="text-[10px] uppercase font-medium text-muted-foreground/80 tracking-tight">
                      {tokenTf} Txns
                    </span>
                    <span className="text-xs font-mono font-semibold text-foreground tabular-nums">
                      {geckoStats.txns > 0 ? geckoStats.txns.toLocaleString() : '0'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 rounded-lg bg-muted/20 border border-border/30 p-2">
                    <span className="text-[10px] uppercase font-medium text-muted-foreground/80 tracking-tight">
                      {tokenTf} Vol
                    </span>
                    <span className="text-xs font-mono font-semibold text-foreground tabular-nums">
                      {geckoStats.vol > 0 ? compactUsd(geckoStats.vol) : '—'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 rounded-lg bg-muted/20 border border-border/30 p-2">
                    <span className="text-[10px] uppercase font-medium text-muted-foreground/80 tracking-tight">
                      Net Flow
                    </span>
                    <span
                      className={cn(
                        'text-xs font-mono font-semibold tabular-nums',
                        geckoStats.netBuy > 0
                          ? 'text-emerald-500'
                          : geckoStats.netBuy < 0
                            ? 'text-rose-500'
                            : 'text-muted-foreground',
                      )}
                    >
                      {geckoStats.netBuy > 0
                        ? `+${compactUsd(geckoStats.netBuy)}`
                        : geckoStats.netBuy < 0
                          ? `-${compactUsd(Math.abs(geckoStats.netBuy))}`
                          : '$0.00'}
                    </span>
                  </div>
                </div>

                {/* Order Flow Ratio Bar (Buys vs Sells) */}
                <div className="rounded-lg bg-muted/20 border border-border/30 p-2 space-y-1.5">
                  {geckoStats.txns > 0 ? (
                    <>
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase font-semibold text-emerald-500">Buys</span>
                          <span className="font-mono font-medium text-foreground">{geckoStats.buys.toLocaleString()}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">({(geckoStats.buyRatio * 100).toFixed(0)}%)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-muted-foreground">({((1 - geckoStats.buyRatio) * 100).toFixed(0)}%)</span>
                          <span className="font-mono font-medium text-foreground">{geckoStats.sells.toLocaleString()}</span>
                          <span className="text-[10px] uppercase font-semibold text-rose-500">Sells</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden flex border border-border/20">
                        <div
                          className="bg-emerald-500 h-full transition-all duration-300"
                          style={{ width: `${(geckoStats.buyRatio * 100).toFixed(1)}%` }}
                        />
                        <div
                          className="bg-rose-500 h-full transition-all duration-300"
                          style={{ width: `${((1 - geckoStats.buyRatio) * 100).toFixed(1)}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="py-2 text-center select-none">
                      <p className="text-xs text-muted-foreground">No order flow activity in {tokenTf}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Token details */}
            <div className="space-y-0.5">
              <MetricRow label="Age" value={formatAge(tokenCreatedAt, poolEarliestCandleTime)} />
              <MetricRow label="Market Cap" value={liveMcap ? compactUsd(liveMcap) : (bins?.marketCap ? compactUsd(bins.marketCap) : (cachedPool?.marketCap ? compactUsd(cachedPool.marketCap) : ((resolved as any)?.marketCap ? compactUsd((resolved as any).marketCap) : '—')))} />
              <MetricRow label="FDV" value={liveFdv ? compactUsd(liveFdv) : (bins?.fdv ? compactUsd(bins.fdv) : (tokenMeta?.fdv ? compactUsd(tokenMeta.fdv) : (cachedPool?.fdv ? compactUsd(cachedPool.fdv) : ((resolved as any)?.fdv ? compactUsd((resolved as any).fdv) : '—'))))} />
              <MetricRow label="Holders" value={holdersFormatted} />
              <MetricRow label="Top 10 H." value={top10Formatted} />
              <MetricRow label="Dev Holding" value={devHoldingFormatted} highlight={devHoldingFormatted !== '—' && isDevHoldingSafe} />
              <MetricRow label="Freeze Auth" value={freezeAuthValue} highlight={isFreezeAuthSafe} />
              <MetricRow label="Mint Auth" value={mintAuthValue} highlight={isMintAuthSafe} />
              <MetricRow label="Total Supply" value={bins?.totalSupply ? compactUsd(bins.totalSupply).replace('$', '') : (tokenMeta?.supply ? compactUsd(tokenMeta.supply).replace('$', '') : (cachedPool?.totalSupply ? compactUsd(cachedPool.totalSupply).replace('$', '') : ((resolved as any)?.totalSupply ? compactUsd((resolved as any).totalSupply).replace('$', '') : (tokenSupply && tokenSupply > 0 ? compactUsd(tokenSupply).replace('$', '') : '—'))))} />
            </div>
          </>
        )}

        {intelTab === 'metrics' && (
          <>
            <div className="space-y-0.5">
              <MetricRow label="Pool Age" value={formatAge(poolCreatedAt, poolEarliestCandleTime)} />
              <MetricRow label="Volatility" value={volatilityFormatted} />
              <MetricRow label="Active TVL" value={activeTvlFormatted} sub={activeTvlSubFormatted} />
              <MetricRow label="Fees/Active TVL" value={feesActiveTvlFormatted} highlight={feesActiveTvlFormatted !== '0.00%'} />
              <MetricRow label="Volume/Active TVL" value={volumeActiveTvlFormatted} />
              <Separator className="my-1 border-border/20" />
              <MetricRow label="Total LPs" value={totalLpsFormatted} />
              <MetricRow label="New LPs (24h)" value={newLps24hFormatted} />
              <MetricRow label="Positions Created" value={positionsCreatedFormatted} />
              <MetricRow label="Open Positions" value={openPositionsFormatted} />
              <MetricRow label="In Range Positions" value={inRangePositionsFormatted} sub={`+${inRangePct}%`} highlight />
              <Separator className="my-1 border-border/20" />
              <MetricRow label="Base Fee" value={baseFeeDisplay} />
              {Number(dynamicFeePct) > 0 && <MetricRow label="Dynamic Fee" value={`${dynamicFeePct}%`} />}
              <MetricRow label="Total Trading Fee" value={totalTradingFeeDisplay} />
              <MetricRow label="Max Fee Cap" value="10.00%" />
              <MetricRow label="Protocol Fee" value={`${protocolFeePct}%`} />
              <MetricRow label="Fee Token" value={quote} />
              <MetricRow label="Limit Order Bonus" value={`${limitOrderBonusPct}%`} />
              <Separator className="my-1 border-border/20" />
              <MetricRow label="Avg Fees/Min" value={avgFeesPerMinFormatted} />
              <MetricRow label="Avg Vol/Min" value={avgVolPerMinFormatted} />
              <MetricRow label="Traders (24h)" value={traders24hFormatted} />
              <MetricRow label="Swaps (24h)" value={swaps24hFormatted} />
              <MetricRow label="Net Deposits" value={netDepositsFormatted} />
            </div>
          </>
        )}
      </div>
    </div>
  );

  const renderCenterPanel = () => (
    <ResizablePanelGroup orientation="vertical" className="h-full w-full min-h-0 bg-card/10">
      {/* 1. Price Action Section (Ratio ~65%) */}
      <ResizablePanel
        defaultSize="65%"
        minSize="30%"
        maxSize="80%"
        className="flex flex-col min-h-0 overflow-hidden"
      >
        {/* Candlestick Chart Area (Flex-1, Fullscreen by default) */}
        <div className="flex-1 min-h-0 w-full overflow-hidden relative">
          <div className="w-full h-full p-2 pb-1">
            <CandleChart
              key={effectivePoolId}
              candles={history?.candles ?? NO_CANDLES}
              rangeLow={lowPrice * chartQuoteMult}
              rangeHigh={highPrice * chartQuoteMult}
              displayUnit={chartUnit}
              onDisplayUnitChange={setChartUnit}
              mcapMultiplier={effectiveMcapMultiplier ?? (effectiveCirculatingSupply && effectiveCirculatingSupply > 0 ? effectiveCirculatingSupply : null)}
              quoteSymbol={quote}
              livePrice={
                spotUsd && spotUsd > 0
                  ? spotUsd
                  : bins?.priceUsd && bins.priceUsd > 0
                    ? bins.priceUsd
                    : spot * chartQuoteMult
              }
              liveTime={liveTime ?? live?.at}
              owned={chartRanges}
              activeTimeframe={interval}
              onTimeframeChange={handleTimeframeChange}
              onDragCommit={(edge, price) => {
                const commitPrice = chartQuoteMult > 0 && chartQuoteMult !== 1 ? price / chartQuoteMult : price;
                setEdgePrice(edge, commitPrice);
                setPlan(null);
              }}
              loading={historyLoading || history === null}
              onRefresh={handleRefreshChart}
              refreshing={chartRefreshing}
              className="w-full h-full min-h-0"
            />
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* 2. Positions Section (Default 35%) */}
      <ResizablePanel
        panelRef={positionsPanelRef}
        defaultSize="35%"
        minSize="20%"
        maxSize="65%"
        className="flex flex-col min-h-0 overflow-hidden bg-card/40 backdrop-blur-xl"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-2.5 py-1.5 gap-2 border-b border-border/40 shrink-0 select-none">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="font-semibold text-xs tracking-tight text-foreground shrink-0">
              Positions
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              disabled={!hasClaimableFees || claimingFees || action.busy}
              onClick={() => void claimSelectedFees()}
              className={cn(
                'h-6 px-2 text-[10px] sm:text-[11px] font-medium shadow-2xs transition-all duration-150 active:scale-[0.98] gap-1',
                hasClaimableFees
                  ? 'border-border/60 hover:bg-muted/80 text-foreground cursor-pointer'
                  : 'opacity-40 border-border/30 text-muted-foreground cursor-not-allowed',
              )}
              title={
                hasClaimableFees
                  ? `Claim ${usd(selectedClaimableFeesUsd)} in fees from ${dockTab === 'this-pool' ? 'this pool' : 'all pools'}`
                  : 'No fees to claim'
              }
            >
              <ArrowDownToLine className="size-3 shrink-0" />
              <span>{claimingFees ? 'Claiming…' : 'Claim'}</span>
            </Button>

            <div className="flex items-center gap-0.5 bg-muted/40 p-0.5 rounded-md border border-border/30">
              <button
                type="button"
                onClick={() => setDockTab('this-pool')}
                className={cn(
                  'px-2 py-0.5 text-[11px] font-medium rounded transition-all flex items-center gap-1 cursor-pointer',
                  dockTab === 'this-pool'
                    ? 'bg-background text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span>This Pool</span>
                <Badge
                  variant={poolPositions.length > 0 ? 'default' : 'secondary'}
                  className="text-[9px] px-1 py-0 font-mono h-3.5 min-w-3.5 flex items-center justify-center leading-none"
                >
                  {poolPositions.length}
                </Badge>
              </button>
              <button
                type="button"
                onClick={() => setDockTab('all-pools')}
                className={cn(
                  'px-2 py-0.5 text-[11px] font-medium rounded transition-all flex items-center gap-1 cursor-pointer',
                  dockTab === 'all-pools'
                    ? 'bg-background text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span>All Pools</span>
                <Badge
                  variant={allPositions.length > 0 ? 'default' : 'secondary'}
                  className="text-[9px] px-1 py-0 font-mono h-3.5 min-w-3.5 flex items-center justify-center leading-none"
                >
                  {allPositions.length}
                </Badge>
              </button>
            </div>
          </div>
        </div>

        {/* Positions List */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden app-scrollbar w-full max-w-full">
          {pendingOperations.length > 0 && (
            <div className="p-2 border-b border-primary/20 bg-primary/5 space-y-1.5">
              {pendingOperations.map((op) => (
                <div key={op.id || op.jobId} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Loader2 className="size-3 animate-spin text-primary shrink-0" />
                    <span className="truncate font-medium text-foreground">{op.label || 'Operation in progress…'}</span>
                  </div>
                  {op.hash && (
                    <a
                      href={formatUrl(`/tx/${op.hash}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-mono text-[10px] shrink-0 inline-flex items-center gap-0.5"
                    >
                      {op.hash.slice(0, 6)}…
                      <ExternalLink className="size-2.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
          {dockTab === 'this-pool' ? (
            poolPositions.length > 0 ? (
              <div className="w-full max-w-full min-w-0 divide-y divide-border/20">
                {poolPositions.map((p, idx) => (
                  <div
                    key={p.key}
                    onClick={() => setFocusedPositionKey(p.key)}
                    className="w-full max-w-full min-w-0"
                  >
                    <PositionCard
                      p={p}
                      variant="compact"
                      canExpand={false}
                      showDetails={true}
                      onAdoptPreset={handleAdoptPreset}
                      isLatest={idx === 0}
                      isActiveOnChart={activePosition?.key === p.key && poolPositions.length > 1}
                      positionIndex={idx}
                      positionColor={positionColorMap.get(p.key) || POSITION_COLORS[idx % POSITION_COLORS.length]}
                      currentPoolId={poolId}
                      bins={bins?.map?.bins ?? []}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full min-h-18 flex items-center justify-center py-6 text-center select-none w-full">
                <p className="text-sm text-muted-foreground">No open positions in {symbol}/{quote}</p>
              </div>
            )
          ) : (
            allPositions.length > 0 ? (
              <div className="w-full max-w-full min-w-0 divide-y divide-border/20">
                {allPositions.map((p, idx) => (
                  <div
                    key={p.key}
                    onClick={() => {
                      setFocusedPositionKey(p.key);
                    }}
                    className="w-full max-w-full min-w-0"
                  >
                    <PositionCard
                      p={p}
                      variant="compact"
                      canExpand={false}
                      showDetails={false}
                      onAdoptPreset={cleanPoolId(p.poolId) === cleanPoolId(poolId) ? handleAdoptPreset : undefined}
                      onSwitchPool={cleanPoolId(p.poolId) !== cleanPoolId(poolId) ? handleSwitchPool : undefined}
                      isLatest={idx === 0 && cleanPoolId(p.poolId) === cleanPoolId(poolId)}
                      positionIndex={idx}
                      positionColor={positionColorMap.get(p.key) || POSITION_COLORS[idx % POSITION_COLORS.length]}
                      currentPoolId={poolId}
                      bins={cleanPoolId(p.poolId) === cleanPoolId(poolId) ? (bins?.map?.bins ?? []) : undefined}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full min-h-18 flex items-center justify-center py-6 text-center select-none w-full">
                <p className="text-sm text-muted-foreground">No open positions across any pools</p>
              </div>
            )
          )}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );

  const renderDeployTerminal = () => (
    <div className="h-full flex-1 min-h-0 flex flex-col overflow-y-auto app-scrollbar p-3 space-y-2.5">
      {/* Dedicated Transaction Modal */}
      <ActionDialog
        action={action}
        title="Deposit"
        description={`Deploying liquidity into ${symbol}/${quote} pool…`}
        poolSymbol={symbol}
        quoteSymbol={quote}
        chainName={detectedChain === 'arc' ? 'Arc' : detectedChain === 'bnb' || detectedChain === 'bsc' ? 'BNB Chain' : detectedChain === 'solana' ? 'Solana' : 'Robinhood Chain'}
        amount={plan ? usd(plan.depositUsd) : totalDepositEstimateUsd > 0 ? usd(totalDepositEstimateUsd) : undefined}
        rangeLabel={rangeMode === 'preset' ? (SHAPES.find(s => s.low === effectiveLowPct && s.high === effectiveHighPct)?.label) : `${Math.round(effectiveLowPct)}% / ${Math.round(effectiveHighPct)}%`}
        onRetry={() => void handleExecute()}
      />

      <div className="space-y-2.5">
          <AiAnalysisCard
            key={aiPoolRef ? `${aiPoolRef.chainId ?? ''}:${aiPoolRef.poolId}` : 'none'}
            poolRef={aiPoolRef}
            quoteSymbol={quoteSym}
            tokenSymbol={symbol}
            appliedId={analysisIdForOpen}
            onApply={applyAiAnalysis}
            onAnalysis={setAiAnalysis}
          />

          {/* Interactive Range Picker (Visual Band & Draggable Sliders) */}
          <RangePicker
            bins={bins?.map?.bins ?? []}
            spot={spot}
            low={lowPrice}
            high={highPrice}
            amounts={{
              quote: Number(amountQuote) || 0,
              token: Number(amountToken) || 0,
              balance: zap,
            }}
            quoteSymbol={quoteSym}
            tokenSymbol={symbol}
            height={130}
            onChange={(newLow, newHigh) => {
              setRangeMode('custom');
              setCustomLowPrice(newLow);
              setCustomHighPrice(newHigh);
              if (spot > 0) {
                const newLowPct = Math.min(900, Math.max(-95, pctOf(newLow)));
                const newHighPct = Math.min(900, Math.max(-95, pctOf(newHigh)));
                setLowPct(Math.min(newLowPct, newHighPct - 0.1));
                setHighPct(Math.max(newHighPct, newLowPct + 0.1));
              }
              setPlan(null);
            }}
          />

          {/* Range Presets */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-foreground">Range Presets</span>
              <div className="text-[10px] text-muted-foreground font-mono">
                Spread: <span className="font-semibold text-foreground">{(effectiveHighPct - effectiveLowPct).toFixed(1)}%</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Presets Slider with Left/Right Arrows */}
              <div className="relative flex items-center min-w-0 flex-1">
                {canScrollLeft && (
                  <button
                    type="button"
                    onClick={() => scrollPresets('left')}
                    className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                    title="Scroll presets left"
                    aria-label="Scroll presets left"
                  >
                    <ChevronLeft className="size-3" />
                  </button>
                )}
                <div
                  ref={presetsRef}
                  onScroll={checkScrollState}
                  className="flex items-center gap-1 overflow-x-auto scrollbar-none scroll-smooth px-0.5 flex-1 min-w-0"
                >
                  {SHAPES.map((p) => (
                    <Choice
                      key={p.label}
                      active={rangeMode === 'preset' && lowPct === p.low && highPct === p.high}
                      className="px-1.5 py-0.5 text-[11px] shrink-0 whitespace-nowrap"
                      onClick={() => {
                        setRangeMode('preset');
                        setCustomLowPrice(null);
                        setCustomHighPrice(null);
                        setLowPct(p.low);
                        setHighPct(p.high);
                        setPlan(null);
                      }}
                    >
                      {p.label}
                    </Choice>
                  ))}
                </div>
                {canScrollRight && (
                  <button
                    type="button"
                    onClick={() => scrollPresets('right')}
                    className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                    title="Scroll presets right"
                    aria-label="Scroll presets right"
                  >
                    <ChevronRight className="size-3" />
                  </button>
                )}
              </div>

              {/* Custom Range Direction + Percent Input */}
              <div className="shrink-0">
                <PercentInput
                  signMode={signMode}
                  onToggleSign={handleToggleSign}
                  value={currentCustomWidth}
                  onChange={handleCustomWidthChange}
                />
              </div>
            </div>
          </div>

          {/* Price Boundaries */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-foreground">Price Boundaries</span>
              <div className="flex items-center w-[84px] h-[26px] rounded-lg border border-border/40 bg-muted/40 p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setBoundUnit('price')}
                  className={cn(
                    'flex-1 h-full flex items-center justify-center rounded-md font-medium transition-colors cursor-pointer',
                    boundUnit === 'price'
                      ? 'bg-background text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Price
                </button>
                <button
                  type="button"
                  disabled={!isMcapAvailable}
                  onClick={() => {
                    if (isMcapAvailable) setBoundUnit('mcap');
                  }}
                  title={!isMcapAvailable ? 'Market Cap unavailable (requires token supply & quote USD price)' : undefined}
                  className={cn(
                    'flex-1 h-full flex items-center justify-center rounded-md font-medium transition-colors cursor-pointer',
                    boundUnit === 'mcap'
                      ? 'bg-background text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                    !isMcapAvailable && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  MC
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <PriceBox
                label="Min Price"
                price={lowPrice}
                offset={effectiveLowPct}
                unit={boundUnit}
                perUnit={perUnit}
                priceMultiplier={chartQuoteMult}
                tokenSupply={effectiveCirculatingSupply ?? tokenSupply ?? 0}
                onSet={(p) => setEdgePrice('min', p)}
                onStep={(d) => stepEdge('min', d)}
              />
              <PriceBox
                label="Max Price"
                price={highPrice}
                offset={effectiveHighPct}
                unit={boundUnit}
                perUnit={perUnit}
                priceMultiplier={chartQuoteMult}
                tokenSupply={effectiveCirculatingSupply ?? tokenSupply ?? 0}
                onSet={(p) => setEdgePrice('max', p)}
                onStep={(d) => stepEdge('max', d)}
              />
            </div>
          </div>

          <Separator className="border-border/25" />

          {/* Deposit Amounts */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-foreground">Deposit Amounts</span>
              {fundingOptions.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Fund with</span>
                  <div className="flex items-center rounded-lg border border-border/40 bg-muted/40 p-0.5 text-[10px]">
                    {fundingOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleFundWithToggle(opt.id)}
                        className={cn(
                          'px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5',
                          fundWith === opt.id
                            ? 'bg-background text-foreground shadow-2xs font-semibold'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <TokenAvatar symbol={opt.symbol} src={opt.iconSrc} size="xs" className="size-3.5" />
                        <span>{opt.symbol}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <AmountRow
              symbol={quote}
              address={quoteAddress}
              imageSrc={quoteImage}
              balance={quoteRowBalance}
              balanceSymbol={quoteRowBalanceSymbol}
              gasReserve={dynamicGasReserveEth}
              value={amountQuote}
              placeholder="0.0"
              hint={
                side === 'up'
                  ? ''
                  : side === 'down'
                    ? '100% Quote'
                    : `${Math.round(quoteRatio * 100)}% target`
              }
              secondaryValue={quoteSecondaryValue}
              active={side !== 'up'}
              onChange={(v) => typedAmount('quote', v)}
              onFillPct={onQuoteFillPct}
            />

            <AmountRow
              symbol={symbol}
              address={token}
              imageSrc={tokenImageUrl}
              balance={tokenRowBalance}
              balanceSymbol={tokenRowBalanceSymbol}
              gasReserve={dynamicGasReserveEth}
              value={amountToken}
              placeholder="0.0"
              hint={
                side === 'down'
                  ? ''
                  : side === 'up'
                    ? '100% Token'
                    : `${Math.round(tokenRatio * 100)}% target`
              }
              secondaryValue={tokenSecondaryValue}
              active={side !== 'down'}
              onChange={(v) => typedAmount('token', v)}
              onFillPct={onTokenFillPct}
            />

            {/* Funding & Execution Settings: Auto-balance swap always available */}
            <div className="rounded-xl border border-border/30 bg-muted/15 p-2.5 space-y-2.5">
              {/* Auto-balance swap */}
              <div
                className="flex items-start justify-between gap-2.5 cursor-pointer select-none"
                onClick={() => {
                  setZap((z) => !z);
                  setPlan(null);
                }}
              >
                <div>
                  <span className="text-xs font-semibold text-foreground">Auto-balance swap</span>
                  <span className="text-muted-foreground block text-[10px] mt-0.5 leading-snug">
                    {zap
                      ? 'Auto-balances assets to match range ratio.'
                      : 'Requires exact deposit ratio without swapping.'}
                  </span>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={zap}
                    onCheckedChange={(v) => {
                      setZap(v);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Safety Risk Acknowledgement (Required when pool is blocked) */}
          {blocked && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-2.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                <OctagonAlert className="size-3.5 shrink-0" />
                <span>Safety Verification Advisory</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                This pool flagged critical safety signals. Capital deployed may be unrecoverable.
              </p>
              <label className="flex cursor-pointer items-center gap-2 pt-0.5 select-none">
                <input
                  type="checkbox"
                  checked={accepted}
                  className="accent-destructive size-3.5 rounded cursor-pointer mt-0.5"
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span className="font-medium text-destructive text-[11px]">
                  Acknowledge and proceed at own risk
                </span>
              </label>
            </div>
          )}

          {/* Live Execution Breakdown */}
          {plan ? (
            <div className="space-y-2.5 rounded-xl border border-border/40 bg-card/40 backdrop-blur-xs p-3 text-xs shadow-2xs">
              {/* Header row: Total deposit + badges */}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10.5px] font-medium text-muted-foreground block leading-tight">Total Deposit</span>
                  <span className="font-bold text-foreground font-mono text-base">{usd(plan.depositUsd)}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {plan.pair?.zap && (
                    <Badge variant="secondary" className="text-[9.5px] gap-1 px-2 py-0.5 font-medium bg-primary/10 text-primary border-primary/20">
                      <Zap className="size-2.5" />
                      Auto-Balanced
                    </Badge>
                  )}
                  {plan.approvals.length > 0 && (
                    <Badge variant="outline" className="text-[9.5px] px-1.5 py-0.5 font-mono text-muted-foreground border-border/40">
                      {plan.approvals.length} Approval{plan.approvals.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Into range allocation */}
              {plan.pair && (
                <div className="rounded-lg bg-background/50 p-2.5 border border-border/30 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Mint Liquidity</span>
                    <span className="font-mono font-medium text-foreground text-right text-xs">
                      {plan.pair.useQuote > 0 && plan.pair.useToken > 0
                        ? `${num(plan.pair.useQuote)} ${isWethQuote && effectivePayNative ? 'ETH' : quote} + ${num(plan.pair.useToken)} ${symbol}`
                        : plan.pair.useQuote > 0
                          ? `${num(plan.pair.useQuote)} ${isWethQuote && effectivePayNative ? 'ETH' : quote}`
                          : `${num(plan.pair.useToken)} ${symbol}`}
                    </span>
                  </div>

                  {/* Swap route if zap is balancing */}
                  {plan.pair.zap && (
                    <div className="flex items-center justify-between text-[10.5px] pt-1.5 border-t border-border/20 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ArrowRight className="size-2.5 text-primary/70" />
                        <span>Swap Path</span>
                      </span>
                      <span className="font-mono text-foreground/90">
                        {plan.pair.zap.side === 'buy'
                          ? `${num(plan.pair.zap.amountIn)} ${quote} → ${num(plan.pair.zap.expectedOut)} ${symbol}`
                          : `${num(plan.pair.zap.amountIn)} ${symbol} → ${num(plan.pair.zap.expectedOut)} ${quote}`}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Gas & Fee strip */}
              <div className="flex items-center justify-between pt-1 text-[10.5px] text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>
                    Est. Gas: <strong className={cn('font-mono font-medium', plan.gasOverLimit ? 'text-destructive font-semibold' : 'text-foreground')}>{usd(plan.gasUsd)}</strong>
                  </span>
                  {plan.feeUsd > 0 && (
                    <span>
                      · Fee: <strong className="text-foreground font-mono font-medium">{usd(plan.feeUsd)}</strong>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!plan.simulated && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-border/40 text-muted-foreground">
                      unsimulated
                    </Badge>
                  )}
                  {!plan.canFund && (
                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0 font-medium">
                      insufficient
                    </Badge>
                  )}
                  {plan.gasOverLimit && (
                    <Badge variant="destructive" className="text-[9px] gap-1 px-1.5 py-0 font-medium">
                      <Fuel className="size-2.5" />
                      over gas limit
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ) : quoting && (hasQuote || hasToken) ? (
            /* Live Route Pricing State */
            <div className="rounded-xl border border-border/30 bg-card/30 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                  <span className="relative flex size-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full size-2 bg-primary" />
                  </span>
                  <span>Pricing optimal route…</span>
                </div>
                {totalDepositEstimateUsd > 0 && (
                  <span className="font-mono text-xs font-semibold text-foreground/80">
                    ~{usd(totalDepositEstimateUsd)}
                  </span>
                )}
              </div>
              <div className="h-1.5 w-full bg-muted/30 rounded-full overflow-hidden">
                <div className="h-full bg-primary/40 rounded-full animate-pulse w-2/3" />
              </div>
            </div>
          ) : totalDepositEstimateUsd > 0 ? (
            /* Live Estimated Deposit Strip */
            <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-border/30 bg-card/20 text-xs">
              <span className="text-muted-foreground text-[11px]">Estimated Deposit</span>
              <span className="font-mono font-semibold text-foreground text-xs">{usd(totalDepositEstimateUsd)}</span>
            </div>
          ) : null}

          {/* Action Button */}
          <Button
            className="w-full font-semibold shadow-xs h-10 rounded-xl text-xs mt-1 bg-primary hover:bg-primary/90 text-primary-foreground active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:opacity-45 disabled:pointer-events-none hover:shadow-md hover:shadow-primary/10"
            disabled={!valid || action.busy || Boolean(plan?.gasOverLimit) || plan?.canFund === false}
            onClick={() => void handleExecute()}
          >
            {action.busy ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="size-3.5 animate-spin" />
                <span>Preparing deposit…</span>
              </span>
            ) : quoting && !plan ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="size-3.5 animate-spin" />
                <span>Pricing route…</span>
              </span>
            ) : !canFundWallet && (hasQuote || hasToken) ? (
              <span>Insufficient Wallet Balance</span>
            ) : plan ? (
              `Deposit · ${usd(plan.depositUsd)}`
            ) : totalDepositEstimateUsd > 0 ? (
              `Deposit · ${usd(totalDepositEstimateUsd)}`
            ) : (
              'Deposit'
            )}
          </Button>
        </div>
    </div>
  );

  const hasPoolContext = Boolean(activeResolved || cachedPool || bins);
  const isLoading = resolving || binsLoading || Boolean(inFlightSearchRef.current);

  if (!hasPoolContext) {
    if (isLoading) {
      return <TerminalSkeleton />;
    }
    if (loadError) {
      return (
        <>
          <PageHeader
            title={`${symbol || 'Unknown'} / ${quote || 'USDG'}`}
            description="Select a pool to deploy concentrated liquidity."
          />
          <div className="flex-1 flex flex-col items-center justify-center text-center select-none py-16 space-y-3">
            <p className="text-sm text-muted-foreground">
              Failed to load pool data ({loadError})
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  lastCompletedSearchRef.current = null;
                  inFlightSearchRef.current = null;
                  setLoadError(null);
                  setResolving(true);
                  void load(undefined, true);
                }}
                className="h-7 text-xs cursor-pointer"
              >
                Retry
              </Button>
              <Button asChild size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                <Link href="/discover">Browse pools</Link>
              </Button>
            </div>
          </div>
        </>
      );
    }
    return <TerminalSkeleton />;
  }

  return (
    <>
      {loadError && !bins && !isLoading && (
        <div className="flex items-center justify-between gap-3 py-2 px-4 mb-2 text-xs border border-border/40 rounded-lg bg-card/40 select-none">
          <span className="text-muted-foreground">Failed to load pool data ({loadError})</span>
          <Button asChild variant="outline" size="sm" className="h-7 text-xs cursor-pointer">
            <Link href="/discover">Browse pools</Link>
          </Button>
        </div>
      )}

      {/* Desktop Resizable 3-Pane Workstation (Full 1-Screen Viewport) */}
      <div className="hidden xl:flex flex-col flex-1 min-h-0 h-full w-full rounded-2xl border border-border/40 bg-card/20 overflow-hidden shadow-2xs">
        {/* Sleek Compact Header & Breadcrumbs Toolbar */}
        {renderCompactHeader()}

        <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0 w-full">
          {/* Panel 1 (Left): Market & Token Intelligence Deck */}
          <ResizablePanel defaultSize="22%" minSize="16%" maxSize="30%" className="min-w-60 h-full min-h-0 overflow-hidden">
            {renderIntelDeck()}
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Panel 2 (Center): Price Action & Active Positions */}
          <ResizablePanel defaultSize="54%" minSize="40%" maxSize="70%" className="min-w-105 h-full min-h-0 overflow-hidden">
            {renderCenterPanel()}
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Panel 3 (Right): Liquidity Deployment Terminal */}
          <ResizablePanel defaultSize="24%" minSize="18%" maxSize="35%" className="min-w-70 h-full min-h-0 overflow-hidden">
            {renderDeployTerminal()}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile / Tablet Responsive Fallback (< xl) */}
      <div className="xl:hidden flex-1 min-h-0 overflow-y-auto app-scrollbar space-y-3 pb-8 w-full">
        <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/20 h-180 flex flex-col">
          {renderCompactHeader()}
          <div className="flex-1 min-h-0 w-full">
            {renderCenterPanel()}
          </div>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/20 p-3">
          {renderDeployTerminal()}
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/20">
          {renderIntelDeck()}
        </div>
      </div>
    </>
  );
};

function OpenPageContent() {
  const params = useSearchParams();
  const routeParams = useParams();
  const pathname = usePathname();

  const queryToken = params.get('token') || params.get('ca') || params.get('address');
  const rawRoutePool = ((routeParams?.pool as string | undefined) || '').replace(/\.(txt|html|rsc|json)$/i, '');
  const routePool = rawRoutePool && rawRoutePool !== 'default' ? rawRoutePool : undefined;
  const rawPathPool = pathname
    ? (pathname.match(/^\/pool(?:\/[^/]+)?\/([^/]+)/)?.[1] ||
       pathname.match(/^\/pools\/([^/]+)/)?.[1])
    : (typeof window !== 'undefined'
      ? (window.location.pathname.match(/^\/pool(?:\/[^/]+)?\/([^/]+)/)?.[1] ||
         window.location.pathname.match(/^\/pools\/([^/]+)/)?.[1])
      : undefined);
  const pathPool = rawPathPool ? rawPathPool.replace(/\.(txt|html|rsc|json)$/i, '') : undefined;
  const rawParamPool = (params.get('pool') || '').replace(/\.(txt|html|rsc|json)$/i, '');
  const pool = rawParamPool || routePool || pathPool;
  const routeToken = (routeParams?.address as string | undefined) ?? '';
  // Key per target pool or token to ensure complete state isolation and fresh lifecycle
  const poolKey = pool ? `pool:${pool.toLowerCase()}` : queryToken ? `token:${queryToken.toLowerCase()}` : routeToken ? `route:${routeToken.toLowerCase()}` : 'default';

  return <OpenPage key={poolKey} />;
}

export const WorkstationView = () => (
  <Suspense fallback={<TerminalSkeleton />}>
    <OpenPageContent />
  </Suspense>
);

export default WorkstationView;
