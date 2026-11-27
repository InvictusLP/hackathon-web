import type { ActionOutcome, JobStep } from './types';
import { get } from './api';

export interface BatchCloseTarget {
  key: string;
  tokenId?: number | string;
  symbol?: string;
  tokenSymbol?: string;
}

export interface BatchCloseOptions<T extends BatchCloseTarget = BatchCloseTarget> {
  sell?: boolean;
  onProgress?: (index: number, total: number, target: T) => void;
  runClose: (key: string, sell?: boolean) => Promise<ActionOutcome | { jobId?: string } | null>;
  waitForConfirmation?: (jobId: string) => Promise<unknown>;
}

/**
 * Sequences batch position closure to ensure each position is awaited and confirmed
 * before the next is submitted, preventing EVM nonce collisions and UI dialog thrashing.
 */
export const executeBatchClose = async <T extends BatchCloseTarget>(
  positions: T[],
  opts: BatchCloseOptions<T>,
): Promise<{ closed: number; failed: number }> => {
  let closed = 0;
  let failed = 0;
  const total = positions.length;

  for (let i = 0; i < total; i++) {
    const p = positions[i]!;
    opts.onProgress?.(i, total, p);

    try {
      const outcome = await opts.runClose(p.key, opts.sell);
      if (outcome && 'jobId' in outcome && outcome.jobId) {
        if (opts.waitForConfirmation) {
          await opts.waitForConfirmation(outcome.jobId);
        }
        closed++;
      } else if (outcome) {
        closed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { closed, failed };
};

/**
 * Awaits on-chain confirmation of a job via SSE job events with fallback to pending tx polling.
 */
export const waitForJobConfirmation = (
  jobId: string,
  timeoutMs = 60_000,
): Promise<JobStep | null> => {
  if (typeof window === 'undefined') return Promise.resolve(null);

  return new Promise((resolve) => {
    let resolved = false;

    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(pollInterval);
      window.removeEventListener('invictus:job', onJobEvent);
    };

    const done = (step: JobStep | null) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(step);
    };

    const timer = setTimeout(() => done(null), timeoutMs);

    const onJobEvent = (e: Event) => {
      const step = (e as CustomEvent<JobStep>).detail;
      if (step && step.jobId === jobId && (step.done || step.error)) {
        done(step);
      }
    };

    window.addEventListener('invictus:job', onJobEvent);

    const pollInterval = setInterval(async () => {
      if (resolved) return;
      try {
        const res = await get<{ transactions?: { jobId: string; done?: boolean }[] }>('/api/pending');
        const tx = res?.transactions?.find((t) => t.jobId === jobId);
        if (tx && tx.done) {
          done({ jobId, kind: 'done', label: 'Confirmed', done: true });
        }
      } catch {
        // Polling fallback continues until timeout
      }
    }, 1500);
  });
};
