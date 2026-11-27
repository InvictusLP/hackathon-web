'use client';

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { GripVertical } from 'lucide-react';
import { formatSubscriptPrice, usd } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Bin } from '@/lib/types';

/**
 * Concentrated liquidity picker: the pool's depth behind, the deposit drawn in
 * front of it slice by slice, and the two range edges as handles you drag.
 *
 * The axis is log price, the scale ticks and therefore liquidity live on, so a
 * -50% edge and a +100% edge sit the same distance from spot. The preview is
 * computed here from the amounts and the range, which is what makes dragging
 * instant; the server only confirms it on Review.
 */

export interface PreviewAmounts {
  quote: number;
  token: number;
  /** A swap will fit the deposit to the range, so the whole value counts. */
  balance: boolean;
}

const COL_COUNT = 44;

/** What constant liquidity holds between two prices, in whole units, priced quote per token. */
export const amountsIn = (L: number, pl: number, pu: number, spot: number): { quote: number; token: number } => ({
  quote: pl < spot ? L * (Math.sqrt(Math.min(pu, spot)) - Math.sqrt(pl)) : 0,
  token: pu > spot ? L * (1 / Math.sqrt(Math.max(pl, spot)) - 1 / Math.sqrt(pu)) : 0,
});

/** The fraction of total portfolio value allocated to quote and token for a given price range. */
export const rangeSplitRatio = (
  low: number,
  high: number,
  spot: number,
): { quoteRatio: number; tokenRatio: number } => {
  if (!(high > low) || !(spot > 0)) return { quoteRatio: 0.5, tokenRatio: 0.5 };
  if (high <= spot) return { quoteRatio: 1, tokenRatio: 0 };
  if (low >= spot) return { quoteRatio: 0, tokenRatio: 1 };
  const u = amountsIn(1, low, high, spot);
  const valQuote = u.quote;
  const valToken = u.token * spot;
  const total = valQuote + valToken;
  if (total <= 0) return { quoteRatio: 0.5, tokenRatio: 0.5 };
  return {
    quoteRatio: valQuote / total,
    tokenRatio: valToken / total,
  };
};

/** Liquidity the deposit buys. Without balancing, the short side decides. */
export const liquidityFor = (low: number, high: number, spot: number, a: PreviewAmounts): number => {
  if (!(high > low) || !(spot > 0)) return 0;
  const unit = amountsIn(1, low, high, spot);
  if (a.balance) {
    const per = unit.quote + unit.token * spot;
    return per > 0 ? (a.quote + a.token * spot) / per : 0;
  }
  const byQuote = unit.quote > 0 ? a.quote / unit.quote : Infinity;
  const byToken = unit.token > 0 ? a.token / unit.token : Infinity;
  const L = Math.min(byQuote, byToken);
  return Number.isFinite(L) ? L : 0;
};

/** The amount the other side needs to match the one typed. */
export const pairedAmount = (
  low: number,
  high: number,
  spot: number,
  side: 'quote' | 'token',
  amount: number,
): number => {
  const u = amountsIn(1, low, high, spot);
  if (side === 'quote') return u.quote > 0 ? (amount / u.quote) * u.token : 0;
  return u.token > 0 ? (amount / u.token) * u.quote : 0;
};

/** Which assets a range takes at this price. */
export const sidesFor = (low: number, high: number, spot: number): 'quote' | 'token' | 'both' =>
  high <= spot ? 'quote' : low >= spot ? 'token' : 'both';

const Swatch = ({ className, children }: { className: string; children: string }) => (
  <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
    <i className={cn('size-2 rounded-[3px]', className)} />
    {children}
  </span>
);

export const RangePicker = ({
  bins,
  spot,
  low,
  high,
  amounts,
  quoteSymbol,
  tokenSymbol,
  onChange,
  height = 260,
}: {
  bins: Bin[];
  spot: number;
  low: number;
  high: number;
  amounts: PreviewAmounts;
  quoteSymbol: string;
  tokenSymbol: string;
  onChange: (low: number, high: number) => void;
  height?: number;
}) => {
  const box = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ edge: 'low' | 'high'; min: number; max: number; price: number } | null>(null);

  const valOf = (b: Bin): number =>
    b.usd > 0 ? b.usd : (b.amountQuote || 0) + (b.amountToken || 0) * (spot || 1);

  // Every bin, the range and spot, symmetrically framed in log-price around spot
  const fitted = useMemo(() => {
    const prices = [spot, low, high];
    if (bins.length) {
      prices.push(bins[0]!.priceLower, bins[bins.length - 1]!.priceUpper);
    }
    const valid = prices.filter((p) => p > 0);
    if (!valid.length) return { min: 1, max: 2 };
    const minP = Math.min(...valid);
    const maxP = Math.max(...valid);

    if (spot > 0) {
      const distRangeLow = Math.abs(Math.log(spot / Math.min(spot, low)));
      const distRangeHigh = Math.abs(Math.log(Math.max(spot, high) / spot));
      const distLow = Math.abs(Math.log(spot / minP));
      const distHigh = Math.abs(Math.log(maxP / spot));

      // Continuous adaptive domain framing: smooth expansion without discontinuous threshold jumps
      const targetDist = Math.max(
        distRangeLow * 1.35,
        distRangeHigh * 1.35,
        distLow * 1.05,
        distHigh * 1.05,
        0.22,
      );

      return {
        min: Math.max(1e-12, spot * Math.exp(-targetDist)),
        max: spot * Math.exp(targetDist),
      };
    }
    return { min: minP / 1.25, max: maxP * 1.25 };
  }, [bins, spot, low, high]);

  // Frozen for the length of a drag, or the axis would slide out from under the pointer.
  const win = drag ?? fitted;
  const span = Math.log(win.max / win.min);
  const x = (p: number): number => (p > 0 ? (Math.log(p / win.min) / span) * 100 : 0);

  // Full-width continuous pool liquidity profile spanning from win.min to win.max (0% to 100%)
  const fullWidthBars = useMemo(() => {
    if (!(win.max > win.min)) return [];
    const logSpan = Math.log(win.max / win.min);
    const step = logSpan / COL_COUNT;

    const hasRealBins = bins.length > 0;
    const realMin = hasRealBins ? bins[0]!.priceLower : (spot > 0 ? spot * 0.7 : win.min);
    const realMax = hasRealBins ? bins[bins.length - 1]!.priceUpper : (spot > 0 ? spot * 1.3 : win.max);
    const edgeValLo = hasRealBins ? valOf(bins[0]!) : 100;
    const edgeValHi = hasRealBins ? valOf(bins[bins.length - 1]!) : 100;

    return Array.from({ length: COL_COUNT }, (_, i) => {
      const pl = win.min * Math.exp(step * i);
      const pu = win.min * Math.exp(step * (i + 1));
      const mid = Math.sqrt(pl * pu);

      let v = 0;
      if (hasRealBins) {
        const overlaps = bins.filter((b) => b.priceUpper >= pl && b.priceLower <= pu);
        if (overlaps.length > 0) {
          v = Math.max(...overlaps.map(valOf));
        } else if (mid < realMin) {
          const d = Math.abs(Math.log(realMin / mid));
          v = edgeValLo * Math.exp(-3.2 * d);
        } else if (mid > realMax) {
          const d = Math.abs(Math.log(mid / realMax));
          v = edgeValHi * Math.exp(-3.2 * d);
        }
      } else if (spot > 0) {
        const d = Math.abs(Math.log(mid / spot));
        v = 1000 * Math.exp(-0.5 * (d * 3.2) ** 2) + 25;
      }

      return {
        pl,
        pu,
        value: v,
      };
    });
  }, [win.min, win.max, bins, spot]);

  const poolMax = Math.max(1e-12, ...fullWidthBars.map((b) => b.value));
  const hasDeposit = (amounts?.quote ?? 0) > 0 || (amounts?.token ?? 0) > 0;

  const currentLow = drag?.edge === 'low' ? drag.price : low;
  const currentHigh = drag?.edge === 'high' ? drag.price : high;

  const priceAt = (clientX: number): number => {
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width === 0) return spot;
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return win.min * Math.exp(f * span);
  };

  const set = (edge: 'low' | 'high', p: number): void => {
    if (edge === 'low') onChange(Math.min(p, high * 0.995), high);
    else onChange(low, Math.max(p, low * 1.005));
  };

  const grab = (edge: 'low' | 'high') => (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const initialPrice = edge === 'low' ? low : high;
    setDrag({ edge, min: fitted.min, max: fitted.max, price: initialPrice });
  };
  const move = (e: PointerEvent<HTMLDivElement>): void => {
    if (!drag) return;
    const rawPrice = priceAt(e.clientX);
    const clampedPrice =
      drag.edge === 'low'
        ? Math.min(rawPrice, high * 0.995)
        : Math.max(rawPrice, low * 1.005);
    setDrag((prev) => (prev ? { ...prev, price: clampedPrice } : null));
    set(drag.edge, rawPrice);
  };
  const release = (): void => setDrag(null);
  const nudge = (edge: 'low' | 'high') => (e: KeyboardEvent<HTMLDivElement>) => {
    const f = e.key === 'ArrowLeft' ? 0.99 : e.key === 'ArrowRight' ? 1.01 : 0;
    if (!f) return;
    e.preventDefault();
    set(edge, (edge === 'low' ? low : high) * f);
  };

  return (
    <div className="flex flex-col gap-1.5 select-none">
      <div
        ref={box}
        className="relative touch-none select-none rounded-lg border border-border/40 bg-card/40 backdrop-blur-md overflow-hidden shadow-2xs"
        style={{ height }}
      >
        {/* Full-width continuous pool liquidity bars with dynamic in-range coloring */}
        {fullWidthBars.map((b, i) => {
          const ratio = poolMax > 0 ? Math.pow(Math.max(0, b.value) / poolMax, 0.55) : 0;
          const bHeight = Math.max(8, ratio * 85);

          // Check if this bar overlaps with user's selected range [currentLow, currentHigh]
          const inRange = b.pu > currentLow && b.pl < currentHigh;
          const isBelowSpot = spot > 0 && b.pu <= spot;
          const isAboveSpot = spot > 0 && b.pl >= spot;
          const isStraddling = spot > 0 && b.pl < spot && b.pu > spot;

          let colorClass = 'bg-muted/40 border-t border-muted-foreground/20 hover:bg-muted/60';

          if (inRange) {
            if (isStraddling) {
              colorClass = hasDeposit
                ? 'bg-linear-to-r from-emerald-500 to-primary border-t border-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.4)] z-5'
                : 'bg-linear-to-r from-emerald-500/70 to-primary/70 border-t border-emerald-400/50 hover:bg-emerald-500/90';
            } else if (isBelowSpot) {
              colorClass = hasDeposit
                ? 'bg-emerald-500 border-t border-emerald-300 shadow-[0_0_6px_rgba(16,185,129,0.3)] z-4 hover:bg-emerald-400'
                : 'bg-emerald-500/70 hover:bg-emerald-500 dark:bg-emerald-500/80 border-t border-emerald-400/40';
            } else if (isAboveSpot) {
              colorClass = hasDeposit
                ? 'bg-primary border-t border-primary/80 shadow-[0_0_6px_rgba(255,255,255,0.2)] z-4 hover:bg-primary/90'
                : 'bg-primary/70 border-t border-primary/40 hover:bg-primary/90';
            } else {
              colorClass = hasDeposit
                ? 'bg-emerald-500 border-t border-emerald-300'
                : 'bg-emerald-500/70 hover:bg-emerald-500 dark:bg-emerald-500/80 border-t border-emerald-400/40';
            }
          }

          return (
            <div
              key={`p-${i}`}
              className={cn('absolute bottom-0 rounded-t-xs cursor-pointer', colorClass)}
              style={{
                left: `${(i / COL_COUNT) * 100}%`,
                width: `calc(${100 / COL_COUNT}% - 1px)`,
                height: `${bHeight}%`,
              }}
              title={`Price: $${formatSubscriptPrice(b.pl)} – $${formatSubscriptPrice(b.pu)}\nPool Liquidity: ${usd(b.value)}${inRange ? (isBelowSpot ? `\nAllocation: ${quoteSymbol}` : `\nAllocation: ${tokenSymbol}`) : ''}`}
            />
          );
        })}

        {/* Selected target range visual highlight backdrop */}
        <div
          className="bg-emerald-500/10 border-x border-emerald-500/30 absolute inset-y-0 pointer-events-none"
          style={{
            left: `${Math.max(0, x(currentLow))}%`,
            width: `${Math.max(0, Math.min(100, x(currentHigh)) - Math.max(0, x(currentLow)))}%`,
          }}
        />

        {/* Spot price indicator */}
        {spot > 0 && x(spot) >= 0 && x(spot) <= 100 && (
          <div
            className="bg-foreground/80 absolute inset-y-0 w-px z-5 pointer-events-none"
            style={{ left: `${x(spot)}%` }}
            aria-label="current price"
          />
        )}

        {/* Draggable boundary sliders */}
        {(['low', 'high'] as const).map((edge) => {
          const isLow = edge === 'low';
          const p = isLow ? currentLow : currentHigh;
          const leftPct = Math.min(100, Math.max(0, x(p)));
          const isDragging = drag?.edge === edge;

          return (
            <div
              key={edge}
              role="slider"
              tabIndex={0}
              aria-label={isLow ? 'Min Range price' : 'Max Range price'}
              aria-valuenow={p}
              className={cn(
                'group absolute inset-y-0 flex w-7 -translate-x-1/2 cursor-ew-resize justify-center outline-none select-none',
                isDragging ? 'z-25 scale-105' : isLow ? 'z-20' : 'z-15',
              )}
              style={{ left: `${leftPct}%` }}
              onPointerDown={grab(edge)}
              onPointerMove={move}
              onPointerUp={release}
              onPointerCancel={release}
              onLostPointerCapture={release}
              onKeyDown={nudge(edge)}
            >
              {/* Vertical guideline */}
              <div
                className="h-full w-0.5 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)] transition-colors"
              />

              {/* Center Grip Button */}
              <div
                className={cn(
                  'absolute top-1/2 -translate-y-1/2 rounded px-0.5 py-1.5 shadow-sm transition-all duration-150 group-hover:scale-110 group-focus-visible:ring-2 bg-emerald-600 text-white ring-1 ring-emerald-400/50 group-focus-visible:ring-emerald-400 hover:bg-emerald-500',
                  isDragging && 'scale-110 brightness-110',
                )}
              >
                <GripVertical className="size-3" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-muted-foreground tabular font-mono flex justify-between text-[10px]">
        <span>${formatSubscriptPrice(win.min)}</span>
        <span>${formatSubscriptPrice(win.max)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <Swatch className="bg-emerald-500">{quoteSymbol}</Swatch>
        <Swatch className="bg-primary">{tokenSymbol}</Swatch>
      </div>
    </div>
  );
};
