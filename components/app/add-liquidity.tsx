'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ActionProgress, useAction } from '@/components/app/action';
import { pairedAmount, sidesFor } from '@/components/app/range-picker';
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
import { Switch } from '@/components/ui/switch';
import { post } from '@/lib/api';
import { num, usd } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { OpenPlan, WebPosition } from '@/lib/types';

interface Balances {
  eth: number;
  weth: number;
  usdg: number;
  token: number;
}

const Figure = ({ label, value, className }: { label: string; value: string; className?: string }) => (
  <div className="flex items-baseline justify-between gap-3 text-xs">
    <span className="text-muted-foreground">{label}</span>
    <span className={cn('tabular-nums font-mono text-right font-medium text-foreground', className)}>{value}</span>
  </div>
);

const Amount = ({
  symbol,
  value,
  max,
  dim,
  onChange,
}: {
  symbol: string;
  value: string;
  max: number | null;
  dim: boolean;
  onChange: (v: string) => void;
}) => (
  <div
    className={cn(
      'rounded-xl border border-border/50 bg-background/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 p-2.5 transition-all space-y-1.5',
      dim && 'opacity-60',
    )}
  >
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-xs text-foreground bg-muted/40 border border-border/40 px-2 py-0.5 rounded-md">
          {symbol}
        </span>
      </div>
      <input
        value={value}
        inputMode="decimal"
        placeholder="0.0"
        aria-label={`${symbol} amount`}
        className="font-mono tabular-nums min-w-0 flex-1 bg-transparent text-right text-sm font-semibold outline-none text-foreground placeholder:text-muted-foreground/50"
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
      />
    </div>

    {max !== null && (
      <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-0.5 border-t border-border/20">
        <span>Balance: {num(max)}</span>
        <div className="flex items-center gap-1">
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <button
              key={pct}
              type="button"
              className="px-1.5 py-0.5 rounded bg-muted/40 hover:bg-muted text-[10px] text-muted-foreground hover:text-foreground cursor-pointer transition-all duration-150 active:scale-[0.98]"
              onClick={() => {
                const effectiveMax = symbol === 'ETH' ? Math.max(0, max - 0.0005) : max;
                const calc = effectiveMax * pct;
                onChange(String(Number(calc.toFixed(8))));
              }}
            >
              {pct === 1 ? 'MAX' : `${pct * 100}%`}
            </button>
          ))}
        </div>
      </div>
    )}
  </div>
);

/**
 * More liquidity into a range already held.
 */
export const AddLiquidity = ({
  pos,
  className,
  trigger,
  label = 'Add liquidity',
}: {
  pos: WebPosition;
  className?: string;
  trigger?: React.ReactNode;
  label?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState('');
  const [token, setToken] = useState('');
  const [balance, setBalance] = useState(true);
  const [payNative, setPayNative] = useState(false);
  const [bal, setBal] = useState<Balances | null>(null);
  const [plan, setPlan] = useState<OpenPlan | null>(null);
  const [quoting, setQuoting] = useState(false);
  const action = useAction();
  const running = action.steps.length > 0 || action.awaiting !== null;

  const sides = sidesFor(pos.priceLower, pos.priceUpper, pos.price);
  const quoteSym = payNative ? 'ETH' : pos.quoteSymbol;

  useEffect(() => {
    if (!open) return;
    let live = true;
    void post<Balances>('/api/balances', { token: pos.tokenAddress })
      .then((b) => live && setBal(b))
      .catch(() => live && setBal(null));
    return () => {
      live = false;
    };
  }, [open, pos.tokenAddress]);

  const quoteMax = !bal
    ? null
    : quoteSym === 'ETH'
      ? bal.eth
      : quoteSym === 'USDG'
        ? bal.usdg
        : quoteSym === 'WETH'
          ? bal.weth
          : null;

  const typed = (side: 'quote' | 'token', v: string): void => {
    setPlan(null);
    if (side === 'quote') setQuote(v);
    else setToken(v);
    if (balance || sides !== 'both') return;
    const other = pairedAmount(pos.priceLower, pos.priceUpper, pos.price, side, Number(v) || 0);
    const shown = other > 0 ? String(Number(other.toPrecision(8))) : '';
    if (side === 'quote') setToken(shown);
    else setQuote(shown);
  };

  const body = {
    key: pos.key,
    amount: Number(quote) || 0,
    amountToken: Number(token) || 0,
    payNative,
    zap: balance,
  };
  const filled = body.amount > 0 || body.amountToken > 0;

  const review = async (): Promise<void> => {
    setQuoting(true);
    setPlan(null);
    try {
      setPlan(await post<OpenPlan>('/api/add/plan', body));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'could not price that');
    } finally {
      setQuoting(false);
    }
  };

  const finish = (): void => {
    action.reset();
    setPlan(null);
    setQuote('');
    setToken('');
    setOpen(false);
  };

  const pair = plan?.pair;

  return (
    <Dialog open={open} onOpenChange={(o) => (running ? null : setOpen(o))}>
      <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
        {trigger ?? (
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'group/add text-white hover:text-white border-border/60 hover:border-primary/40 cursor-pointer shadow-2xs transition-all duration-150 active:scale-[0.98]',
              className,
            )}
            title="Add liquidity to existing range"
          >
            <Plus className="size-3.5 text-white" />
            <span className="text-white">{label}</span>
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
              <Plus className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-[15px] font-semibold tracking-tight text-foreground flex items-center gap-2">
                <span>Add Liquidity</span>
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

        {running ? (
          <ActionProgress steps={action.steps} awaiting={action.awaiting} onDone={finish} />
        ) : (
          <div className="space-y-3.5 pt-1">
            <div className="space-y-2">
              <Amount
                symbol={quoteSym}
                value={quote}
                max={quoteMax}
                dim={!balance && sides === 'token'}
                onChange={(v) => typed('quote', v)}
              />
              <Amount
                symbol={pos.symbol}
                value={token}
                max={bal?.token ?? null}
                dim={!balance && sides === 'quote'}
                onChange={(v) => typed('token', v)}
              />
            </div>

            {/* Toggle: Balance with a swap */}
            <div
              className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border/40 bg-muted/10 cursor-pointer select-none"
              onClick={() => {
                setBalance((b) => !b);
                setPlan(null);
              }}
            >
              <span className="text-xs font-medium text-foreground">Auto-balance with swap</span>
              <div onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={balance}
                  onCheckedChange={(v) => {
                    setBalance(v);
                    setPlan(null);
                  }}
                />
              </div>
            </div>

            {/* Toggle: Pay with ETH if pair uses WETH/ETH */}
            {(pos.quoteSymbol?.toUpperCase() === 'WETH' || pos.quoteSymbol?.toUpperCase() === 'ETH') && (
              <div
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border/40 bg-muted/10 cursor-pointer select-none text-xs"
                onClick={() => {
                  setPayNative((p) => !p);
                  setPlan(null);
                }}
              >
                <span className="font-medium text-foreground">Pay with native ETH</span>
                <div onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={payNative}
                    onCheckedChange={(v) => {
                      setPayNative(v);
                      setPlan(null);
                    }}
                  />
                </div>
              </div>
            )}

            {/* Quote Preview Plan */}
            {plan && pair && (
              <div className="bg-muted/15 space-y-2 rounded-xl border border-border/50 p-3 text-xs font-mono">
                <Figure label="Total Deposit" value={usd(plan.depositUsd)} />
                <Figure
                  label="Added into Range"
                  value={`${num(pair.useQuote)} ${pos.quoteSymbol} + ${num(pair.useToken)} ${pos.symbol}`}
                />
                {pair.zap && (
                  <Figure
                    label="Auto Swap"
                    value={
                      pair.zap.side === 'buy'
                        ? `${num(pair.zap.amountIn)} ${pos.quoteSymbol} → ${num(pair.zap.expectedOut)} ${pos.symbol}`
                        : `${num(pair.zap.amountIn)} ${pos.symbol} → ${num(pair.zap.expectedOut)} ${pos.quoteSymbol}`
                    }
                  />
                )}
                <Figure
                  label="Est. Gas"
                  value={usd(plan.gasUsd)}
                  className={plan.gasOverLimit ? 'text-destructive' : undefined}
                />
                {plan.gasOverLimit && <Badge variant="destructive">over your gas limit</Badge>}
              </div>
            )}

            {/* CTA Buttons */}
            {plan ? (
              <div className="flex gap-2 pt-1">
                <Button
                  className="flex-1 h-9 text-xs font-semibold shadow-2xs cursor-pointer transition-all duration-150 active:scale-[0.98] hover:brightness-105"
                  disabled={action.busy || plan.gasOverLimit}
                  onClick={() => void action.run('/api/add', body)}
                >
                  {action.busy ? 'Sending…' : 'Confirm Deposit'}
                </Button>
                <Button
                  variant="outline"
                  className="h-9 text-xs cursor-pointer transition-all duration-150 active:scale-[0.98]"
                  onClick={() => setPlan(null)}
                >
                  Change
                </Button>
              </div>
            ) : (
              <Button
                className="w-full h-9 text-xs font-semibold shadow-2xs cursor-pointer transition-all duration-150 active:scale-[0.98] hover:brightness-105"
                disabled={!filled || quoting}
                onClick={() => void review()}
              >
                {quoting ? 'Pricing…' : 'Review Deposit'}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
