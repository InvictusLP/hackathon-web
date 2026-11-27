import type { CanonicalPool } from '../shared/pool-directory.js';
import { resolveChainSlug } from './protocols';
import { getEntityPool } from './pool-directory';
import { resampleCandles, type Candle } from './candles';
import { post } from './api';

export type { CanonicalPool, Candle };
export type CachedPool = CanonicalPool;

// Fast in-memory tier for 0ms transitions between Discover, Search, and Workstation
const inMemoryCache = new Map<string, CanonicalPool>();

/**
 * Normalizes pool identifier keys (lowercased without trailing spaces)
 */
function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

/**
 * Cache a canonical pool for instant workstation hydration.
 * Saves both to in-memory store and sessionStorage (survives refreshes).
 */
export function cachePoolForWorkstation(pool: CanonicalPool): void {
  if (!pool || !pool.id) return;

  const rawKeys = [
    pool.id,
    pool.pairAddress,
    pool.canonicalId,
    (pool as any).poolId,
    // NOTE: Do NOT index by pool.token?.address alone — multiple pools share the same base token,
    // and indexing by token address causes getCachedPoolForWorkstation to return the wrong pool
    // when navigating between pools for the same token (e.g., TOKEN_A/USDG vs TOKEN_A/WETH).
  ].filter(Boolean) as string[];

  const keys = new Set<string>();
  for (const k of rawKeys) {
    const norm = normalizeKey(k);
    keys.add(norm);
    if (norm.includes(':')) {
      const suffix = norm.split(':').pop();
      if (suffix) {
        keys.add(suffix);
        if (pool.chainId) {
          keys.add(`${pool.chainId}:${suffix}`);
        }
      }
    }
  }

  for (const k of keys) {
    inMemoryCache.set(k, pool);
    if (pool.chainId) {
      inMemoryCache.set(`${pool.chainId}:${k}`, pool);
    }
  }

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const serialized = JSON.stringify(pool);
      for (const k of keys) {
        window.sessionStorage.setItem(`invictus:pool:${k}`, serialized);
        if (pool.chainId) {
          window.sessionStorage.setItem(`invictus:pool:${pool.chainId}:${k}`, serialized);
        }
      }
    } catch {
      // Storage quota or privacy sandbox limit
    }
  }
}

/**
 * Retrieve a cached pool by its pool contract address, pool ID, canonical ID, or pair address.
 * Accepts multiple candidate keys and checks inMemoryCache, getEntityPool, and sessionStorage.
 */
export function getCachedPoolForWorkstation(
  ...rawArgs: (string | number | null | undefined)[]
): CanonicalPool | null {
  let chainId: number | undefined;
  const candidates: string[] = [];
  for (const arg of rawArgs) {
    if (arg === null || arg === undefined) continue;
    if (typeof arg === 'number') {
      if (arg > 0) chainId = arg;
      continue;
    }
    const clean = normalizeKey(arg);
    if (!clean || clean === 'default') continue;
    if (clean === 'robinhood' || clean === 'arc' || clean === 'bnb' || clean === 'bsc') {
      chainId = clean === 'arc' ? 5042 : clean === 'bnb' || clean === 'bsc' ? 56 : 4663;
      continue;
    }
    candidates.push(clean);
    if (clean.includes(':')) {
      const parts = clean.split(':');
      const firstNum = Number(parts[0]);
      if (Number.isFinite(firstNum) && firstNum > 0 && !chainId) {
        chainId = firstNum;
      }
      const suffix = parts.pop();
      if (suffix) candidates.push(suffix);
    }
  }
  if (candidates.length === 0) return null;

  // 1. Scoped chain check
  if (chainId) {
    for (const c of candidates) {
      const scopedHit = inMemoryCache.get(`${chainId}:${c}`);
      if (scopedHit && scopedHit.chainId === chainId) return scopedHit;
    }
  }

  // 2. Direct hit in inMemoryCache
  for (const c of candidates) {
    const memHit = inMemoryCache.get(c);
    if (memHit && (chainId === undefined || memHit.chainId === chainId)) {
      return memHit;
    }
  }

  // 3. getEntityPool
  for (const c of candidates) {
    const dirHit = getEntityPool(c, chainId);
    if (dirHit && (chainId === undefined || dirHit.chainId === chainId)) {
      return dirHit;
    }
  }

  // 4. sessionStorage
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      for (const c of candidates) {
        const sessionKeys = chainId
          ? [`invictus:pool:${chainId}:${c}`, `invictus:pool:${c}`]
          : [`invictus:pool:${c}`, `invictus:pool:robinhood:${c}`, `invictus:pool:arc:${c}`, `invictus:pool:bnb:${c}`];
        for (const sk of sessionKeys) {
          const raw = window.sessionStorage.getItem(sk);
          if (raw) {
            const pool = JSON.parse(raw) as CanonicalPool;
            if (chainId === undefined || pool.chainId === chainId) {
              return pool;
            }
          }
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Formats a clean workstation URL pattern: /pool/<chain>/<poolId>?pair=<pairAddress>
 * Always prioritizes the exact poolId as the path segment, and appends pair parameter when distinct.
 * Example V4: /pool/robinhood/0x09f9f97c04966c8ac9e99649599162e521aa1acaabfbd1cdf8910622534db11e
 * Example V3: /pool/robinhood/0x1a67e3a963912086c4ec5e850ab1b44edd87dfc8
 */
export function poolWorkstationHref(pool: {
  id: string;
  chainId?: number | string | null;
  pairAddress?: string | null;
  tokenCreatedAt?: number | null;
  poolCreatedAt?: number | null;
  createdAt?: number | null;
}): string {
  const chainSlug = resolveChainSlug(pool.chainId ?? 'robinhood');
  const rawId = pool.id || (pool as any).poolId || pool.pairAddress || '';
  const poolContract = rawId.includes(':') ? rawId.split(':').pop()! : rawId;
  const pair = pool.pairAddress
    ? (pool.pairAddress.includes(':') ? pool.pairAddress.split(':').pop()! : pool.pairAddress)
    : '';

  const basePath = `/pool/${chainSlug}/${poolContract}`;
  if (pair && pair.toLowerCase() !== poolContract.toLowerCase()) {
    return `${basePath}?pair=${pair}`;
  }
  return basePath;
}

export interface WorkstationPathInfo {
  chain: string | null;
  poolId: string | null;
  token: string | null;
}

/**
 * Parses workstation URLs: /pool/<chain>/<pool>, /pool/<pool>, or /pools/<token>
 */
export function parseWorkstationPath(pathname?: string | null): WorkstationPathInfo {
  if (!pathname) return { chain: null, poolId: null, token: null };

  if (pathname.startsWith('/pool/')) {
    const parts = pathname.split('/').filter(Boolean); // ['pool', 'robinhood', '0x...']
    if (parts.length >= 3 && parts[1] && parts[2]) {
      return { chain: decodeURIComponent(parts[1]).trim(), poolId: decodeURIComponent(parts[2]).trim(), token: null };
    } else if (parts.length === 2 && parts[1]) {
      return { chain: null, poolId: decodeURIComponent(parts[1]).trim(), token: null };
    }
  } else if (pathname.startsWith('/pools/')) {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[1]) {
      return { chain: null, poolId: null, token: decodeURIComponent(parts[1]).trim() };
    }
  }

  return { chain: null, poolId: null, token: null };
}

export interface History {
  candles: Candle[];
  mcapPerUnit?: number | null;
  tokenCreatedAt?: number | null;
  poolCreatedAt?: number | null;
  earliestTime?: number | null;
  timeframes?: Record<string, Candle[]>;
  source?: string;
  currency?: string;
  interval?: string | number;
  quotePriceUsd?: number | null;
  ethUsd?: number | null;
  authoritativePoolId?: string | null;
}

interface CacheEntry<T> {
  data: T;
  at: number;
}

const STANDARD_TIMEFRAME_SECONDS: Record<string, number> = {
  '1s': 1,
  '15s': 15,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

export function parseIntervalSeconds(interval: string): number {
  if (!interval) return 300;
  if (interval in STANDARD_TIMEFRAME_SECONDS) {
    return STANDARD_TIMEFRAME_SECONDS[interval]!;
  }
  const match = interval.match(/^(\d+)([smhd])$/);
  if (!match) return 300;
  const val = parseInt(match[1]!, 10);
  const unit = match[2];
  if (unit === 's') return val;
  if (unit === 'm') return val * 60;
  if (unit === 'h') return val * 3600;
  if (unit === 'd') return val * 86400;
  return val * 60;
}

// Module-level in-memory SWR cache for liquidity depth curves (bins)
const binsCache = new Map<string, CacheEntry<unknown>>();

// Module-level in-memory SWR cache for candlestick chart histories: key = `${poolId}:${interval}`
const historyCache = new Map<string, CacheEntry<unknown>>();

// Module-level multi-timeframe in-memory cache per pool: poolKey -> (interval -> CacheEntry)
const poolIntervalsCache = new Map<string, Map<string, CacheEntry<unknown>>>();

/**
 * Cache pool bins (liquidity curve) in memory.
 */
export function cachePoolBins(poolId: string, data: unknown): void {
  if (!poolId) return;
  const key = normalizeKey(poolId);
  binsCache.set(key, { data, at: Date.now() });
  if (key.includes(':')) {
    const suffix = key.split(':').pop();
    if (suffix) binsCache.set(suffix, { data, at: Date.now() });
  }
}

/**
 * Retrieve cached pool bins with freshness status.
 * @param freshTtlMs Fresh window in ms (default 15s).
 */
export function getCachedPoolBins<T = unknown>(
  poolId?: string | null,
  freshTtlMs = 15_000,
): { data: T; isFresh: boolean } | null {
  if (!poolId) return null;
  const key = normalizeKey(poolId);
  const entry = binsCache.get(key) || (key.includes(':') ? binsCache.get(key.split(':').pop()!) : null);
  if (!entry) return null;
  const age = Date.now() - entry.at;
  if (age > 120_000) {
    binsCache.delete(key);
    return null;
  }
  return { data: entry.data as T, isFresh: age <= freshTtlMs };
}

/**
 * Cache pool candlestick chart history in memory across all timeframes.
 * Whenever history is retrieved or resampled, it is indexed under all candidate keys.
 */
export function cachePoolHistory(
  poolIdOrIds: string | (string | null | undefined)[],
  interval: string,
  data: unknown,
): void {
  const ids = Array.isArray(poolIdOrIds) ? poolIdOrIds : [poolIdOrIds];
  const now = Date.now();
  const entry: CacheEntry<unknown> = { data, at: now };

  const allKeys = new Set<string>();
  for (const raw of ids) {
    if (!raw || typeof raw !== 'string') continue;
    const clean = normalizeKey(raw);
    if (!clean || clean === 'default') continue;
    allKeys.add(clean);
    if (clean.includes(':')) {
      const suffix = clean.split(':').pop();
      if (suffix) allKeys.add(normalizeKey(suffix));
    }
  }

  const hist = data as (History & { timeframes?: Record<string, Candle[]> });
  if (hist && typeof hist === 'object' && hist.authoritativePoolId) {
    const authClean = normalizeKey(hist.authoritativePoolId);
    if (authClean && authClean !== 'default') {
      allKeys.add(authClean);
      if (authClean.includes(':')) {
        const suffix = authClean.split(':').pop();
        if (suffix) allKeys.add(normalizeKey(suffix));
      }
    }
  }

  for (const k of allKeys) {
    historyCache.set(`${k}:${interval}`, entry);
    let tfMap = poolIntervalsCache.get(k);
    if (!tfMap) {
      tfMap = new Map();
      poolIntervalsCache.set(k, tfMap);
    }
    tfMap.set(interval, entry);
  }

  // Multi-timeframe hydration:
  // 1. If incoming data has `timeframes` bundle, cache all timeframes immediately
  if (hist && typeof hist === 'object') {
    if (hist.timeframes && typeof hist.timeframes === 'object') {
      for (const [tf, tfCandles] of Object.entries(hist.timeframes)) {
        if (tf !== interval && Array.isArray(tfCandles) && tfCandles.length > 0) {
          const subHistory: History = {
            candles: tfCandles,
            mcapPerUnit: hist.mcapPerUnit,
            tokenCreatedAt: hist.tokenCreatedAt,
            poolCreatedAt: hist.poolCreatedAt,
            earliestTime: tfCandles[0]?.time ?? null,
            source: hist.source,
            currency: hist.currency,
            interval: tf,
            quotePriceUsd: hist.quotePriceUsd,
            ethUsd: hist.ethUsd,
            authoritativePoolId: hist.authoritativePoolId,
          };
          const subEntry: CacheEntry<unknown> = { data: subHistory, at: now };
          for (const k of allKeys) {
            historyCache.set(`${k}:${tf}`, subEntry);
            let tfMap = poolIntervalsCache.get(k);
            if (!tfMap) {
              tfMap = new Map();
              poolIntervalsCache.set(k, tfMap);
            }
            tfMap.set(tf, subEntry);
          }
        }
      }
    }

    // 2. Cascade derivation: if 1m is received, auto-resample 5m, 15m, 1h
    if (Array.isArray(hist.candles) && hist.candles.length > 0) {
      if (interval === '1m') {
        const higherTfs: [string, number][] = [
          ['5m', 300],
          ['15m', 900],
          ['1h', 3600],
        ];
        for (const [tf, sec] of higherTfs) {
          const existing = getCachedPoolHistory(Array.from(allKeys), tf, 60_000);
          if (!existing || !existing.data.candles.length) {
            const resampled = resampleCandles(hist.candles, sec, 60);
            if (resampled.length > 0) {
              const resHistory: History = {
                ...hist,
                candles: resampled,
                earliestTime: resampled[0]?.time ?? null,
                interval: tf,
                source: hist.source ? `${hist.source}:resampled` : 'resampled',
              };
              const resEntry: CacheEntry<unknown> = { data: resHistory, at: now };
              for (const k of allKeys) {
                historyCache.set(`${k}:${tf}`, resEntry);
                let tfMap = poolIntervalsCache.get(k);
                if (!tfMap) {
                  tfMap = new Map();
                  poolIntervalsCache.set(k, tfMap);
                }
                tfMap.set(tf, resEntry);
              }
            }
          }
        }
      } else if (interval === '1s') {
        const existing15s = getCachedPoolHistory(Array.from(allKeys), '15s', 60_000);
        if (!existing15s || !existing15s.data.candles.length) {
          const resampled15s = resampleCandles(hist.candles, 15, 1);
          if (resampled15s.length > 0) {
            const resHistory: History = {
              ...hist,
              candles: resampled15s,
              earliestTime: resampled15s[0]?.time ?? null,
              interval: '15s',
              source: hist.source ? `${hist.source}:resampled` : 'resampled',
            };
            const resEntry: CacheEntry<unknown> = { data: resHistory, at: now };
            for (const k of allKeys) {
              historyCache.set(`${k}:15s`, resEntry);
              let tfMap = poolIntervalsCache.get(k);
              if (!tfMap) {
                tfMap = new Map();
                poolIntervalsCache.set(k, tfMap);
              }
              tfMap.set('15s', resEntry);
            }
          }
        }
      }
    }
  }
}

/**
 * Retrieve cached candlestick history with freshness status.
 * Supports multiple candidate keys (e.g. poolId, pairAddress, canonicalId).
 * @param freshTtlMs Fresh window in ms (default 15s).
 */
export function getCachedPoolHistory<T = History>(
  poolIdOrKeys?: string | (string | null | undefined)[] | null,
  interval = '1m',
  freshTtlMs = 15_000,
): { data: T; isFresh: boolean } | null {
  if (!poolIdOrKeys) return null;
  const rawList = Array.isArray(poolIdOrKeys) ? poolIdOrKeys : [poolIdOrKeys];
  const candidates: string[] = [];
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'string') continue;
    const clean = normalizeKey(raw);
    if (!clean || clean === 'default') continue;
    candidates.push(clean);
    if (clean.includes(':')) {
      const suffix = clean.split(':').pop();
      if (suffix) candidates.push(normalizeKey(suffix));
    }
  }
  if (candidates.length === 0) return null;

  const now = Date.now();
  for (const c of candidates) {
    const key = `${c}:${interval}`;
    const entry =
      historyCache.get(key) ||
      poolIntervalsCache.get(c)?.get(interval);
    if (entry) {
      const age = now - entry.at;
      if (age > 300_000) {
        historyCache.delete(key);
        poolIntervalsCache.get(c)?.delete(interval);
        continue;
      }
      return { data: entry.data as T, isFresh: age <= freshTtlMs };
    }
  }
  return null;
}

/**
 * Retrieve any cached candlestick history across all intervals for a pool.
 * Checks whether ANY timeframe (e.g. 5m, 1m, 15m, 1h) exists in memory across candidates.
 * Prefers lower timeframes (e.g. 5m, 1m) which are optimal for client-side resampling.
 */
export function getAnyCachedHistory<T = History>(
  poolIdOrKeys?: string | (string | null | undefined)[] | null,
  targetInterval?: string,
): { interval: string; data: T } | null {
  if (!poolIdOrKeys) return null;
  const rawList = Array.isArray(poolIdOrKeys) ? poolIdOrKeys : [poolIdOrKeys];
  const candidates: string[] = [];
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'string') continue;
    const clean = normalizeKey(raw);
    if (!clean || clean === 'default') continue;
    candidates.push(clean);
    if (clean.includes(':')) {
      const suffix = clean.split(':').pop();
      if (suffix) candidates.push(normalizeKey(suffix));
    }
  }
  if (candidates.length === 0) return null;

  const now = Date.now();
  const maxAgeMs = 300_000;
  const targetSec = targetInterval ? parseIntervalSeconds(targetInterval) : null;
  const preferredTimeframes = ['5m', '1m', '15s', '1s', '15m', '1h', '4h', '1d'];

  for (const c of candidates) {
    const tfMap = poolIntervalsCache.get(c);
    if (tfMap && tfMap.size > 0) {
      // 1. If targetInterval is provided, look for candidate where sourceSec <= targetSec
      if (targetSec !== null) {
        for (const tf of preferredTimeframes) {
          const entry = tfMap.get(tf);
          if (entry && (now - entry.at) <= maxAgeMs) {
            const sourceSec = parseIntervalSeconds(tf);
            if (sourceSec <= targetSec) {
              return { interval: tf, data: entry.data as T };
            }
          }
        }
        for (const [tf, entry] of tfMap.entries()) {
          if (entry && (now - entry.at) <= maxAgeMs) {
            const sourceSec = parseIntervalSeconds(tf);
            if (sourceSec <= targetSec) {
              return { interval: tf, data: entry.data as T };
            }
          }
        }
      } else {
        // 2. Otherwise return preferred timeframe
        for (const tf of preferredTimeframes) {
          const entry = tfMap.get(tf);
          if (entry && (now - entry.at) <= maxAgeMs) {
            return { interval: tf, data: entry.data as T };
          }
        }

        // 3. Fallback to any timeframe available in map
        for (const [tf, entry] of tfMap.entries()) {
          if (entry && (now - entry.at) <= maxAgeMs) {
            return { interval: tf, data: entry.data as T };
          }
        }
      }
    }

    // Fallback to checking historyCache directly
    for (const tf of preferredTimeframes) {
      const key = `${c}:${tf}`;
      const entry = historyCache.get(key);
      if (entry && (now - entry.at) <= maxAgeMs) {
        if (targetSec !== null) {
          const sourceSec = parseIntervalSeconds(tf);
          if (sourceSec <= targetSec) {
            return { interval: tf, data: entry.data as T };
          }
        } else {
          return { interval: tf, data: entry.data as T };
        }
      }
    }
  }

  return null;
}

const inFlightPrewarms = new Set<string>();

/**
 * Pre-warms candlestick history in the background when a user hovers over a pool
 * in Discover, Search, or Leaderboard. By the time they click, history is already in memory!
 */
let lastPrewarmTs = 0;

export function prewarmPoolHistory(
  pool: {
    id: string;
    pairAddress?: string;
    version?: 'v3' | 'v4';
    token?: { address?: string };
  },
  interval = '1m',
): void {
  if (typeof window === 'undefined' || !pool || !pool.id) return;
  const now = Date.now();
  if (now - lastPrewarmTs < 120) return;

  const poolId = pool.id;
  const pairAddress = pool.pairAddress || (pool as any).poolAddress || undefined;
  const cleanId = (poolId.includes(':') ? poolId.split(':').pop()! : poolId).toLowerCase();
  const version = pool.version || (cleanId.length === 42 ? 'v3' : 'v4');
  const token = pool.token?.address || (pool as any).tokenAddress || (pool as any).baseTokenAddress || undefined;

  const candidateKeys = [poolId, pairAddress, token].filter(Boolean) as string[];
  const key = `${cleanId}:${interval}`;

  // If already cached and fresh, no prewarm needed
  const cached = getCachedPoolHistory(candidateKeys, interval, 30_000);
  if (cached?.isFresh) return;

  if (inFlightPrewarms.has(key)) return;
  lastPrewarmTs = now;
  inFlightPrewarms.add(key);

  post<{ candles?: Candle[] }>('/api/pools/history', {
    poolId,
    pairAddress,
    token,
    version,
    interval,
  })
    .then((data) => {
      if (data && data.candles && data.candles.length > 0) {
        cachePoolHistory(candidateKeys, interval, data as any);
      }
    })
    .catch(() => {
      // Ignore background prewarm failure
    })
    .finally(() => {
      inFlightPrewarms.delete(key);
    });
}


