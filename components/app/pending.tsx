'use client';

import { useEffect, useState } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { useActionSeq } from './live';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { get } from '@/lib/api';
import type { PendingAction, TrackedTransaction } from '@/lib/types';
import { cn } from '@/lib/utils';

// The queue also survives a reload, so it is read back rather than kept in
// memory: the tap happens on a phone, minutes later, maybe on another device.
const POLL_MS = 30_000;

export const usePendingOperations = (): TrackedTransaction[] => {
  const [operations, setOperations] = useState<TrackedTransaction[]>([]);
  useEffect(() => {
    let live = true;
    const fetchPending = async () => {
      try {
        const out = await get<{ actions?: PendingAction[]; transactions?: TrackedTransaction[]; pending?: TrackedTransaction[] }>('/api/pending');
        if (live) {
          setOperations((out.transactions ?? out.pending ?? []).filter((t) => !t.done));
        }
      } catch {}
    };
    void fetchPending();
    const interval = setInterval(() => void fetchPending(), 10_000);
    return () => {
      live = false;
      clearInterval(interval);
    };
  }, []);
  return operations;
};

export const PendingBadge = () => {
  const seq = useActionSeq();
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [transactions, setTransactions] = useState<TrackedTransaction[]>([]);

  useEffect(() => {
    let live = true;
    const load = async (): Promise<void> => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const out = await get<{
          actions?: PendingAction[];
          transactions?: TrackedTransaction[];
          pending?: TrackedTransaction[];
        }>('/api/pending');
        if (live) {
          if (out.actions) setActions(out.actions);
          const activeTxs = (out.transactions ?? out.pending ?? []).filter((t) => !t.done);
          setTransactions(activeTxs);
        }
      } catch {
        // A dropped poll is not worth a toast; the next one covers it.
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [seq]);

  const total = actions.length + transactions.length;
  if (!total) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            'gap-1.5 font-normal',
            transactions.length > 0 ? 'text-primary border-primary/30' : 'text-amber-500 border-amber-500/30',
          )}
        >
          {transactions.length > 0 ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <MessageCircle className="size-3.5" />
          )}
          {total}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1 text-xs">
          {actions.length > 0 && (
            <>
              <div className="font-medium text-amber-500">Waiting for your tap in Telegram</div>
              {actions.map((a) => (
                <div key={a.id} className="text-muted-foreground">
                  {a.summary}
                </div>
              ))}
            </>
          )}
          {transactions.length > 0 && (
            <>
              <div className="font-medium text-primary flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" />
                Active Operations ({transactions.length})
              </div>
              {transactions.map((t) => (
                <div key={t.id || t.jobId} className="text-muted-foreground">
                  {t.label || `Operation ${t.kind || ''} in progress…`}
                </div>
              ))}
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
