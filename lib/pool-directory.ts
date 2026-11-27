import { mergePoolObservation, poolObservationStale, toBlockBigInt } from '../shared/pool-directory';
import { ApiError, get } from './api';
import type { CanonicalPool, PoolPage, PoolSort } from './types';

export type DirectoryQuery = {
  ids?: string;
  q?: string;
  limit?: number;
  cursor?: string;
  page?: number;
  sort?: PoolSort;
  direction?: 'asc' | 'desc';
  tab?: 'all' | 'top_performers' | 'trending' | 'new';
  timeframe?: '5m' | '1h' | '6h' | '24h';
  minTvl?: string;
  minVolume?: string;
  minApr?: string;
  protocol?: string;
  chain?: string;
  fee?: string;
};
type CachedPage = { page: PoolPage; cachedAt: number };
type PendingPage = {
  controller: AbortController;
  consumers: number;
  settled: boolean;
  promise: Promise<PoolPage>;
};
const PAGE_TTL_MS = 60_000;
const SNAPSHOT_TTL_MS = 10 * 60_000;
const MAX_PAGE_ENTRIES = 100;
const MAX_ENTITY_ENTRIES = 5000;
const entities = new Map<string, CanonicalPool>();
const pages = new Map<string, CachedPage>();
const pending = new Map<string, PendingPage>();
const listeners = new Set<() => void>();

/**
 * Normalizes user search input for pool discovery.
 * Supports:
 * - Direct contract address / bytes32 pool ID (0x...)
 * - Hex strings without 0x
 * - Canonical IDs (e.g. 4663:uniswap_v4:0x... or uniswap_v4:0x...)
 * - URLs from Uniswap, block explorers (rh-scan, robinscan, blockscout), or DexScreener
 * - Token pair strings (ETH/USDC, ETH-USDC, ETH_USDC)
 */
export function cleanSearchQuery(input: string): string {
  if (!input) return '';
  const trimmed = input.trim().replace(/['"]/g, '');

  // 1. Extract 66-char bytes32 poolId (0x followed by 64 hex characters)
  const v4Match = trimmed.match(/0x[a-fA-F0-9]{64}/i);
  if (v4Match) return v4Match[0].toLowerCase();

  // 2. Extract 42-char address (0x followed by 40 hex characters)
  const v3Match = trimmed.match(/0x[a-fA-F0-9]{40}/i);
  if (v3Match) return v3Match[0].toLowerCase();

  // 3. Raw 64-char hex without 0x
  if (/^[a-fA-F0-9]{64}$/i.test(trimmed)) {
    return `0x${trimmed.toLowerCase()}`;
  }

  // 4. Raw 40-char hex without 0x
  if (/^[a-fA-F0-9]{40}$/i.test(trimmed)) {
    return `0x${trimmed.toLowerCase()}`;
  }

  // 5. Canonical pattern prefix e.g. "uniswap_v4:0x..." or "4663:0x..."
  const colonMatch = trimmed.match(/:0x([a-fA-F0-9]{40,64})/i);
  if (colonMatch && colonMatch[1]) {
    return `0x${colonMatch[1].toLowerCase()}`;
  }

  // 6. Token pair syntax normalization (e.g. "ETH / USDC" -> "ETH/USDC")
  return trimmed
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ');
}

export const directoryUrl = (query: DirectoryQuery): string => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return `/api/pools/directory?${params}`;
};
const publish = () => listeners.forEach((listener) => listener());

export const cleanId = (id?: string | null): string => {
  if (!id) return '';
  const clean = id.trim().toLowerCase();
  return clean.includes(':') ? clean.split(':').pop()! : clean;
};

export interface ExecutionOverlay {
  poolId: string;
  blockNumber: string | null;
  observedAt: number;
  patch: Partial<CanonicalPool>;
}

export type ExecutionOverlayPatch = Partial<CanonicalPool> & {
  blockNumber?: string | null;
  observedAt?: number;
  swapVolumeUsd?: number;
  lastSwapDirection?: 'up' | 'down' | null;
  lastSwapAt?: number | null;
};

const OVERLAY_TTL_MS = 60_000;
const executionOverlays = new Map<string, ExecutionOverlay>();

const deleteOverlay = (poolId: string): void => {
  const normalizedId = poolId.trim().toLowerCase();
  const cId = cleanId(poolId);
  executionOverlays.delete(normalizedId);
  if (cId) executionOverlays.delete(cId);
};

export const applyExecutionOverlay = (
  poolId: string,
  patch: ExecutionOverlayPatch,
): void => {
  const rawId = poolId.trim().toLowerCase();
  const cleanTarget = cleanId(poolId);
  const existing = executionOverlays.get(cleanTarget) ?? executionOverlays.get(rawId);
  const blockNumber = patch.blockNumber ?? existing?.blockNumber ?? null;
  const observedAt = patch.observedAt ?? Date.now();

  const overlayEntry: ExecutionOverlay = {
    poolId: rawId,
    blockNumber,
    observedAt,
    patch: { ...existing?.patch, ...patch },
  };

  executionOverlays.set(rawId, overlayEntry);
  if (cleanTarget && cleanTarget !== rawId) {
    executionOverlays.set(cleanTarget, overlayEntry);
  }

  for (const [key, entity] of entities.entries()) {
    const keyLower = key.toLowerCase();
    const cleanKey = cleanId(key);
    const idLower = entity.id?.toLowerCase();
    const cleanEntityId = cleanId(entity.id);
    const canonicalLower = entity.canonicalId?.toLowerCase();
    const cleanCanonical = cleanId(entity.canonicalId);
    const pairLower = entity.pairAddress?.toLowerCase();
    const cleanPair = cleanId(entity.pairAddress);

    const matches =
      (rawId !== '' && (keyLower === rawId || idLower === rawId || canonicalLower === rawId || pairLower === rawId)) ||
      (cleanTarget !== '' && (cleanKey === cleanTarget || cleanEntityId === cleanTarget || cleanCanonical === cleanTarget || cleanPair === cleanTarget));

    if (matches) {
      const derivedPatch: Partial<CanonicalPool> = { ...patch };

      // 1. Accumulate volume
      if (patch.swapVolumeUsd && patch.swapVolumeUsd > 0) {
        derivedPatch.volume24hUsd = (entity.volume24hUsd ?? 0) + patch.swapVolumeUsd;
        derivedPatch.volume5mUsd = (entity.volume5mUsd ?? 0) + patch.swapVolumeUsd;
        if (entity.volumeTimeframes) {
          derivedPatch.volumeTimeframes = {
            ...entity.volumeTimeframes,
            m5: (entity.volumeTimeframes.m5 ?? entity.volume5mUsd ?? 0) + patch.swapVolumeUsd,
            h24: (entity.volumeTimeframes.h24 ?? entity.volume24hUsd ?? 0) + patch.swapVolumeUsd,
          };
        }
      }

      // 2. Increment txns
      if (patch.lastSwapDirection === 'up' || patch.lastSwapDirection === 'down') {
        const isBuy = patch.lastSwapDirection === 'up';
        const currentTxns = entity.txns ?? {};
        const m5 = { buys: currentTxns.m5?.buys ?? 0, sells: currentTxns.m5?.sells ?? 0 };
        const h1 = { buys: currentTxns.h1?.buys ?? 0, sells: currentTxns.h1?.sells ?? 0 };
        const h6 = { buys: currentTxns.h6?.buys ?? 0, sells: currentTxns.h6?.sells ?? 0 };
        const h24 = { buys: currentTxns.h24?.buys ?? 0, sells: currentTxns.h24?.sells ?? 0 };

        if (isBuy) {
          m5.buys += 1;
          h1.buys += 1;
          h6.buys += 1;
          h24.buys += 1;
        } else {
          m5.sells += 1;
          h1.sells += 1;
          h6.sells += 1;
          h24.sells += 1;
        }

        derivedPatch.txns = {
          ...currentTxns,
          m5,
          h1,
          h6,
          h24,
        };

        const current24h = entity.txns24h ?? entity.txns?.h24 ?? { buys: 0, sells: 0 };
        derivedPatch.txns24h = {
          buys: (current24h.buys ?? 0) + (isBuy ? 1 : 0),
          sells: (current24h.sells ?? 0) + (isBuy ? 0 : 1),
        };
      }

      // 3. Set lastSwapDirection and lastSwapAt
      if (patch.lastSwapDirection) {
        derivedPatch.lastSwapDirection = patch.lastSwapDirection;
      }
      if (patch.lastSwapAt) {
        derivedPatch.lastSwapAt = patch.lastSwapAt;
      }

      // 4. Spot price & USD price calculation
      if (typeof derivedPatch.priceNow === 'number' && derivedPatch.priceNow > 0) {
        if (derivedPatch.priceUsd === undefined) {
          const qSym = entity.quote?.symbol?.toUpperCase();
          if (qSym === 'USDG' || qSym === 'USDC' || qSym === 'USDT') {
            derivedPatch.priceUsd = derivedPatch.priceNow;
          } else if (entity.priceUsd && entity.priceNow && entity.priceNow > 0) {
            derivedPatch.priceUsd = derivedPatch.priceNow * (entity.priceUsd / entity.priceNow);
          }
        }
      }

      // 5. Live price deltas based on baseline
      if (
        typeof derivedPatch.priceNow === 'number' &&
        derivedPatch.priceNow > 0 &&
        typeof entity.priceNow === 'number' &&
        entity.priceNow > 0
      ) {
        const oldPrice = entity.priceNow;
        const newPrice = derivedPatch.priceNow;

        if (entity.priceChange24h != null) {
          const baseline24 = oldPrice / (1 + entity.priceChange24h / 100);
          if (baseline24 > 0) {
            derivedPatch.priceChange24h = ((newPrice - baseline24) / baseline24) * 100;
          }
        } else {
          derivedPatch.priceChange24h = ((newPrice - oldPrice) / oldPrice) * 100;
        }

        if (entity.priceChange5m != null) {
          const baseline5m = oldPrice / (1 + entity.priceChange5m / 100);
          if (baseline5m > 0) {
            derivedPatch.priceChange5m = ((newPrice - baseline5m) / baseline5m) * 100;
          }
        } else {
          derivedPatch.priceChange5m = ((newPrice - oldPrice) / oldPrice) * 100;
        }

        if (entity.priceChange) {
          derivedPatch.priceChange = {
            ...entity.priceChange,
            m5: derivedPatch.priceChange5m ?? entity.priceChange.m5,
            h24: derivedPatch.priceChange24h ?? entity.priceChange.h24,
          };
        }
      }

      // 6. Update fdv and marketCap using derivedPatch.priceUsd * entity.totalSupply
      if (
        typeof derivedPatch.priceUsd === 'number' &&
        derivedPatch.priceUsd > 0 &&
        entity.totalSupply &&
        entity.totalSupply > 0
      ) {
        derivedPatch.fdv = entity.totalSupply * derivedPatch.priceUsd;
        if (entity.marketCap && entity.fdv && entity.fdv > 0) {
          const ratio = Math.min(1, entity.marketCap / entity.fdv);
          derivedPatch.marketCap = derivedPatch.fdv * ratio;
        }
      }

      derivedPatch.blockNumber = blockNumber ?? entity.blockNumber;
      derivedPatch.stateUpdatedAt = Math.max(entity.stateUpdatedAt, observedAt);

      entities.set(key, { ...entity, ...derivedPatch });
      overlayEntry.patch = { ...overlayEntry.patch, ...derivedPatch };
    }
  }
  publish();
};

export const clearExecutionOverlay = (poolId: string): void => {
  deleteOverlay(poolId);
  publish();
};

export const getExecutionOverlay = (poolId: string): ExecutionOverlay | undefined => {
  const normalizedId = poolId.trim().toLowerCase();
  const cId = cleanId(poolId);
  return executionOverlays.get(normalizedId) ?? executionOverlays.get(cId);
};

const resolveOverlay = (pool: CanonicalPool): ExecutionOverlay | undefined => {
  return (
    executionOverlays.get(pool.canonicalId.toLowerCase()) ??
    executionOverlays.get(cleanId(pool.canonicalId)) ??
    executionOverlays.get(pool.id.toLowerCase()) ??
    executionOverlays.get(cleanId(pool.id)) ??
    (pool.pairAddress ? executionOverlays.get(pool.pairAddress.toLowerCase()) : undefined) ??
    (pool.pairAddress ? executionOverlays.get(cleanId(pool.pairAddress)) : undefined)
  );
};

export const freshestPool = (old: CanonicalPool | undefined, incoming: CanonicalPool): CanonicalPool => {
  let merged = mergePoolObservation(old, incoming);
  const overlay = resolveOverlay(incoming);
  if (overlay) {
    const now = Date.now();
    if (now - overlay.observedAt > OVERLAY_TTL_MS) {
      deleteOverlay(overlay.poolId);
      const oldBlock = toBlockBigInt(old?.blockNumber);
      const incomingBlock = toBlockBigInt(incoming.blockNumber);
      if (old && oldBlock !== null && (incomingBlock === null || incomingBlock < oldBlock)) merged = old;
    } else if (
      toBlockBigInt(incoming.blockNumber) !== null &&
      toBlockBigInt(overlay.blockNumber) !== null &&
      toBlockBigInt(incoming.blockNumber)! >= toBlockBigInt(overlay.blockNumber)!
    ) {
      deleteOverlay(overlay.poolId);
    } else {
      merged = { ...merged, ...overlay.patch };
    }
  }
  return merged;
};

const absorb = (page: PoolPage): PoolPage => {
  page.pools.forEach((pool) => {
    const merged = freshestPool(entities.get(pool.canonicalId), pool);
    entities.delete(pool.canonicalId);
    entities.set(pool.canonicalId, merged);
  });
  while (entities.size > MAX_ENTITY_ENTRIES) entities.delete(entities.keys().next().value!);
  publish();
  return materializePage(page);
};

export const materializePage = (page: PoolPage): PoolPage => {
  const now = Date.now();
  const pools = page.pools.map((pool) => {
    let current = entities.get(pool.canonicalId);
    if (!current) {
      current = pool;
      entities.set(pool.canonicalId, pool);
    }
    const overlay = resolveOverlay(current);
    if (overlay) {
      if (now - overlay.observedAt > OVERLAY_TTL_MS) {
        deleteOverlay(overlay.poolId);
      } else if (
        current.blockNumber !== null &&
        overlay.blockNumber !== null &&
        BigInt(current.blockNumber) >= BigInt(overlay.blockNumber)
      ) {
        deleteOverlay(overlay.poolId);
      } else {
        const patchToApply: Partial<CanonicalPool> = { ...overlay.patch };
        if (typeof patchToApply.priceNow === 'number' && patchToApply.priceNow > 0) {
          if (patchToApply.priceUsd === undefined) {
            const qSym = current.quote?.symbol?.toUpperCase();
            if (qSym === 'USDG' || qSym === 'USDC' || qSym === 'USDT') {
              patchToApply.priceUsd = patchToApply.priceNow;
            } else if (current.priceUsd && current.priceNow && current.priceNow > 0) {
              patchToApply.priceUsd = patchToApply.priceNow * (current.priceUsd / current.priceNow);
            }
          }
          if (patchToApply.priceUsd && current.totalSupply && current.totalSupply > 0) {
            patchToApply.fdv = current.totalSupply * patchToApply.priceUsd;
            if (current.marketCap && current.fdv && current.fdv > 0) {
              const ratio = Math.min(1, current.marketCap / current.fdv);
              patchToApply.marketCap = patchToApply.fdv * ratio;
            }
          }
        }
        current = { ...current, ...patchToApply };
      }
    }
    return current;
  });
  return {
    ...page,
    pools,
    stale: pools.length ? pools.some((pool) => poolObservationStale(pool)) : page.stale,
  };
};

export const subscribeDirectory = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const prunePages = (now: number): void => {
  for (const [key, value] of pages) if (now - value.cachedAt > SNAPSHOT_TTL_MS) pages.delete(key);
  while (pages.size >= MAX_PAGE_ENTRIES) pages.delete(pages.keys().next().value!);
};
const abortError = (): DOMException => new DOMException('The operation was aborted', 'AbortError');
const consume = (entry: PendingPage, signal?: AbortSignal): Promise<PoolPage> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    entry.consumers += 1;
    let done = false;
    const leave = () => {
      if (done) return;
      done = true;
      signal?.removeEventListener('abort', aborted);
      entry.consumers -= 1;
      if (!entry.settled && entry.consumers === 0) entry.controller.abort();
    };
    const aborted = () => {
      leave();
      reject(abortError());
    };
    signal?.addEventListener('abort', aborted, { once: true });
    entry.promise.then(
      (page) => {
        if (!done) {
          leave();
          resolve(page);
        }
      },
      (error: unknown) => {
        if (!done) {
          leave();
          reject(error);
        }
      },
    );
  });

export const getCachedDirectoryPage = (query: DirectoryQuery): PoolPage | null => {
  const url = directoryUrl(query);
  const cached = pages.get(url);
  if (cached && Date.now() - cached.cachedAt <= PAGE_TTL_MS) {
    return materializePage(cached.page);
  }
  return null;
};

export const fetchDirectoryPage = (
  query: DirectoryQuery,
  signal?: AbortSignal,
  force = false,
): Promise<PoolPage> => {
  if (signal?.aborted) return Promise.reject(abortError());
  const url = directoryUrl(query);
  const now = Date.now();
  prunePages(now);
  const cached = pages.get(url);
  if (!force && cached && now - cached.cachedAt <= PAGE_TTL_MS)
    return Promise.resolve(materializePage(cached.page));
  const existing = pending.get(url);
  if (existing && !existing.controller.signal.aborted) return consume(existing, signal);
  const controller = new AbortController();
  const entry: PendingPage = {
    controller,
    consumers: 0,
    settled: false,
    promise: Promise.resolve(null as never),
  };
  entry.promise = get<PoolPage>(url, controller.signal)
    .then((page) => {
      if (controller.signal.aborted) throw abortError();
      pages.delete(url);
      pages.set(url, { page, cachedAt: Date.now() });
      return absorb(page);
    })
    .finally(() => {
      entry.settled = true;
      if (pending.get(url) === entry) pending.delete(url);
    });
  entry.promise.catch(() => {});
  pending.set(url, entry);
  return consume(entry, signal);
};
export const refreshDirectoryEntities = async (ids: string[], signal?: AbortSignal): Promise<void> => {
  if (ids.length === 0 || (typeof document !== 'undefined' && document.hidden)) return;
  await fetchDirectoryPage({ ids: ids.slice(0, 50).join(',') }, signal, true);
};
export const isExpiredSnapshot = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 410;

export interface LeaderboardPayload {
  revision: string;
  generatedAt: number;
  pools: CanonicalPool[];
}

export interface RankDelta {
  previousRank: number | null;
  currentRank: number;
  delta: number;
  isNew: boolean;
}

const leaderboardOrders = {
  top: [] as string[],
  trending: [] as string[],
};

const previousRanks = {
  top: new Map<string, number>(),
  trending: new Map<string, number>(),
};

const revisionListeners = new Set<(rev: { revision: string; generatedAt: number }) => void>();

export const handleLeaderboardUpdate = (
  tab: 'top' | 'trending',
  payload: LeaderboardPayload,
): void => {
  if (!payload || !Array.isArray(payload.pools)) return;

  payload.pools.forEach((pool) => {
    const existing = entities.get(pool.canonicalId) ?? entities.get(cleanId(pool.canonicalId));
    const merged = freshestPool(existing, pool);
    entities.delete(pool.canonicalId);
    entities.set(pool.canonicalId, merged);
  });
  while (entities.size > MAX_ENTITY_ENTRIES) entities.delete(entities.keys().next().value!);

  const oldOrder = leaderboardOrders[tab];
  if (oldOrder.length > 0) {
    const rankMap = new Map<string, number>();
    oldOrder.forEach((id, idx) => rankMap.set(id, idx + 1));
    previousRanks[tab] = rankMap;
  }

  leaderboardOrders[tab] = payload.pools.map((p) => p.canonicalId);

  const targetTab = tab === 'top' ? 'top_performers' : 'trending';
  for (const key of pages.keys()) {
    if (key.includes(`tab=${targetTab}`)) {
      pages.delete(key);
    }
  }

  publish();
  onDirectoryRevision({ revision: payload.revision, generatedAt: payload.generatedAt });
};

export const getRankMovement = (tab: 'top' | 'trending', poolId: string, currentRank: number): RankDelta | null => {
  const prevMap = previousRanks[tab];
  if (!prevMap || prevMap.size === 0) return null;
  const prev = prevMap.get(poolId);
  if (prev === undefined) {
    return { previousRank: null, currentRank, delta: 0, isNew: true };
  }
  return {
    previousRank: prev,
    currentRank,
    delta: prev - currentRank,
    isNew: false,
  };
};

export const onDirectoryRevision = (rev: { revision: string; generatedAt: number }) => {
  revisionListeners.forEach((l) => l(rev));
};

export const subscribeDirectoryRevision = (listener: (rev: { revision: string; generatedAt: number }) => void) => {
  revisionListeners.add(listener);
  return () => revisionListeners.delete(listener);
};

export const __directoryStatsForTests = () => ({
  pages: pages.size,
  pending: pending.size,
  entities: entities.size,
});
export const __resetDirectoryForTests = (): void => {
  for (const entry of pending.values()) entry.controller.abort();
  entities.clear();
  pages.clear();
  pending.clear();
  listeners.clear();
  revisionListeners.clear();
  leaderboardOrders.top = [];
  leaderboardOrders.trending = [];
  previousRanks.top.clear();
  previousRanks.trending.clear();
  executionOverlays.clear();
};

/**
 * Fast in-memory lookup for any entity already known to the directory.
 * Operates in O(1) / small bounded scan for instant 0ms workstation hydration.
 */
export const getEntityPool = (idOrKey?: string | null, chainId?: number): CanonicalPool | null => {
  if (!idOrKey) return null;
  const raw = idOrKey.trim().toLowerCase();
  const clean = cleanId(idOrKey);

  // 1. Direct key lookup (O(1))
  const direct = entities.get(raw);
  if (direct && (chainId === undefined || direct.chainId === chainId)) {
    return direct;
  }
  if (clean && clean !== raw) {
    const cleanDirect = entities.get(clean);
    if (cleanDirect && (chainId === undefined || cleanDirect.chainId === chainId)) {
      return cleanDirect;
    }
  }

  // 2. Linear scan of memory cache for match on id, canonicalId, or pairAddress
  for (const entity of entities.values()) {
    if (chainId !== undefined && entity.chainId !== chainId) continue;
    const idLower = entity.id?.toLowerCase();
    const cleanEntityId = cleanId(entity.id);
    const canonicalLower = entity.canonicalId?.toLowerCase();
    const cleanCanonical = cleanId(entity.canonicalId);
    const pairLower = entity.pairAddress?.toLowerCase();
    const cleanPair = cleanId(entity.pairAddress);

    if (
      (raw !== '' && (idLower === raw || canonicalLower === raw || pairLower === raw)) ||
      (clean !== '' && (cleanEntityId === clean || cleanCanonical === clean || cleanPair === clean))
    ) {
      return entity;
    }
  }
  return null;
};

/**
 * Ingests external canonical pools (e.g. from /api/v2/search or /api/v2/pools)
 * into the live directory cache so they receive live SSE updates, execution overlays,
 * and live price ticking in real time.
 */
export const registerPoolEntities = (pools: CanonicalPool[]): void => {
  if (!pools || pools.length === 0) return;
  for (const pool of pools) {
    if (!pool || !pool.id) continue;
    const existing = entities.get(pool.canonicalId) ?? entities.get(pool.id) ?? (getEntityPool(pool.id) ?? undefined);
    const merged = freshestPool(existing, pool);
    entities.delete(pool.canonicalId);
    entities.set(pool.canonicalId, merged);
    if (pool.id && pool.id !== pool.canonicalId) {
      entities.set(pool.id, merged);
    }
  }
  while (entities.size > MAX_ENTITY_ENTRIES) entities.delete(entities.keys().next().value!);
  publish();
};

