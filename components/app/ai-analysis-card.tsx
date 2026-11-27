'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { aiErrorMessage, fetchLatestAnalysis, isAiUnavailable, runAnalysis, scoreTone, SIDE_LABEL, type PoolRefBody } from '@/lib/ai-analysis';
import { formatSubscriptPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AiAnalysis, AiRangeSide } from '@/lib/types';

/**
 * The AI LP analysis on the pool page: the latest analysis for this pool, a
 * button to run a new one, and "Apply to range", which only fills the entry
 * form. Hidden entirely when the backend has no AI configured (503).
 */

interface Props {
  /** Null until the page knows which pool it is on. */
  poolRef: PoolRefBody | null;
  quoteSymbol: string;
  tokenSymbol: string;
  /** The analysis currently applied to the form, if any. */
  appliedId?: number;
  onApply: (analysis: AiAnalysis) => void;
  /** Reports the current analysis so the chart can draw its range. */
  onAnalysis?: (analysis: AiAnalysis | null) => void;
}

const TONE: Record<ReturnType<typeof scoreTone>, string> = {
  good: 'text-emerald-500 border-emerald-500/40',
  fair: 'text-amber-500 border-amber-500/40',
  poor: 'text-red-500 border-red-500/40',
};

const pct = (n: number): string => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
const ago = (ms: number): string => {
  const min = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  return min < 1 ? 'just now' : min < 60 ? `${min}m ago` : `${Math.round(min / 60)}h ago`;
};

export const AiAnalysisCard = ({ poolRef, quoteSymbol, tokenSymbol, appliedId, onApply, onAnalysis }: Props) => {
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmStale, setConfirmStale] = useState(false);
  const [side, setSide] = useState<AiRangeSide>('both');
  const runRef = useRef<AbortController | null>(null);
  const refKey = poolRef ? `${poolRef.chainId ?? ''}:${poolRef.poolId}:${poolRef.version}` : '';

  const show = useCallback(
    (a: AiAnalysis | null) => {
      setAnalysis(a);
      onAnalysis?.(a);
    },
    [onAnalysis],
  );

  // The latest analysis for this pool, on arrival and whenever the pool changes.
  useEffect(() => {
    runRef.current?.abort();
    setRunning(false);
    setError(null);
    setConfirmStale(false);
    show(null);
    if (!poolRef) return;
    const ctl = new AbortController();
    fetchLatestAnalysis(poolRef, ctl.signal)
      .then((a) => {
        if (ctl.signal.aborted) return;
        show(a);
        if (a) setSide(a.rangeSide ?? 'both');
      })
      .catch((err: unknown) => {
        if (ctl.signal.aborted) return;
        if (isAiUnavailable(err)) setUnavailable(true);
        // Any other failure here is quiet: the button still works.
      });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKey]);

  const analyze = async (): Promise<void> => {
    if (!poolRef || running) return;
    const ctl = new AbortController();
    runRef.current = ctl;
    setRunning(true);
    setError(null);
    setConfirmStale(false);
    try {
      // Asking again over a stale answer of the same side means a fresh one, not the reuse window.
      const force = analysis?.stale === true && analysis.rangeSide === side;
      show(await runAnalysis(poolRef, { force, rangeSide: side }, ctl.signal));
    } catch (err) {
      if (ctl.signal.aborted) return;
      if (isAiUnavailable(err)) setUnavailable(true);
      else setError(aiErrorMessage(err));
    } finally {
      if (runRef.current === ctl) {
        runRef.current = null;
        setRunning(false);
      }
    }
  };

  const cancel = (): void => {
    runRef.current?.abort();
    runRef.current = null;
    setRunning(false);
  };

  const apply = (): void => {
    if (!analysis) return;
    if (analysis.stale && !confirmStale) {
      setConfirmStale(true);
      return;
    }
    setConfirmStale(false);
    onApply(analysis);
  };

  if (unavailable || !poolRef) return null;

  const applied = analysis !== null && appliedId === analysis.id;
  const sameSide = analysis !== null && (analysis.rangeSide ?? 'both') === side;

  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <Sparkles className="size-3.5 text-violet-500" />
          AI analysis
        </span>
        {running ? (
          <Button type="button" size="xs" variant="ghost" onClick={cancel}>
            <X /> Cancel
          </Button>
        ) : (
          <Button type="button" size="xs" variant="outline" onClick={() => void analyze()}>
            {sameSide ? <RefreshCw /> : <Sparkles />}
            {sameSide ? 'Re-analyze' : 'Analyze with AI'}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1" role="radiogroup" aria-label="Range side">
        {(['both', 'down', 'up'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            disabled={running}
            onClick={() => setSide(s)}
            className={cn(
              'flex-1 rounded-md border px-1.5 py-0.5 text-[10px] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60',
              side === s
                ? 'border-violet-500/60 bg-violet-500/15 text-foreground font-semibold'
                : 'border-border/60 text-muted-foreground hover:text-foreground',
            )}
            title={
              s === 'both'
                ? 'Range below and above spot; deposit both assets'
                : s === 'down'
                  ? 'Range below spot only; deposit the quote asset, buy the token as price falls'
                  : 'Range above spot only; deposit the token, sell it as price rises'
            }
          >
            {SIDE_LABEL[s]}
          </button>
        ))}
      </div>

      {running && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Reading on-chain token data and asking the model. This can take up to a minute.
        </div>
      )}

      {error && !running && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-500">
          <AlertTriangle className="size-3.5 shrink-0 mt-px" />
          {error}
        </div>
      )}

      {analysis && !running && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex size-11 shrink-0 flex-col items-center justify-center rounded-full border-2 font-mono',
                TONE[scoreTone(analysis.lpScore)],
              )}
              title="LP score, 0-100"
            >
              <span className="text-sm font-bold leading-none">{analysis.lpScore}</span>
              <span className="text-[8px] leading-none opacity-70">/100</span>
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1">
                <Badge variant="outline" className="text-[10px] capitalize">
                  {analysis.confidence} confidence
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {SIDE_LABEL[analysis.rangeSide ?? 'both']}
                </Badge>
                {analysis.stale && (
                  <Badge variant="destructive" className="text-[10px]">
                    Stale
                  </Badge>
                )}
                {applied && (
                  <Badge variant="success" className="text-[10px]">
                    Applied
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground">{ago(analysis.createdAt)}</span>
              </div>
              <div className="font-mono text-[11px] text-foreground">
                {formatSubscriptPrice(analysis.bottomPrice)} – {formatSubscriptPrice(analysis.topPrice)}{' '}
                <span className="text-muted-foreground">
                  {quoteSymbol}/{tokenSymbol}
                </span>
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {pct(analysis.lowerPct)} / {pct(analysis.upperPct)} from spot at analysis
              </div>
            </div>
          </div>

          {analysis.summary && <p className="text-[11px] leading-snug text-muted-foreground">{analysis.summary}</p>}

          {analysis.risks.length > 0 && (
            <ul className="space-y-0.5">
              {analysis.risks.map((r) => (
                <li key={r} className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                  {r}
                </li>
              ))}
            </ul>
          )}

          <Button type="button" size="sm" className="w-full" variant={confirmStale ? 'destructive' : 'secondary'} onClick={apply}>
            {confirmStale ? 'Price has moved since this analysis. Apply anyway?' : applied ? 'Applied to range' : 'Apply to range'}
          </Button>

          <p className="text-[9px] leading-tight text-muted-foreground/80">
            AI suggestion, not financial advice. Applying only fills the range; review the plan before you open.
          </p>
        </div>
      )}
    </div>
  );
};
