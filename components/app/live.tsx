'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { GasNow, JobStep, Snapshot } from '@/lib/types';
import type { LiveState } from '@/lib/use-live';

// One SSE stream for the whole app, read by whichever screen is mounted.
const GasContext = createContext<GasNow | null>(null);
export const useGasReading = (): GasNow | null => useContext(GasContext);

const Ctx = createContext<LiveState>({
  snap: null,
  connected: false,
  jobs: {},
  actionSeq: 0,
  poolTick: null,
});

export const useSnapshot = (): Snapshot | null => useContext(Ctx).snap;
export const useLiveConnection = (): boolean => useContext(Ctx).connected;

/** The steps of one job, or an empty list until the first one lands. */
export const useJob = (jobId: string | null): JobStep[] => {
  const { jobs } = useContext(Ctx);
  return jobId ? (jobs[jobId] ?? []) : [];
};

export const useActionSeq = (): number => useContext(Ctx).actionSeq;

/** Returns any actively executing jobs that are awaiting confirmation */
export const useRunningJobs = (): { jobId: string; latestStep: JobStep }[] => {
  const { jobs } = useContext(Ctx);
  const active: { jobId: string; latestStep: JobStep }[] = [];
  for (const [jobId, steps] of Object.entries(jobs)) {
    const isDone = steps.some((s) => s.done);
    const latestStep = steps[steps.length - 1];
    if (!isDone && latestStep) {
      active.push({ jobId, latestStep });
    }
  }
  return active;
};

/** The followed pool's latest price, or null until it trades. */
export const usePoolTick = (poolId: string | null): LiveState['poolTick'] => {
  const t = useContext(Ctx).poolTick;
  if (!t || !poolId) return null;
  return t.poolId.toLowerCase() === poolId.toLowerCase() ? t : null;
};

export const LiveProvider = ({ value, gas, children }: { value: LiveState; gas: GasNow | null; children: ReactNode }) => (
  <GasContext.Provider value={gas}><Ctx.Provider value={value}>{children}</Ctx.Provider></GasContext.Provider>
);
