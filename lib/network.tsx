'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { get, post } from './api';

/**
 * Which network the dashboard shows: one chain, or every enabled one (null).
 *
 * The choice lives on the backend (`/api/network`), shared with the Telegram
 * bot, so a switch in one shows in the other. It only scopes what is listed:
 * every open, close and withdrawal still names its own chain, so switching while
 * a form is open never retargets it.
 */

export interface NetworkChain {
  id: number;
  name: string;
  badge: string;
  nativeSymbol: string;
  swaps: boolean;
  beta: boolean;
  explorer: string;
}

interface NetworkPayload {
  selected: number | null;
  chains: NetworkChain[];
}

interface NetworkState {
  /** The chosen chain, or null for every network. */
  selected: number | null;
  /** Every enabled chain. Fewer than two means there is nothing to switch. */
  chains: NetworkChain[];
  ready: boolean;
  select: (chainId: number | null) => Promise<void>;
  /** True when something on `chainId` belongs on screen under the current choice. */
  inNetwork: (chainId: number | null | undefined) => boolean;
}

const STORAGE_KEY = 'invictus:network';

const readCached = (): number | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const id = raw === null ? NaN : Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

const writeCached = (id: number | null): void => {
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // Private mode or blocked storage: the backend still holds the choice.
  }
};

const Ctx = createContext<NetworkState>({
  selected: null,
  chains: [],
  ready: false,
  select: async () => {},
  inNetwork: () => true,
});

export const NetworkProvider = ({ children }: { children: ReactNode }) => {
  // The cached choice draws the first frame; the backend's answer replaces it.
  const [selected, setSelected] = useState<number | null>(() => (typeof window === 'undefined' ? null : readCached()));
  const [chains, setChains] = useState<NetworkChain[]>([]);
  const [ready, setReady] = useState(false);

  const apply = useCallback((p: NetworkPayload) => {
    setChains(p.chains);
    setSelected(p.selected);
    writeCached(p.selected);
    setReady(true);
  }, []);

  useEffect(() => {
    let live = true;
    const load = () =>
      get<NetworkPayload>('/api/network')
        .then((p) => live && apply(p))
        .catch(() => live && setReady(true));
    void load();
    // Picked up when the tab comes back, so a switch made in Telegram shows here.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [apply]);

  const select = useCallback(
    async (chainId: number | null) => {
      const before = selected;
      setSelected(chainId);
      writeCached(chainId);
      try {
        apply(await post<NetworkPayload>('/api/network', { chainId }));
        window.dispatchEvent(new CustomEvent('invictus:network', { detail: { chainId } }));
      } catch (err) {
        setSelected(before);
        writeCached(before);
        throw err;
      }
    },
    [apply, selected],
  );

  const value = useMemo<NetworkState>(() => {
    // A chain the backend no longer enables reads as every network.
    const effective = selected !== null && chains.length && !chains.some((c) => c.id === selected) ? null : selected;
    return {
      selected: effective,
      chains,
      ready,
      select,
      inNetwork: (chainId) => effective === null || (chainId ?? 4663) === effective,
    };
  }, [selected, chains, ready, select]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useNetwork = (): NetworkState => useContext(Ctx);
