'use client';

import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useAction } from '@/components/app/action';
import { ActionDialog } from '@/components/app/action-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { num, usd } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { WebPosition } from '@/lib/types';

export interface ExitDialogProps {
  pos: WebPosition;
  className?: string;
  trigger?: React.ReactNode;
}

export const ExitDialog = ({ pos, className, trigger }: ExitDialogProps) => {
  const [open, setOpen] = useState(false);
  const pct = 100;
  const [receiveMode, setReceiveMode] = useState<'pair' | 'usdg' | 'eth'>('pair');
  const action = useAction();
  const running = action.steps.length > 0 || action.awaiting !== null;

  const ratio = pct / 100;
  const exitTokenAmount = (pos.amountToken || 0) * ratio;
  const exitQuoteAmount = (pos.amountQuote || 0) * ratio;
  const tokenPriceUsd = pos.priceUsd || 0;
  const quotePriceUsd = pos.quoteUsd || 1;
  const exitTokenUsd = exitTokenAmount * tokenPriceUsd;
  const exitQuoteUsd = exitQuoteAmount * quotePriceUsd;
  const exitValueUsd = (pos.valueUsd || (exitTokenUsd + exitQuoteUsd)) * ratio;
  const feesUsd = pos.feesUsd || 0;
  const totalEstimatedUsd = exitValueUsd + feesUsd;

  const handleExit = async () => {
    setOpen(false);
    const sell = receiveMode !== 'pair';
    const to = receiveMode === 'pair' ? undefined : receiveMode;
    await action.run('/api/close', {
      key: pos.key,
      sell,
      to,
      pct,
    });
  };

  return (
    <>
      <ActionDialog
        action={action}
        chainId={pos.chainId}
        title={`Exit: ${pos.symbol} / ${pos.quoteSymbol}`}
        description={`Exiting ${pct}% liquidity from position #${pos.tokenId}…`}
        poolSymbol={pos.symbol}
        quoteSymbol={pos.quoteSymbol}
      />

      <Dialog open={open && !running} onOpenChange={(o) => (running ? null : setOpen(o))}>
        <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
          {trigger ?? (
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'group/exit text-white hover:text-white border-rose-500/30 hover:bg-rose-500/10 hover:border-rose-500/50 cursor-pointer shadow-2xs transition-all duration-150 active:scale-[0.98]',
                className,
              )}
              title="Exit position"
            >
              <ArrowUpRight className="size-3.5 text-white" />
              <span className="text-white">Exit</span>
            </Button>
          )}
        </DialogTrigger>

        <DialogContent
          className="sm:max-w-[390px] select-none p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader className="gap-1 pb-1">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 shadow-2xs">
                <ArrowUpRight className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-[15px] font-semibold tracking-tight text-foreground flex items-center gap-2">
                  <span>Exit Position</span>
                  <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 border-border/50 text-muted-foreground">
                    #{pos.tokenId}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground font-mono truncate">
                  {pos.symbol} / {pos.quoteSymbol}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3.5 pt-1">
            {/* Percentage Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">Withdraw Amount</span>
                <span className="font-mono text-[11px] font-semibold text-rose-400">
                  100% (Full Close)
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <div className="h-8 rounded-lg border border-rose-500/60 bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30 shadow-2xs font-mono font-semibold text-xs flex items-center justify-center">
                  100% (Full Position Liquidation)
                </div>
              </div>
            </div>

            {/* Representative Return Card */}
            <div className="rounded-xl border border-border/50 bg-muted/15 p-3 space-y-2 text-xs">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                  Estimated Return
                </span>
                <span className="font-mono font-bold text-sm sm:text-base text-foreground tabular-nums">
                  ~{usd(totalEstimatedUsd)}
                </span>
              </div>

              {/* Token Breakdown */}
              <div className="space-y-1.5 pt-1.5 border-t border-border/20 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary shrink-0" />
                    {pos.symbol}
                  </span>
                  <span className="text-foreground font-medium">
                    {num(exitTokenAmount)} <span className="text-[10px] text-muted-foreground">({usd(exitTokenUsd)})</span>
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                    {pos.quoteSymbol}
                  </span>
                  <span className="text-foreground font-medium">
                    {num(exitQuoteAmount)} <span className="text-[10px] text-muted-foreground">({usd(exitQuoteUsd)})</span>
                  </span>
                </div>

                {feesUsd > 0.001 && (
                  <div className="flex items-center justify-between pt-1 border-t border-border/10 text-emerald-400">
                    <span className="text-[11px]">Accrued Fees</span>
                    <span className="font-semibold text-xs">+{usd(feesUsd)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Receiving Mode Selector */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">Receive As</span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setReceiveMode('pair')}
                  className={cn(
                    'py-1.5 px-2 rounded-lg border text-xs font-medium transition-all duration-150 cursor-pointer text-center active:scale-[0.98]',
                    receiveMode === 'pair'
                      ? 'border-primary/50 bg-primary/10 text-foreground ring-1 ring-primary/20 shadow-2xs font-semibold'
                      : 'border-border/60 bg-card/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:border-border',
                  )}
                >
                  Both Tokens
                </button>
                <button
                  type="button"
                  onClick={() => setReceiveMode('usdg')}
                  className={cn(
                    'py-1.5 px-2 rounded-lg border text-xs font-medium transition-all duration-150 cursor-pointer text-center active:scale-[0.98]',
                    receiveMode === 'usdg'
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 shadow-2xs font-semibold'
                      : 'border-border/60 bg-card/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:border-border',
                  )}
                >
                  100% USDG
                </button>
                <button
                  type="button"
                  onClick={() => setReceiveMode('eth')}
                  className={cn(
                    'py-1.5 px-2 rounded-lg border text-xs font-medium transition-all duration-150 cursor-pointer text-center active:scale-[0.98]',
                    receiveMode === 'eth'
                      ? 'border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/20 shadow-2xs font-semibold'
                      : 'border-border/60 bg-card/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:border-border',
                  )}
                >
                  100% ETH
                </button>
              </div>
            </div>

            {/* Action CTA */}
            <Button
              onClick={() => void handleExit()}
              disabled={running || action.busy}
              className="w-full h-9 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs tracking-tight shadow-2xs cursor-pointer transition-all duration-150 active:scale-[0.98] gap-1.5 mt-1 hover:brightness-105"
            >
              <ArrowUpRight className={cn('size-3.5 text-white transition-transform duration-150', (action.busy || running) && 'animate-spin')} />
              <span>
                {action.busy ? 'Exiting…' : pct === 100 ? 'Exit Position' : `Exit ${pct}% Liquidity`}
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
