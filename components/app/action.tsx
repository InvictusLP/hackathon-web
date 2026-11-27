'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, MessageCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useJob } from './live';
import { Button } from '@/components/ui/button';
import { newIdempotencyKey, post } from '@/lib/api';
import { useBlockExplorer } from '@/lib/explorer';
import type { ActionOutcome, JobStep } from '@/lib/types';

/**
 * One write, whichever way it goes.
 *
 * A write either starts immediately and reports back over the stream, or parks
 * in Telegram waiting for a tap. The caller does not need to know which: it
 * fires `run` and renders whatever state comes back.
 */
export const useAction = (initialJobId?: string | null): {
  run: (path: string, body: unknown) => Promise<ActionOutcome | null>;
  busy: boolean;
  jobId: string | null;
  awaiting: string | null;
  steps: JobStep[];
  finished: JobStep | null;
  reset: () => void;
  setJobId: (id: string | null) => void;
} => {
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(initialJobId ?? null);
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const steps = useJob(jobId);
  const finished = steps.find((s) => s.done) ?? null;

  // Redundant toast notifications removed: ActionDialog and ActionProgress
  // already inform the user directly on screen with full transaction state.

  // State updates land a render later, so two clicks in one frame both saw
  // busy=false and sent two opens. A ref is read synchronously.
  const sending = useRef(false);

  const run = async (path: string, body: unknown): Promise<ActionOutcome | null> => {
    if (sending.current) return null;
    sending.current = true;
    setBusy(true);
    setJobId(null);
    setAwaiting(null);
    try {
      const out = await post<ActionOutcome>(path, body, newIdempotencyKey());
      if (out.status === 'awaiting_approval') {
        setAwaiting(out.summary);
      } else {
        setJobId(out.jobId);
      }
      return out;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'that did not go through');
      return null;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return {
    run,
    busy,
    jobId,
    awaiting,
    steps,
    finished,
    // Stable: callers clear the panel from an effect, and a new identity every
    // render would re-run it and wipe whatever they were typing.
    reset: useCallback(() => {
      setJobId(null);
      setAwaiting(null);
    }, []),
    setJobId,
  };
};

const Step = ({ step, last }: { step: JobStep; last: boolean }) => {
  const icon = step.error ? (
    <XCircle className="text-destructive size-4 shrink-0" />
  ) : step.done ? (
    <CheckCircle2 className="text-up size-4 shrink-0" />
  ) : last ? (
    <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
  ) : (
    <CheckCircle2 className="text-muted-foreground/40 size-4 shrink-0" />
  );

  const { formatUrl } = useBlockExplorer();

  return (
    <li className="flex items-center gap-2 text-sm">
      {icon}
      <span className={step.error ? 'text-destructive' : ''}>{step.label}</span>
      {step.hash && (
        <a
          href={formatUrl(`/tx/${step.hash}`)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs"
          title="View on explorer"
          aria-label="View on explorer"
        >
          {step.hash.slice(0, 8)}…
          <ExternalLink className="size-3" />
        </a>
      )}
    </li>
  );
};

export const ActionProgress = ({
  steps,
  awaiting,
  onDone,
}: {
  steps: JobStep[];
  awaiting: string | null;
  onDone?: () => void;
}) => {
  if (awaiting)
    return (
      <div className="bg-muted/40 flex items-start gap-3 rounded-md border p-3 text-sm">
        <MessageCircle className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div>
          <div className="font-medium">Open Telegram to approve</div>
          <div className="text-muted-foreground mt-0.5">{awaiting}</div>
        </div>
      </div>
    );

  // Each transaction reports twice, once when sent and once with its hash;
  // the second replaces the first rather than stacking under it.
  const rows = steps.filter((s, i) => steps[i + 1]?.label !== s.label);
  const finished = steps.find((s) => s.done);
  const failed = Boolean(finished?.error);

  // A success is announced by useAction and gets out of the way; only a failure
  // stays on screen, because that is the one someone needs to read.
  useEffect(() => {
    if (!finished || failed || !onDone) return;
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [finished, failed, onDone]);

  if (!rows.length) return null;

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {rows.map((s, i) => (
          <Step key={`${s.kind}-${i}`} step={s} last={i === rows.length - 1} />
        ))}
      </ul>
      {failed && onDone && (
        <Button variant="outline" size="sm" onClick={onDone}>
          Done
        </Button>
      )}
    </div>
  );
};
