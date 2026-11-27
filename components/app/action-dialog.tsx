'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Layers,
  Loader2,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBlockExplorer } from '@/lib/explorer';
import { usd } from '@/lib/format';
import type { JobStep } from '@/lib/types';
import type { useAction } from './action';
import { chainNameOf } from './chain-avatar';

export interface ActionDialogProps {
  action: ReturnType<typeof useAction>;
  title?: string;
  description?: string;
  poolSymbol?: string;
  quoteSymbol?: string;
  amount?: string;
  rangeLabel?: string;
  chainName?: string;
  /** The chain the action runs on; names the network when chainName is not given. */
  chainId?: number;
  onRetry?: () => void;
  onViewPosition?: () => void;
}

const StepItem = ({
  step,
  index,
  isLast,
}: {
  step: JobStep;
  index: number;
  isLast: boolean;
}) => {
  const { formatUrl } = useBlockExplorer();
  const isActive = isLast && !step.done && !step.error;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 text-xs py-2.5 px-3.5 transition-colors',
        isActive ? 'bg-primary/5' : 'bg-transparent',
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={cn(
            'size-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-mono border transition-all duration-300',
            step.error
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : step.done
                ? 'border-up/40 bg-up/10 text-up scale-105'
                : isActive
                  ? 'border-primary/40 bg-primary/10 text-primary ring-2 ring-primary/20 animate-pulse'
                  : 'border-border/60 bg-muted/40 text-muted-foreground',
          )}
        >
          {step.error ? (
            <AlertCircle className="size-3 shrink-0" />
          ) : step.done ? (
            <Check className="size-3 shrink-0" />
          ) : isActive ? (
            <Loader2 className="size-3 shrink-0 animate-spin" />
          ) : (
            <span>{index}</span>
          )}
        </div>
        <span
          className={cn(
            'truncate font-medium text-xs transition-colors duration-200',
            step.error
              ? 'text-destructive font-semibold'
              : step.done
                ? 'text-foreground/80'
                : isActive
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground',
          )}
        >
          {step.label}
        </span>
      </div>
      {step.hash && (
        <a
          href={formatUrl(`/tx/${step.hash}`)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors font-mono inline-flex items-center gap-1 shrink-0 text-[11px] bg-background/80 hover:bg-muted px-2 py-0.5 rounded-md border border-border/40 shadow-2xs"
          title="View on explorer"
          aria-label="View on explorer"
        >
          <span>{step.hash.slice(0, 6)}…{step.hash.slice(-4)}</span>
          <ExternalLink className="size-2.5" />
        </a>
      )}
    </div>
  );
};

export const ActionDialog = ({
  action,
  title = 'Deposit',
  description,
  poolSymbol,
  quoteSymbol,
  amount,
  rangeLabel,
  chainName,
  chainId,
  onRetry,
  onViewPosition,
}: ActionDialogProps) => {
  const router = useRouter();
  // No default chain: a bulk action can span several, and naming the wrong one is worse than none.
  const network = chainName || chainNameOf(chainId);
  const { busy, awaiting, steps, finished, reset, jobId } = action;
  const [minimized, setMinimized] = useState(false);
  const { formatUrl } = useBlockExplorer();

  const isFailed = Boolean(finished?.error);
  const isDone = Boolean(finished && !finished.error);
  const isConfirming = steps.length > 0 && !finished;
  const isPreparing = busy && !awaiting && steps.length === 0;

  // Track the most recent transaction hash if available
  const latestHash = useMemo(() => {
    for (let i = steps.length - 1; i >= 0; i--) {
      const h = steps[i]?.hash;
      if (h) return h;
    }
    return null;
  }, [steps]);

  // Deduplicate intermediate reporting steps
  const rows = useMemo(
    () => steps.filter((s, i) => steps[i + 1]?.label !== s.label),
    [steps]
  );

  const result = (finished?.result ?? {}) as { usd?: unknown; hash?: unknown; key?: unknown };
  const resultUsd = typeof result.usd === 'number' ? result.usd : null;
  const displayAmount = amount ?? (resultUsd !== null ? usd(resultUsd) : null);

  // When a transaction starts a new job, unminimize modal
  useEffect(() => {
    if (jobId) {
      setMinimized(false);
    }
  }, [jobId]);

  // Persistent background toast tracking when modal is minimized during on-chain confirmation
  useEffect(() => {
    if (!minimized || !jobId) return;

    if (isConfirming) {
      toast.loading('Deposit pending on-chain…', {
        id: `tx-${jobId}`,
        description: latestHash ? `Tx: ${latestHash.slice(0, 6)}…${latestHash.slice(-4)}` : 'Waiting for block confirmation…',
      });
    } else if (isDone) {
      toast.success('Deposit confirmed', {
        id: `tx-${jobId}`,
        description: displayAmount ? `Position opened (${displayAmount})` : 'Liquidity deployed on-chain successfully.',
      });
      setMinimized(false);
    } else if (isFailed) {
      toast.error('Deposit failed', {
        id: `tx-${jobId}`,
        description: finished?.error || 'Execution reverted on-chain.',
      });
      setMinimized(false);
    }
  }, [minimized, jobId, isConfirming, isDone, isFailed, latestHash, displayAmount, finished?.error]);

  // Auto close dialog after success announcement (3500ms) if not dismissed
  useEffect(() => {
    if (!isDone || isFailed) return;
    const timer = setTimeout(() => {
      reset();
    }, 3500);
    return () => clearTimeout(timer);
  }, [isDone, isFailed, reset]);

  const isOpen = (busy || awaiting !== null || steps.length > 0) && !minimized;

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (isConfirming) {
        // Safe minimization: user can browse while tx confirms in background
        setMinimized(true);
      } else if (!busy) {
        reset();
      }
    }
  };

  const handleViewPosition = () => {
    reset();
    if (onViewPosition) {
      onViewPosition();
    } else {
      router.push('/liquidity');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!busy && awaiting === null}
        className="w-[92vw] sm:max-w-md p-0 gap-0 overflow-hidden rounded-2xl border border-border/80 bg-popover/95 backdrop-blur-xl shadow-2xl select-none animate-in fade-in-50 zoom-in-95 duration-200"
      >
        <DialogHeader className="border-b border-border/40 bg-card/25 p-4 shrink-0 flex flex-row items-start gap-3 space-y-0 text-left">
          <div
            className={cn(
              'size-8.5 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300 shadow-2xs',
              awaiting
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 ring-4 ring-amber-500/10'
                : isFailed
                  ? 'bg-destructive/10 text-destructive border-destructive/30 ring-4 ring-destructive/10'
                  : isDone
                    ? 'bg-up/10 text-up border-up/30 ring-4 ring-up/10 scale-105'
                    : 'bg-primary/10 text-primary border-primary/30 ring-4 ring-primary/10',
            )}
          >
            {awaiting ? (
              <Wallet className="size-4" />
            ) : isFailed ? (
              <AlertCircle className="size-4" />
            ) : isDone ? (
              <Check className="size-4" />
            ) : (
              <Loader2 className="size-4 animate-spin" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-semibold tracking-tight text-foreground truncate">
              {awaiting
                ? 'Confirm in Wallet'
                : isFailed
                  ? `${title} Failed`
                  : isDone
                    ? `${title} Confirmed`
                    : isPreparing
                      ? `Preparing ${title}`
                      : `Confirming ${title}`}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground truncate mt-0.5">
              {awaiting
                ? 'Waiting for your signature authorization…'
                : isFailed
                  ? finished?.error || 'Simulation or transaction reverted.'
                  : isDone
                    ? displayAmount
                      ? `Position opened successfully (${displayAmount})`
                      : 'Liquidity deployed on-chain.'
                    : description || 'Executing automated transaction lifecycle on-chain…'}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Dialog Body */}
        <div className="p-4 space-y-3">
          {/* 1. Wallet Signature Waiting Card */}
          {awaiting && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-xs space-y-2.5 shadow-2xs animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="font-semibold flex items-center justify-between text-amber-500">
                <div className="flex items-center gap-2">
                  <span className="relative flex size-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full size-2 bg-amber-500" />
                  </span>
                  <span>Signature Required in Wallet</span>
                </div>
                <Wallet className="size-4 shrink-0 text-amber-500/80" />
              </div>
              <p className="text-muted-foreground text-[11.5px] leading-relaxed">
                Please check your connected wallet or Telegram client to approve this transaction.
              </p>
              {displayAmount && (
                <div className="flex items-center justify-between text-[11px] pt-2 border-t border-amber-500/20 text-muted-foreground">
                  <span>Deposit Value</span>
                  <span className="font-mono font-semibold text-foreground">{displayAmount}</span>
                </div>
              )}
              {awaiting !== 'awaiting_approval' && (
                <div className="text-[10.5px] font-mono text-muted-foreground/80 bg-background/60 p-1.5 rounded-md border border-border/30 mt-1 truncate">
                  {awaiting}
                </div>
              )}
            </div>
          )}

          {/* 2. Success Summary Card */}
          {isDone && (
            <div className="rounded-xl border border-up/30 bg-up/5 p-3.5 text-xs space-y-2.5 shadow-2xs animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between pb-2 border-b border-border/20">
                <span className="text-muted-foreground text-[11px]">Target Pool</span>
                <span className="font-bold text-foreground text-xs">
                  {poolSymbol && quoteSymbol ? `${poolSymbol} / ${quoteSymbol}` : 'Liquidity Pool'}
                </span>
              </div>
              {displayAmount && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Total Deposited</span>
                  <span className="font-mono font-bold text-foreground text-sm">{displayAmount}</span>
                </div>
              )}
              {rangeLabel && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Range Target</span>
                  <span className="font-mono font-medium px-2 py-0.5 rounded-md bg-muted/40 text-foreground/90 border border-border/30 text-[10.5px]">
                    {rangeLabel}
                  </span>
                </div>
              )}
              {network && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Network</span>
                  <span className="font-medium text-foreground">{network}</span>
                </div>
              )}
              {latestHash && (
                <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-border/20">
                  <span className="text-muted-foreground">Transaction Hash</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(latestHash);
                        toast.success('Transaction hash copied');
                      }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Copy transaction hash"
                      aria-label="Copy transaction hash"
                    >
                      <Copy className="size-3" />
                    </button>
                    <a
                      href={formatUrl(`/tx/${latestHash}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-mono inline-flex items-center gap-1 text-[11px]"
                    >
                      <span>{latestHash.slice(0, 6)}…{latestHash.slice(-4)}</span>
                      <ExternalLink className="size-2.5" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. Step-by-Step Progress Timeline */}
          {rows.length > 0 && !isDone && (
            <div className="border border-border/40 rounded-xl overflow-hidden divide-y divide-border/20 bg-muted/10 max-h-56 overflow-y-auto app-scrollbar">
              {rows.map((s, i) => (
                <StepItem
                  key={`${s.kind}-${i}`}
                  step={s}
                  index={i + 1}
                  isLast={i === rows.length - 1 && !isDone && !isFailed}
                />
              ))}
            </div>
          )}

          {/* 4. Preparing / Route Pricing state before steps arrive */}
          {isPreparing && (
            <div className="flex items-center justify-center gap-2.5 py-6 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>Simulating route and estimating gas…</span>
            </div>
          )}

          {/* 5. Failure stage card */}
          {isFailed && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-xs space-y-2 shadow-2xs">
              <div className="font-semibold flex items-center gap-1.5 text-destructive">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>Transaction Unsuccessful</span>
              </div>
              <p className="text-muted-foreground text-[11.5px] leading-relaxed">
                {finished?.error?.toLowerCase().includes('reject')
                  ? 'The transaction was declined in your wallet. No assets were moved.'
                  : finished?.error?.toLowerCase().includes('gas')
                    ? 'Network gas estimation exceeded allowable threshold. Try increasing slippage or gas ceiling.'
                    : finished?.error || 'Transaction simulation reverted. Please verify balances and try again.'}
              </p>
            </div>
          )}
        </div>

        {/* Dialog Actions / Dismiss / Minimize */}
        <div className="border-t border-border/30 bg-muted/15 px-4 py-3 flex items-center justify-between gap-2">
          {isConfirming ? (
            <>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate">
                <span className="size-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                <span>Confirming on blockchain…</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMinimized(true)}
                className="h-8 text-xs text-muted-foreground hover:text-foreground cursor-pointer rounded-lg"
              >
                Run in background
              </Button>
            </>
          ) : isDone ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={reset}
                className="h-8 text-xs font-medium px-3.5 cursor-pointer rounded-lg"
              >
                Done
              </Button>
              <Button
                size="sm"
                onClick={handleViewPosition}
                className="h-8 text-xs font-semibold px-3.5 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 rounded-lg shadow-2xs"
              >
                <Layers className="size-3.5" />
                <span>View Position</span>
              </Button>
            </>
          ) : isFailed ? (
            <div className="flex items-center justify-end w-full gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={reset}
                className="h-8 text-xs font-medium px-3.5 cursor-pointer rounded-lg"
              >
                Dismiss
              </Button>
              {onRetry && (
                <Button
                  size="sm"
                  onClick={() => {
                    reset();
                    onRetry();
                  }}
                  className="h-8 text-xs font-semibold px-3.5 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 rounded-lg shadow-2xs"
                >
                  <RefreshCw className="size-3" />
                  <span>Try Again</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-end w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={reset}
                className="h-8 text-xs font-medium px-3.5 cursor-pointer rounded-lg"
              >
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
