'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  fetchDirectoryPage,
  getCachedDirectoryPage,
  isExpiredSnapshot,
  materializePage,
  subscribeDirectory,
  subscribeDirectoryRevision,
  type DirectoryQuery,
} from './pool-directory';
import type { PoolPage } from './types';
import { isGlobalStreamConnected } from './use-live';

type PageState = { key: string; page: PoolPage } | null;

export const settledSearchQuery = (open: boolean, raw: string, debounced: string): string | null => {
  const normalized = raw.trim();
  return open && normalized !== '' && normalized === debounced ? normalized : null;
};

export const usePoolDirectory = (query: DirectoryQuery | null, debounceMs = 0) => {
  const key = query ? JSON.stringify(query) : '';
  const [state, setState] = useState<PageState>(() => {
    if (!query) return null;
    const cached = getCachedDirectoryPage(query);
    return cached ? { key, page: cached } : null;
  });
  const [loading, setLoading] = useState(() => Boolean(query && !getCachedDirectoryPage(query!)));
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [generation, restart] = useReducer((n) => n + 1, 0);
  const requestRef = useRef(0);
  const page = state?.key === key ? state.page : null;

  useEffect(
    () =>
      subscribeDirectory(() =>
        setState((current) => (current ? { ...current, page: materializePage(current.page) } : current)),
      ),
    [],
  );
  useEffect(() => {
    const request = ++requestRef.current;
    if (!query) {
      setState(null);
      setLoading(false);
      setError(null);
      setRefreshError(null);
      return;
    }
    const controller = new AbortController();
    const cached = getCachedDirectoryPage(query);
    if (!cached || generation > 0) {
      setLoading(true);
    }
    setError(null);
    setRefreshError(null);
    setState((current) => {
      if (current?.key === key) return current;
      return cached ? { key, page: cached } : null;
    });
    const timer = window.setTimeout(() => {
      fetchDirectoryPage(query, controller.signal, generation > 0)
        .then((next) => {
          if (!controller.signal.aborted && request === requestRef.current) setState({ key, page: next });
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted || request !== requestRef.current) return;
          if (isExpiredSnapshot(cause) && query.cursor) {
            setError('Snapshot expired');
            return;
          }
          setError(cause instanceof Error ? cause.message : 'Failed to load pools');
        })
        .finally(() => {
          if (request === requestRef.current) setLoading(false);
        });
    }, debounceMs);
    return () => {
      ++requestRef.current;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, generation, debounceMs]);

  const idsKey = page?.pools.map((pool) => pool.canonicalId).join(',') ?? '';
  useEffect(() => {
    if (!page) return;
    let refreshController: AbortController | null = null;
    let lastRefreshedAt = Date.now();
    let isRefreshing = false;

    const refresh = (force = false) => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const now = Date.now();
      if (!force && (now - lastRefreshedAt < 2500 || isRefreshing)) return;

      refreshController?.abort();
      refreshController = new AbortController();
      const signal = refreshController.signal;
      isRefreshing = true;

      const operation = fetchDirectoryPage(query!, signal, true).then((next) => {
        if (!signal.aborted)
          setState((current) => (current?.key === key ? { key, page: next } : current));
      });

      void operation
        .then(() => {
          if (!signal.aborted) {
            lastRefreshedAt = Date.now();
            setRefreshError(null);
          }
        })
        .catch((cause: unknown) => {
          if (!signal.aborted)
            setRefreshError(cause instanceof Error ? cause.message : 'Live refresh failed');
        })
        .finally(() => {
          if (refreshController?.signal === signal) {
            isRefreshing = false;
          }
        });
    };

    // Event-driven revalidation on directory.revision with low client jitter (200-500ms)
    let jitterTimer: number | null = null;
    const scheduleJitterRefresh = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (jitterTimer !== null) window.clearTimeout(jitterTimer);
      const jitterMs = 200 + Math.random() * 300;
      jitterTimer = window.setTimeout(() => refresh(true), jitterMs);
    };

    const unsubscribeRevision = subscribeDirectoryRevision(() => {
      scheduleJitterRefresh();
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastRefreshedAt;
        if (elapsed > 4000) {
          refresh(true);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Adaptive periodic revalidation timer:
    // If SSE is connected, realtime revisions stream automatically; relax idle polling to 25s.
    // If SSE is disconnected, poll at 8s to guarantee freshness.
    const pollInterval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const isConnected = isGlobalStreamConnected();
      const maxAge = isConnected ? 25_000 : 8_000;
      if (Date.now() - lastRefreshedAt >= maxAge) {
        refresh();
      }
    }, 3_000);

    return () => {
      refreshController?.abort();
      window.clearInterval(pollInterval);
      if (jitterTimer !== null) window.clearTimeout(jitterTimer);
      unsubscribeRevision();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [key, page?.snapshot, idsKey]);

  return {
    page,
    loading,
    error,
    refreshError,
    restart: useCallback(() => restart(), []),
  };
};
