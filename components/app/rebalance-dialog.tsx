'use client';

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
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
import { formatSubscriptPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { WebPosition } from '@/lib/types';

interface RebalancePreset {
  id: string;
  name: string;
  badge: string;
  low: number;
  high: number;
}

const DEFAULT_PRESET: RebalancePreset = {
  id: 'standard',
  name: 'Balanced',
  badge: '±15%',
  low: -15,
  high: 15,
};

const PRESETS: RebalancePreset[] = [
  {
    id: 'tight',
    name: 'Narrow',
    badge: '±5%',
    low: -5,
    high: 5,
  },
  DEFAULT_PRESET,
  {
    id: 'wide',
    name: 'Wide',
    badge: '±30%',
    low: -30,
    high: 30,
  },
];

export interface RepositionDialogProps {
  pos: WebPosition;
  className?: string;
  trigger?: React.ReactNode;
}

export type RebalanceDialogProps = RepositionDialogProps;

export const RepositionDialog = ({ pos, className, trigger }: RepositionDialogProps) => {
  const [open, setOpen] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState('standard');
  const action = useAction();
  const running = action.steps.length > 0 || action.awaiting !== null;

  const selectedPreset: RebalancePreset = useMemo(
    () => PRESETS.find((p) => p.id === selectedPresetId) ?? DEFAULT_PRESET,
    [selectedPresetId],
  );

  const spotPrice = pos.price || 1;
  const projectedLow = spotPrice * (1 + selectedPreset.low / 100);
  const projectedHigh = spotPrice * (1 + selectedPreset.high / 100);

  const handleQuickReposition = async () => {
    setOpen(false);
    await action.run('/api/reposition', {
      key: pos.key,
      lowerPct: selectedPreset.low,
      upperPct: selectedPreset.high,
      zap: true,
    });
  };

  return (
    <>
      <ActionDialog
        action={action}
        chainId={pos.chainId}
        title={`Reposition: ${pos.symbol} / ${pos.quoteSymbol}`}
        description="Repositioning liquidity around active spot price…"
        poolSymbol={pos.symbol}
        quoteSymbol={pos.quoteSymbol}
        rangeLabel={`${selectedPreset.badge} (${selectedPreset.name})`}
      />

      <Dialog open={open && !running} onOpenChange={(o) => (running ? null : setOpen(o))}>
        <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
          {trigger ?? (
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'group/reb text-white hover:text-white border-border/60 hover:border-primary/40 cursor-pointer shadow-2xs transition-all duration-150 active:scale-[0.98]',
                className,
              )}
              title="Reposition range"
            >
              <RefreshCw className="size-3.5 text-white" />
              <span className="text-white">Reposition</span>
            </Button>
          )}
        </DialogTrigger>

        <DialogContent
          className="sm:max-w-[390px] select-none p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader className="gap-1 pb-1">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 shadow-2xs">
                <RefreshCw className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-[15px] font-semibold tracking-tight text-foreground flex items-center gap-2">
                  <span>Reposition Range</span>
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
            {/* Quick Strategy Presets */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">New Target Range</span>
                <span className="font-mono text-[11px] font-semibold text-primary">
                  {selectedPreset.badge}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {PRESETS.map((p) => {
                  const active = selectedPresetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPresetId(p.id)}
                      className={cn(
                        'h-9 rounded-lg border text-center transition-all duration-150 cursor-pointer flex flex-col items-center justify-center active:scale-[0.98]',
                        active
                          ? 'border-primary/60 bg-primary/15 text-primary ring-1 ring-primary/30 shadow-2xs font-semibold'
                          : 'border-border/60 bg-card/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:border-border',
                      )}
                    >
                      <span className="font-mono text-xs font-bold leading-tight">{p.badge}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Range Comparison Card */}
            <div className="rounded-xl border border-border/50 bg-muted/15 p-3 space-y-2.5 text-xs">
              {/* Spot Price */}
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                  Market Spot Price
                </span>
                <span className="font-mono font-bold text-sm text-foreground tabular-nums">
                  ${formatSubscriptPrice(spotPrice)}
                </span>
              </div>

              {/* Rows */}
              <div className="space-y-2 pt-2 border-t border-border/20 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-sans text-[11px]">Current Range</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs tabular-nums">
                      ${formatSubscriptPrice(pos.priceLower)} – ${formatSubscriptPrice(pos.priceUpper)}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px] px-1 py-0 font-sans',
                        pos.inRange
                          ? 'border-up/30 bg-up/10 text-up'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-500',
                      )}
                    >
                      {pos.inRange ? 'In Range' : 'Out'}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-foreground font-semibold font-sans text-[11px] flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary shrink-0" />
                    New Range
                  </span>
                  <span className="font-bold text-foreground text-xs tabular-nums">
                    ${formatSubscriptPrice(projectedLow)} – ${formatSubscriptPrice(projectedHigh)}
                  </span>
                </div>
              </div>
            </div>

            {/* Single CTA */}
            <div className="pt-1">
              <Button
                onClick={() => void handleQuickReposition()}
                disabled={action.busy || running}
                className="w-full gap-1.5 h-9 text-xs font-semibold cursor-pointer shadow-2xs transition-all duration-150 active:scale-[0.98] hover:brightness-105"
              >
                <RefreshCw className={cn('size-3.5 text-white', (action.busy || running) && 'animate-spin')} />
                <span>
                  {action.busy ? 'Repositioning…' : `Reposition (${selectedPreset.badge})`}
                </span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const RebalanceDialog = RepositionDialog;
