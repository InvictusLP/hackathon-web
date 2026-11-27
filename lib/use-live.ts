'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { EMPTY_READ, fetchStore } from './fetch-store';
import {
  applyExecutionOverlay,
  handleLeaderboardUpdate,
  onDirectoryRevision,
  type LeaderboardPayload,
} from './pool-directory';
import type { GasNow, JobStep, Snapshot } from './types';
import { getAuthToken } from './api';

/**
 * EventSource reconnects on its own; the teardown is what matters. A stream left
 * open after unmount keeps the server polling the chain for a dead tab.
 */
export interface LiveState {
  snap: Snapshot | null;
  connected: boolean;
  /** Steps so far per job, in arrival order. */
  jobs: Record<string, JobStep[]>;
  /** Bumped whenever an approval is decided, so the queue can refetch itself. */
  actionSeq: number;
  /** Latest price for the pool this session is following, straight off a swap. */
  poolTick: { poolId: string; price: number; tick: number; at: number } | null;
}

export interface UseLiveOptions {
  poolId?: string;
  topic?: string;
}

export const isSyncMutationPath = (path: string): boolean =>
  /^\/api\/(state|wallets?|positions|pnl|calendar|pending)(?:[/?]|$)/.test(path);

let globalStreamConnected = false;
export const isGlobalStreamConnected = (): boolean => globalStreamConnected;

export const useLive = (
  enabled: boolean,
  options?: UseLiveOptions | string,
): LiveState => {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const updateConnected = (val: boolean) => {
    globalStreamConnected = val;
    setConnected(val);
  };
  const [jobs, setJobs] = useState<Record<string, JobStep[]>>({});
  const [actionSeq, setActionSeq] = useState(0);
  const [tick, setTick] = useState<LiveState['poolTick']>(null);

  const poolId = typeof options === 'string' ? options : options?.poolId;
  const topic = typeof options === 'object' ? options?.topic : undefined;

  useEffect(() => {
    if (!enabled) { setSnap(null); setJobs({}); setTick(null); return; }
    let active = true;
    let generation = 0;
    let es: EventSource | null = null;
    let controller: AbortController | null = null;
    let address: string | null | undefined;
    const accept = (next: Snapshot) => {
      const nextAddress = next.wallet?.address.toLowerCase() ?? null;
      if (address !== undefined && nextAddress !== address) {
        fetchStore.invalidate();
        setJobs({});
        setTick(null);
      }
      address = nextAddress;
      setSnap(next);
    };
    let lastMessageAt = Date.now();
    const connect = () => {
      const ownGeneration = generation;
      lastMessageAt = Date.now();
      // EventSource cannot send custom headers; when the session cookie is
      // unavailable (e.g. Telegram WebView blocks third-party cookies) fall
      // back to the Bearer token as a query parameter.
      // TODO(sec): Migrate to short-lived single-use ticket (POST /api/stream/ticket)
      // to avoid exposing persistent session token in URLs, reverse proxy access logs, and CDN logs.
      const token = getAuthToken();
      const params = new URLSearchParams();
      if (token) params.set('token', token);
      if (poolId) params.set('poolId', poolId);
      if (topic) params.set('topic', topic);
      const qs = params.toString();
      const streamUrl = qs ? `/api/stream?${qs}` : '/api/stream';
      es = new EventSource(streamUrl, { withCredentials: true });
      const valid = () => active && generation === ownGeneration;
      const touch = () => { lastMessageAt = Date.now(); };
      es.addEventListener('state', (e) => {
        touch();
        if (!valid()) return;
        controller?.abort();
        accept(JSON.parse((e as MessageEvent<string>).data) as Snapshot);
        updateConnected(true);
      });
      es.addEventListener('job', (e) => {
        touch();
        if (!valid()) return;
        const step = JSON.parse((e as MessageEvent<string>).data) as JobStep;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('invictus:job', { detail: step }));
        }
        if (step.done) {
          fetchStore.invalidate(isSyncMutationPath, false);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('invictus:mutate', { detail: { filter: isSyncMutationPath } }),
            );
          }
          void refresh();
        }
        setJobs((prev) => Object.fromEntries(Object.entries({ ...prev, [step.jobId]: [...(prev[step.jobId] ?? []).slice(-99), step] }).slice(-50)));
      });
      es.addEventListener('action', () => { touch(); if (valid()) setActionSeq((n) => n + 1); });
      es.addEventListener('pool', (e) => { touch(); if (valid()) setTick(JSON.parse((e as MessageEvent<string>).data) as LiveState['poolTick']); });
      es.addEventListener('pool.swap', (e) => {
        touch();
        if (!valid()) return;
        try {
          const swap = JSON.parse((e as MessageEvent<string>).data);
          if (swap && (swap.canonicalId || swap.poolId)) {
            const id = (swap.canonicalId || swap.poolId) as string;
            const volumeUsd = typeof swap.volumeUsd === 'number' && swap.volumeUsd > 0 ? swap.volumeUsd : 0;
            const dir = swap.isBuy ? 'up' : 'down';
            applyExecutionOverlay(id, {
              priceNow: swap.price,
              priceUsd: swap.priceUsd,
              tick: swap.tick,
              blockNumber: swap.blockNumber != null ? String(swap.blockNumber) : undefined,
              swapVolumeUsd: volumeUsd,
              lastSwapDirection: dir,
              lastSwapAt: Date.now(),
              observedAt: Date.now(),
            });
            window.dispatchEvent(new CustomEvent('invictus:swap', { detail: swap }));
          }
        } catch {}
      });
      es.addEventListener('pool.candle', (e) => {
        touch();
        if (!valid()) return;
        try {
          const candle = JSON.parse((e as MessageEvent<string>).data);
          if (candle) {
            window.dispatchEvent(new CustomEvent('invictus:candle', { detail: candle }));
          }
        } catch {}
      });
      es.addEventListener('leaderboard.top', (e) => {
        if (!valid()) return;
        try {
          const data = JSON.parse((e as MessageEvent<string>).data) as LeaderboardPayload;
          handleLeaderboardUpdate('top', data);
        } catch {}
      });
      es.addEventListener('leaderboard.trending', (e) => {
        if (!valid()) return;
        try {
          const data = JSON.parse((e as MessageEvent<string>).data) as LeaderboardPayload;
          handleLeaderboardUpdate('trending', data);
        } catch {}
      });
      es.addEventListener('ping', () => {
        lastMessageAt = Date.now();
      });
      es.addEventListener('directory.revision', (e) => {
        lastMessageAt = Date.now();
        if (!valid()) return;
        try {
          const data = JSON.parse((e as MessageEvent<string>).data) as { revision: string; generatedAt: number };
          onDirectoryRevision(data);
        } catch {}
      });
      es.onopen = () => {
        lastMessageAt = Date.now();
        if (valid()) {
          updateConnected(true);
          try {
            window.dispatchEvent(new CustomEvent('invictus:stream-reconnected'));
          } catch {}
        }
      };
      es.onerror = () => {
        if (!valid()) return;
        // EventSource auto-reconnects on network errors (CONNECTING state = 0).
        // Only mark disconnected and manually restart if permanently CLOSED (e.g. 401/403/500).
        if (es?.readyState === EventSource.CLOSED) {
          updateConnected(false);
          es = null;
          setTimeout(() => { if (valid()) connect(); }, 2000);
        }
      };
    };
    const reconnectOnVisible = () => {
      if (document.visibilityState !== 'visible' || !active) return;
      // Tab became visible: if EventSource is dead, CLOSED, or missed pings (>25s), reconnect immediately
      const isZombie = Date.now() - lastMessageAt > 25_000;
      if (!es || es.readyState === EventSource.CLOSED || isZombie) {
        generation++;
        es?.close();
        es = null;
        connect();
        void refresh();
      }
    };
    const refresh = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const ownGeneration = generation;
      try {
        const res = await fetch('/api/state', { credentials: 'same-origin', signal: request.signal });
        const next = res.ok ? await res.json() as Snapshot : null;
        if (next && active && !request.signal.aborted && generation === ownGeneration) accept(next);
      } catch { /* The stream retries independently. */ }
    };
    const changeWallet = () => {
      generation++;
      controller?.abort();
      es?.close();
      setSnap(null);
      setJobs({});
      setTick(null);
      updateConnected(false);
      address = undefined;
      connect();
      void refresh();
    };
    const onMutate = (e?: Event) => {
      const filter = (e as CustomEvent<{ filter?: (path: string) => boolean }>)?.detail?.filter;
      if (!filter || filter('/api/state')) {
        void refresh();
      }
    };
    const watchdogTimer = setInterval(() => {
      if (!active || document.visibilityState !== 'visible') return;
      if (Date.now() - lastMessageAt > 35_000) {
        generation++;
        es?.close();
        es = null;
        connect();
        void refresh();
      }
    }, 15_000);

    connect();
    window.addEventListener('invictus:mutate', onMutate);
    window.addEventListener('invictus:wallet', changeWallet);
    document.addEventListener('visibilitychange', reconnectOnVisible);
    return () => {
      active = false;
      clearInterval(watchdogTimer);
      controller?.abort();
      es?.close();
      updateConnected(false);
      window.removeEventListener('invictus:mutate', onMutate);
      window.removeEventListener('invictus:wallet', changeWallet);
      document.removeEventListener('visibilitychange', reconnectOnVisible);
    };
  }, [enabled, poolId, topic]);

  return useMemo(
    () => ({ snap, connected, jobs, actionSeq, poolTick: tick }),
    [snap, connected, jobs, actionSeq, tick],
  );
};

/** Its own slow clock: gas moves far less than the price does. */
export const useGas = (enabled: boolean, everyMs = 15_000): GasNow | null => {
  const { data } = useFetch<GasNow>(enabled ? '/api/gas' : null);
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const revalidate = () => fetchStore.invalidate((path) => path === '/api/gas', false);
    const timer = setInterval(() => {
      if (!document.hidden) revalidate();
    }, everyMs);
    const onVisible = () => {
      if (!document.hidden) revalidate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, everyMs]);
  return data;
};

export const mutateFetch = (filter?: (path: string) => boolean): void => {
  fetchStore.invalidate(filter, false);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('invictus:mutate', { detail: { filter } }));
};

/** Clear wallet-scoped reads before refreshing the stream after a signing-wallet change. */
export const walletChanged = (): void => {
  fetchStore.invalidate();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('invictus:wallet'));
};

export const useFetch = <T>(
  path: string | null,
): {
  data: T | null;
  error: string | null;
  loading: boolean;
  validating: boolean;
  reload: () => void;
} => {
  const subscribe = useCallback((notify: () => void) => (path ? fetchStore.subscribe(path, notify) : () => {}), [path]);
  const snapshot = useCallback(() => (path ? fetchStore.snapshot(path) : EMPTY_READ), [path]);
  const state = useSyncExternalStore(subscribe, snapshot, () => EMPTY_READ);
  const reload = useCallback(() => {
    if (path) mutateFetch((key) => key === path);
  }, [path]);
  return {
    data: state.data as T | null,
    error: state.error,
    loading: state.loading,
    validating: state.validating,
    reload,
  };
};

let sharedPingValue: number | null = null;
const pingListeners = new Set<(p: number | null) => void>();
let pingTimer: ReturnType<typeof setInterval> | null = null;
let pingVisHandler: (() => void) | null = null;
let pingController: AbortController | null = null;

const measureSharedPing = async (): Promise<void> => {
  if (typeof document !== 'undefined' && document.hidden) return;
  pingController?.abort();
  pingController = new AbortController();
  const timer = setTimeout(() => pingController?.abort(), 4000);
  const start = performance.now();
  try {
    const res = await fetch('/healthz', {
      cache: 'no-store',
      signal: pingController.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const rtt = Math.max(1, Math.round(performance.now() - start));
      sharedPingValue = rtt;
      pingListeners.forEach((l) => l(rtt));
    }
  } catch {
    clearTimeout(timer);
  }
};

const subscribeSharedPing = (listener: (p: number | null) => void, intervalMs = 30_000): (() => void) => {
  pingListeners.add(listener);
  if (sharedPingValue !== null) listener(sharedPingValue);

  if (pingListeners.size === 1) {
    void measureSharedPing();
    pingTimer = setInterval(() => void measureSharedPing(), intervalMs);
    if (typeof document !== 'undefined') {
      pingVisHandler = () => {
        if (document.visibilityState === 'visible') void measureSharedPing();
      };
      document.addEventListener('visibilitychange', pingVisHandler);
    }
  }

  return () => {
    pingListeners.delete(listener);
    if (pingListeners.size === 0) {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (pingVisHandler && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', pingVisHandler);
        pingVisHandler = null;
      }
      pingController?.abort();
      pingController = null;
    }
  };
};

/** Measures live round-trip latency to the server in milliseconds with shared deduplicated polling */
export const usePing = (enabled: boolean = true, intervalMs = 30_000): number | null => {
  const [ping, setPing] = useState<number | null>(sharedPingValue);

  useEffect(() => {
    if (!enabled) return;
    return subscribeSharedPing(setPing, intervalMs);
  }, [enabled, intervalMs]);

  return ping;
};

