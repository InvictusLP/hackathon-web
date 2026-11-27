'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatSubscriptPrice, num, usd } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Bin } from '@/lib/types';
import { POSITION_COLORS } from '@/components/app/candle-chart';

interface Hover {
  bin: Bin;
  isMine: boolean;
  color?: string;
  label?: string;
  x: number;
  y: number;
}

export interface PlacedRange {
  priceLower: number;
  priceUpper: number;
  color?: string;
  label?: string;
}

const Swatch = ({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) => (
  <span className="text-muted-foreground inline-flex items-center gap-1 text-[10px] shrink-0">
    <i className={cn('size-1.5 rounded-xs', className)} style={style} />
    {children}
  </span>
);

export const BinChart = ({
  bins,
  spotPrice,
  quoteSymbol,
  tokenSymbol,
  height,
  className,
  userPositions,
  compact = false,
  showLegend,
}: {
  bins: Bin[];
  spotPrice: number;
  quoteSymbol: string;
  tokenSymbol: string;
  height?: number | string;
  className?: string;
  userPositions?: PlacedRange[] | null;
  compact?: boolean;
  showLegend?: boolean;
}) => {
  const [hover, setHover] = useState<Hover | null>(null);
  const prefix = '$';

  const effectiveBins = useMemo(() => {
    return bins && bins.length > 0 ? bins : [];
  }, [bins]);

  if (!effectiveBins.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center select-none">
        <p className="text-sm text-muted-foreground">No active liquidity within range</p>
      </div>
    );
  }

  const valOf = (b: Bin): number =>
    b.usd > 0 ? b.usd : (b.amountQuote || 0) + (b.amountToken || 0) * (spotPrice || 1);

  const maxVal = Math.max(...effectiveBins.map(valOf), 1e-9);
  const active = effectiveBins.findIndex((b) => spotPrice >= b.priceLower && spotPrice < b.priceUpper);
  const width = 100 / Math.max(1, effectiveBins.length);

  const getBinPlacement = (b: Bin): { isMine: boolean; color?: string; label?: string } => {
    if (userPositions !== undefined) {
      if (!userPositions || userPositions.length === 0) return { isMine: false };
      const binMin = Math.min(b.priceLower, b.priceUpper);
      const binMax = Math.max(b.priceLower, b.priceUpper);
      for (let idx = 0; idx < userPositions.length; idx++) {
        const pos = userPositions[idx];
        if (!pos) continue;
        const pMin = Math.min(pos.priceLower, pos.priceUpper);
        const pMax = Math.max(pos.priceLower, pos.priceUpper);
        if (binMin < pMax && binMax > pMin) {
          const color = pos.color || POSITION_COLORS[idx % POSITION_COLORS.length];
          const label = pos.label || (userPositions.length > 1 ? `Pos #${idx + 1}` : 'Your position');
          return { isMine: true, color, label };
        }
      }
      return { isMine: false };
    }
    return { isMine: b.mine, color: '#10b981', label: 'Your position' };
  };

  const activePlacement = active >= 0 && effectiveBins[active] ? getBinPlacement(effectiveBins[active]!) : { isMine: false };

  return (
    <div className={cn('flex flex-col select-none w-full max-w-full h-full justify-between overflow-hidden gap-1', className)}>
      <div
        className="relative flex-1 min-h-6 w-full max-w-full overflow-hidden"
        style={height !== undefined ? { height: typeof height === 'number' ? `${height}px` : height, flex: 'none' } : undefined}
      >
        {effectiveBins.map((b, i) => {
          const v = valOf(b);
          // Power curve scale ensures low-liquidity bins remain visible alongside giant spikes
          const ratio = maxVal > 0 ? Math.pow(Math.max(0, v) / maxVal, 0.55) : 0;
          const barHeightPct = v > 0 ? Math.max(8, ratio * 85) : 4;
          const placement = getBinPlacement(b);
          const isMine = placement.isMine;
          const barColor = placement.color || '#10b981';

          return (
            <div
              key={`${b.priceLower}-${i}`}
              className={cn(
                'absolute bottom-0 rounded-t-xs transition-all duration-150 cursor-pointer',
                i === active
                  ? isMine
                    ? 'z-20 ring-1 ring-emerald-400/80'
                    : 'z-20 ring-1 ring-primary/80'
                  : isMine
                    ? 'hover:opacity-90 z-10'
                    : 'bg-primary/25 hover:bg-primary/50 border-t border-primary/35',
              )}
              style={{
                left: `${i * width}%`,
                width: `calc(${width}% - 1px)`,
                minWidth: '2px',
                height: `${barHeightPct}%`,
                backgroundColor:
                  i === active
                    ? isMine
                      ? barColor
                      : 'var(--primary)'
                    : isMine
                      ? `${barColor}cc`
                      : undefined,
                borderTop:
                  i === active
                    ? `2px solid ${isMine ? barColor : 'var(--primary)'}`
                    : isMine
                      ? `2px solid ${barColor}`
                      : undefined,
                boxShadow:
                  i === active
                    ? isMine
                      ? `0 0 14px ${barColor}, 0 0 4px rgba(52,211,153,0.9)`
                      : '0 0 10px var(--primary)'
                    : undefined,
              }}
              onMouseEnter={(e) =>
                setHover({ bin: b, isMine, color: barColor, label: placement.label, x: e.clientX, y: e.clientY })
              }
              onMouseMove={(e) =>
                setHover({ bin: b, isMine, color: barColor, label: placement.label, x: e.clientX, y: e.clientY })
              }
              onMouseLeave={() => setHover(null)}
            />
          );
        })}

        {active >= 0 && (
          <>
            <div
              className={cn(
                'absolute inset-y-0 w-0.5 -translate-x-px z-30 transition-all',
                activePlacement.isMine
                  ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
                  : 'bg-primary shadow-[0_0_8px_var(--primary)]'
              )}
              style={{
                left: `${(active + 0.5) * width}%`,
                backgroundColor: activePlacement.isMine ? (activePlacement.color || '#10b981') : undefined,
                boxShadow: activePlacement.isMine ? `0 0 10px ${activePlacement.color || '#10b981'}` : undefined,
              }}
              aria-label="current price"
            />
            <div
              className={cn(
                'bg-popover/90 backdrop-blur-md text-popover-foreground pointer-events-none absolute top-0.5 z-30 -translate-x-1/2 rounded border px-1.5 py-0.5 text-center whitespace-nowrap shadow-2xs transition-colors',
                activePlacement.isMine
                  ? 'border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                  : 'border-primary/40 shadow-[0_0_10px_var(--primary)/20]'
              )}
              style={{ left: `${Math.min(78, Math.max(22, (active + 0.5) * width))}%` }}
            >
              <div className="tabular text-[10px] font-mono font-bold text-foreground flex items-center gap-1 leading-none">
                <span
                  className={cn(
                    'size-1 rounded-full animate-pulse',
                    activePlacement.isMine ? 'bg-emerald-400' : 'bg-primary'
                  )}
                  style={{
                    backgroundColor: activePlacement.isMine ? (activePlacement.color || '#10b981') : undefined,
                  }}
                />
                <span>{prefix}{formatSubscriptPrice(spotPrice)}</span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="text-muted-foreground tabular font-mono flex items-center justify-between text-[9px] shrink-0 leading-tight pt-0.5 w-full max-w-full overflow-hidden">
        <span className="truncate max-w-[48%]">{prefix}{formatSubscriptPrice(effectiveBins[0]!.priceLower)}</span>
        <span className="truncate max-w-[48%] text-right">{prefix}{formatSubscriptPrice(effectiveBins[effectiveBins.length - 1]!.priceUpper)}</span>
      </div>

      {(showLegend ?? !compact) && (
        <div className="flex items-center gap-x-2.5 gap-y-0.5 text-[10px] shrink-0 flex-wrap overflow-hidden leading-tight pt-0.5 w-full max-w-full">
          {userPositions && userPositions.length > 0 ? (
            userPositions.length === 1 ? (
              <Swatch
                style={{ backgroundColor: userPositions[0]?.color || '#10b981' }}
              >
                Your position
              </Swatch>
            ) : (
              userPositions.slice(0, 4).map((pos, idx) => (
                <Swatch
                  key={idx}
                  style={{ backgroundColor: pos.color || POSITION_COLORS[idx % POSITION_COLORS.length] }}
                >
                  {pos.label || `Pos #${idx + 1}`}
                </Swatch>
              ))
            )
          ) : effectiveBins.some((b) => b.mine) ? (
            <Swatch className="bg-emerald-500">Your position</Swatch>
          ) : null}
          <Swatch className="bg-white ring-1 ring-white/60">Spot price</Swatch>
          <Swatch className="bg-primary/35">Pool liquidity</Swatch>
        </div>
      )}

      {hover && typeof document !== 'undefined' && createPortal(
        <div
          className="bg-popover text-popover-foreground pointer-events-none fixed z-50 rounded-xl border border-border/60 p-2.5 text-xs shadow-xl backdrop-blur-md space-y-1 min-w-44"
          style={{
            left: Math.min(window.innerWidth - 220, Math.max(12, hover.x + 12)),
            top: Math.max(8, hover.y - 110),
          }}
        >
          <div className="tabular font-mono font-bold text-foreground text-[11px]">
            {prefix}{formatSubscriptPrice(hover.bin.priceLower)} – {prefix}{formatSubscriptPrice(hover.bin.priceUpper)}
          </div>
          <div className="tabular font-mono text-emerald-500 font-semibold text-xs">
            {usd(valOf(hover.bin))}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {num(hover.bin.amountQuote)} {quoteSymbol}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {num(hover.bin.amountToken)} {tokenSymbol}
          </div>
          {hover.isMine && (
            <div
              className="font-semibold text-[10px] pt-0.5 flex items-center gap-1"
              style={{ color: hover.color || '#10b981' }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: hover.color || '#10b981' }}
              />
              <span>In Active Range ({hover.label || 'Your Position'})</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};
