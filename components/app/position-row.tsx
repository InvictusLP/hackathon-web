'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  MinusCircle,
} from 'lucide-react';
import { useAction } from '@/components/app/action';
import { ActionDialog } from '@/components/app/action-dialog';
import { AddLiquidity } from '@/components/app/add-liquidity';
import { RebalanceDialog } from '@/components/app/rebalance-dialog';
import { ExitDialog } from '@/components/app/exit-dialog';
import { CardDialog } from '@/components/app/card-dialog';
import { CellBadge, StandardPairIdentity } from '@/components/app/pool-cells';
import { BinChart } from '@/components/app/bin-chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { compactUsd, num, pct, signedPct, toneClass, usd } from '@/lib/format';
import { cn } from '@/lib/utils';
import { resolveChainSlug } from '@/lib/protocols';
import { get } from '@/lib/api';
import type { Bin, BinDetail, WebPosition } from '@/lib/types';

const clamp = (val: number, min = 0, max = 100): number => Math.min(Math.max(val, min), max);

export interface PositionRowProps {
  position: WebPosition;
  isNewlyCreated?: boolean;
  onSwitchPool?: (poolId: string, tokenAddress?: string) => void;
}

export const PositionRow = ({
  position: p,
  isNewlyCreated = false,
  onSwitchPool,
}: PositionRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasBeenExpanded, setHasBeenExpanded] = useState(false);
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

  // Lazy-fetch bins on first expand
  const [bins, setBins] = useState<Bin[]>([]);
  useEffect(() => {
    if (!hasBeenExpanded) return;
    let live = true;
    const load = async () => {
      try {
        const d = await get<BinDetail>(`/api/bins?key=${encodeURIComponent(p.key)}`);
        if (live && d?.map?.bins) setBins(d.map.bins);
      } catch { /* chart stays empty */ }
    };
    load();
    return () => { live = false; };
  }, [hasBeenExpanded, p.key]);

  const toggleExpand = () => {
    setHasBeenExpanded(true);
    setIsExpanded((prev) => !prev);
  };

  const close = async (sell: boolean, to?: 'eth' | 'usdg'): Promise<void> => {
    await action.run('/api/close', { key: p.key, sell, to });
  };

  const collect = async (sell = false): Promise<void> => {
    await action.run('/api/collect', { key: p.key, swap: sell });
  };

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
        'group transition-colors',
        isNewlyCreated && 'position-new-entry',
        isExpanded ? 'bg-muted/15' : 'hover:bg-muted/20',
      )}
    >
      {/* On-Chain Transaction Progress Dialog */}
      <ActionDialog
        action={action}
        chainId={p.chainId}
        title={`Position: ${p.symbol} / ${p.quoteSymbol}`}
        description="Managing liquidity position on-chain…"
      />

      {/* Main Row — sleek horizontal layout with interactive hover & tap feedback */}
      <div
        onClick={toggleExpand}
        className="group/row flex items-center justify-between gap-3 sm:gap-4 px-3 py-2 sm:px-4 sm:py-2.5 cursor-pointer select-none transition-colors duration-150 active:bg-muted/30"
      >
        {/* Column 1: Pool Avatar & Identity */}
        <div className="flex items-center min-w-0 flex-1 sm:flex-none sm:w-[260px] md:w-[280px]">
          <StandardPairIdentity
            chainId={p.chainId ?? 4663}
            baseSymbol={p.symbol}
            quoteSymbol={p.quoteSymbol}
            baseAddress={p.tokenAddress}
            protocol="uniswap"
            protocolVersion={p.version}
            poolId={p.poolId}
            subContent={
              <div className="flex items-center gap-1.5 hover:text-foreground/90 transition-colors">
                <span className="font-semibold text-foreground">{pct(p.feePct, 2)}</span>
                <span className="text-foreground/35">·</span>
                <span className="text-foreground/75">
                  {p.tickSpacing ?? (p.feePct <= 0.01 ? 1 : p.feePct <= 0.05 ? 10 : p.feePct <= 0.3 ? 60 : 200)}
                </span>
                <CellBadge>{p.version.toUpperCase()}</CellBadge>
                <span className="text-foreground/35">·</span>
                <span className="text-muted-foreground/80">#{p.tokenId}</span>
                {p.poolId && (
                  <>
                    <span className="text-foreground/35">·</span>
                    <Link
                      href={`/pool/${resolveChainSlug(p.chainId)}/${p.poolId}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSwitchPool?.(p.poolId);
                      }}
                      className="text-[11px] font-sans font-medium text-primary hover:text-primary/80 hover:underline cursor-pointer transition-colors p-0 bg-transparent border-0 leading-none"
                      title={`Switch to ${p.symbol} / ${p.quoteSymbol} pool`}
                    >
                      Switch
                    </Link>
                  </>
                )}
              </div>
            }
          />
        </div>

        {/* Column 2: Status & Range Bounds with Ambient Live Dot */}
        <div className="hidden sm:flex sm:flex-col sm:items-start sm:w-[130px] md:w-[150px] shrink-0">
          <Badge
            variant="outline"
            className={cn(
              'gap-1.5 text-[11px] font-medium px-2 py-0.5 shrink-0 transition-colors duration-200',
              p.inRange
                ? 'border-up/30 bg-up/10 text-up'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-500',
            )}
          >
            <span className="relative flex size-2 shrink-0 items-center justify-center">
              <span
                className={cn(
                  'size-1.5 rounded-full transition-all duration-300',
                  p.inRange
                    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]'
                    : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]',
                )}
              />
            </span>
            <span>{p.inRange ? 'In Range' : 'Out of Range'}</span>
          </Badge>
          <div className="text-[11px] font-mono text-muted-foreground truncate mt-1">
            {compactUsd(p.priceLower)} – {compactUsd(p.priceUpper)}
          </div>
        </div>

        {/* Column 3: Position Value & PnL with Live Tick Flash */}
        <div className="hidden md:flex md:flex-col md:items-end md:w-[140px] lg:w-[160px] shrink-0">
          <div className="flex items-baseline gap-1.5 font-mono">
            <span
              className={cn(
                'font-bold text-sm sm:text-[15px] tabular-nums transition-colors duration-300',
                valueFlash === 'up' && 'text-emerald-400',
                valueFlash === 'down' && 'text-rose-400',
                !valueFlash && 'text-foreground',
              )}
            >
              {usd(p.valueUsd)}
            </span>
            {hasBasis && (
              <span className={cn('text-[11px] font-medium tabular-nums', toneClass(p.pnlUsd))}>
                ({signedPct(p.pnlPct)})
              </span>
            )}
          </div>
          <div className="text-[11px] font-mono text-muted-foreground truncate">
            {num(p.amountToken)} {p.symbol} + {num(p.amountQuote)} {p.quoteSymbol}
          </div>
        </div>

        {/* Column 4: Fees Earned with Live Yield Heartbeat Glow */}
        <div className="flex flex-col items-end min-w-[100px] sm:w-[130px] lg:w-[150px] shrink-0">
          <div
            className={cn(
              'font-mono font-bold text-sm sm:text-[15px] tabular-nums transition-all duration-300',
              feeFlashed
                ? 'text-emerald-300 scale-105 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                : 'text-emerald-400 scale-100',
            )}
          >
            +{usd(p.feesUsd)}
          </div>
          <div className="text-[11px] font-mono text-muted-foreground truncate">
            {p.feeApr !== null && p.feeApr > 0 ? (
              <span className="text-emerald-500 font-medium">{pct(p.feeApr, 0)} APR</span>
            ) : hasFees ? (
              `+${num(p.feesToken)} ${p.symbol}`
            ) : (
              'No fees'
            )}
          </div>
        </div>

        {/* Column 5: Actions & Expand Chevron (both expanded and minimized) */}
        <div className="flex items-center gap-1.5 shrink-0 pl-1">
          {/* Claim Dropdown — icon only */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                disabled={!hasFees || running || action.busy}
                className={cn(
                  'size-7.5 shadow-2xs cursor-pointer text-white hover:text-white border-border/60 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all duration-150 active:scale-[0.98] data-[state=open]:bg-emerald-500/15 data-[state=open]:border-emerald-500/40',
                  !hasFees && 'opacity-40 cursor-not-allowed hover:bg-transparent hover:text-white active:scale-100',
                )}
                onClick={(e) => e.stopPropagation()}
                title={hasFees ? `Claim fees (${usd(p.feesUsd)})` : 'No fees to claim'}
              >
                <ArrowDownToLine className="size-3.5 text-white" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 p-1 space-y-0.5" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  void collect(false);
                }}
                className="flex flex-col items-start gap-0.5 cursor-pointer py-1.5 px-2 rounded-md transition-colors"
              >
                <span className="font-medium text-xs flex items-center gap-1.5 text-foreground">
                  <ArrowDownToLine className="size-3.5 text-emerald-400" />
                  To Wallet
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Keep pair tokens
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  void collect(true);
                }}
                className="flex flex-col items-start gap-0.5 cursor-pointer py-1.5 px-2 rounded-md transition-colors"
              >
                <span className="font-medium text-xs flex items-center gap-1.5 text-foreground">
                  <ArrowLeftRight className="size-3.5 text-primary" />
                  Swap to {p.quoteSymbol}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Auto-convert fee to {p.quoteSymbol}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Close Dropdown — icon only */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                disabled={running || action.busy}
                className="size-7.5 shadow-2xs cursor-pointer text-white hover:text-white border-rose-500/30 hover:bg-rose-500/10 hover:border-rose-500/50 transition-all duration-150 active:scale-[0.98] data-[state=open]:bg-rose-500/15 data-[state=open]:border-rose-500/60"
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
                  Keep tokens & fees
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

          {/* Chevron Expand Button */}
          <Button
            variant="ghost"
            size="icon"
            className="size-7.5 text-white/80 hover:text-white cursor-pointer rounded-md transition-all duration-150 hover:bg-muted/60 active:scale-95"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand();
            }}
            title={isExpanded ? 'Collapse' : 'Expand details'}
          >
            <ChevronDown className={cn('size-4 text-white transition-transform duration-200 ease-out', isExpanded && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {/* Smooth CSS Grid Accordion Drawer — charts, composition details, and advanced tools */}
      {hasBeenExpanded && (
        <div
          className={cn(
            'grid transition-all duration-250 ease-[cubic-bezier(0.2,0,0,1)]',
            isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none',
          )}
        >
          <div className="overflow-hidden">
            <div className="border-t border-border/30 bg-muted/10 px-3 py-2 sm:px-4 sm:py-2.5 space-y-2">
              {/* Mobile status & value row (when hidden from main row) */}
              <div className="flex sm:hidden items-center justify-between gap-2 pb-1.5 border-b border-border/20 text-xs font-mono">
                <Badge
                  variant="outline"
                  className={cn(
                    'gap-1 text-[10px] font-medium px-1.5 py-0',
                    p.inRange
                      ? 'border-up/30 bg-up/10 text-up'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-500',
                  )}
                >
                  <span className={cn('size-1.5 rounded-full', p.inRange ? 'bg-up animate-pulse' : 'bg-amber-500')} />
                  <span>{p.inRange ? 'In Range' : 'Out of Range'}</span>
                </Badge>
                <div className="text-right">
                  <span className="font-bold text-foreground">{usd(p.valueUsd)}</span>
                  {hasBasis && (
                    <span className={cn('ml-1 font-medium', toneClass(p.pnlUsd))}>
                      ({signedPct(p.pnlPct)})
                    </span>
                  )}
                </div>
              </div>

              {/* Concentrated Liquidity Range Bar Chart — compact height */}
              <div className="w-full h-28 sm:h-32 min-h-28 sm:min-h-32 rounded-lg bg-background/60 px-3 py-1.5 border border-border/30 flex flex-col justify-between shadow-2xs">
                <BinChart
                  bins={bins}
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

              {/* Proportional Token Composition Bars */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Position Composition */}
                <div className="space-y-1.5 p-2 sm:p-2.5 rounded-lg border border-border/30 bg-background/40 hover:border-border/60 transition-colors shadow-2xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-muted-foreground uppercase text-[9px] tracking-wider">
                      Position Composition
                    </span>
                    <span className="font-mono font-medium">{usd(p.valueUsd)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden flex border border-border/20">
                    <div
                      className="bg-primary h-full transition-all duration-500 ease-out hover:brightness-125"
                      style={{ width: `${posTokenPct}%` }}
                      title={`${p.symbol}: ${posTokenPct.toFixed(1)}%`}
                    />
                    <div
                      className="bg-emerald-500 h-full transition-all duration-500 ease-out hover:brightness-125"
                      style={{ width: `${posQuotePct}%` }}
                      title={`${p.quoteSymbol}: ${posQuotePct.toFixed(1)}%`}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-primary shrink-0" />
                      {num(p.amountToken)} {p.symbol}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                      {num(p.amountQuote)} {p.quoteSymbol}
                    </span>
                  </div>
                </div>

                {/* Fee Composition */}
                <div className="space-y-1.5 p-2 sm:p-2.5 rounded-lg border border-border/30 bg-background/40 hover:border-border/60 transition-colors shadow-2xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-muted-foreground uppercase text-[9px] tracking-wider">
                      Unclaimed Fees
                    </span>
                    <span className="font-mono font-medium text-emerald-400">+{usd(p.feesUsd)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden flex border border-border/20">
                    {hasFees ? (
                      <>
                        <div
                          className="bg-primary h-full transition-all duration-500 ease-out hover:brightness-125"
                          style={{ width: `${feeTokenPct}%` }}
                          title={`${p.symbol} fee: ${feeTokenPct.toFixed(1)}%`}
                        />
                        <div
                          className="bg-emerald-500 h-full transition-all duration-500 ease-out hover:brightness-125"
                          style={{ width: `${feeQuotePct}%` }}
                          title={`${p.quoteSymbol} fee: ${feeQuotePct.toFixed(1)}%`}
                        />
                      </>
                    ) : (
                      <div className="w-full h-full bg-muted/30" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-primary shrink-0" />
                      +{num(p.feesToken)} {p.symbol}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                      +{num(p.feesQuote)} {p.quoteSymbol}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Drawer Footer Actions */}
              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/20">
                {/* Left: LP Actions (only Add Liquidity, Rebalance, Exit) */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <AddLiquidity
                    pos={p}
                    className="h-7.5 px-2.5 text-xs font-medium gap-1.5 shadow-2xs cursor-pointer text-white hover:text-white active:scale-[0.98] transition-all duration-150 hover:border-foreground/30 hover:bg-muted"
                  />

                  <RebalanceDialog
                    pos={p}
                    className="h-7.5 px-2.5 text-xs font-medium gap-1.5 shadow-2xs cursor-pointer text-white hover:text-white active:scale-[0.98] transition-all duration-150 hover:border-foreground/30 hover:bg-muted"
                  />

                  <ExitDialog
                    pos={p}
                    className="h-7.5 px-2.5 text-xs font-medium gap-1.5 shadow-2xs cursor-pointer text-white hover:text-white border-rose-500/30 hover:bg-rose-500/10 hover:border-rose-500/50 active:scale-[0.98] transition-all duration-150"
                  />
                </div>

                {/* Right: Share PnL Card */}
                <div className="flex items-center gap-2 shrink-0">
                  <CardDialog
                    kind="position"
                    params={`key=${encodeURIComponent(p.key)}`}
                    title={`${p.symbol} / ${p.quoteSymbol}`}
                    label="Share"
                    isProfit={p.pnlUsd >= 0}
                    className="h-7.5 px-2.5 text-xs font-medium gap-1.5 shadow-2xs text-white hover:text-white hover:bg-muted cursor-pointer active:scale-[0.98] transition-all duration-150 hover:border-foreground/30"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
