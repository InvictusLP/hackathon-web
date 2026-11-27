import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import {
  __directoryStatsForTests,
  __resetDirectoryForTests,
  applyExecutionOverlay,
  clearExecutionOverlay,
  getExecutionOverlay,
  cleanSearchQuery,
  directoryUrl,
  fetchDirectoryPage,
  freshestPool,
  getEntityPool,
  getCachedDirectoryPage,
  materializePage,
} from './pool-directory';
import type { CanonicalPool, PoolPage } from './types';
import { settledSearchQuery } from './use-pool-directory';

const pool = (priceUsd: number): CanonicalPool => ({
  canonicalId: '1:v3:0xpool',
  chainId: 1,
  protocol: 'uniswap',
  id: '0xpool',
  pairAddress: '0xpool',
  version: 'v3',
  dexId: 'uniswap',
  token: { address: '0xtoken', symbol: 'TOK', name: 'Token', decimals: 18 },
  quote: { address: '0xquote', symbol: 'USDG', name: 'USDG', decimals: 18 },
  token0: '0xtoken',
  token1: '0xquote',
  quoteIsToken0: false,
  quoteIsNative: false,
  fee: 3000,
  effectiveFee: 3000,
  feePct: 0.3,
  tickSpacing: 60,
  binStepPct: 0.6018,
  tick: 0,
  hooks: '',
  labels: [],
  warnings: [],
  verification: 'contract-identified',
  createdAt: null,
  tokenCreatedAt: null,
  priceNow: priceUsd,
  priceUsd,
  tvlUsd: null,
  volume24hUsd: null,
  marketCap: null,
  fdv: null,
  fees24hUsd: null,
  feeAprPct: null,
  volToTvlRatio: null,
  updatedAt: 1,
  stateUpdatedAt: 1,
  tvlUpdatedAt: null,
  indexedAt: null,
  volumeUpdatedAt: null,
  marketCapUpdatedAt: null,
  fdvUpdatedAt: null,
  blockNumber: null,
  provenance: {
    price: 'onchain',
    quoteUsd: 'stable-peg',
    tvl: 'unavailable',
    volume: 'unavailable',
    marketCap: 'unavailable',
    fees: 'estimated-volume-times-current-fee',
  },
});

test('directory URL includes only explicit server query values', () => {
  assert.equal(
    directoryUrl({
      q: ' eth ',
      limit: 10,
      minTvl: '',
      sort: 'tvl',
      direction: 'desc',
    }),
    '/api/pools/directory?q=+eth+&limit=10&sort=tvl&direction=desc',
  );
});

test('search requests require an open dialog and exact debounced query identity', () => {
  assert.equal(settledSearchQuery(true, 'AI', 'A'), null);
  assert.equal(settledSearchQuery(false, 'AI', 'AI'), null);
  assert.equal(settledSearchQuery(true, '', 'AI'), null);
  assert.equal(settledSearchQuery(true, ' AI ', 'AI'), 'AI');
});

test('cleanSearchQuery normalizes URLs, canonical IDs, raw hex, and pairs cleanly', () => {
  // Uniswap v4 explore URL
  assert.equal(
    cleanSearchQuery('https://app.uniswap.org/explore/pools/robinhood/0x4be9657ec9002e528f4f17a5c43edc525a07f888f7b180c2afbf75e096c4f38a'),
    '0x4be9657ec9002e528f4f17a5c43edc525a07f888f7b180c2afbf75e096c4f38a',
  );

  // Uniswap v3 explore URL
  assert.equal(
    cleanSearchQuery('https://app.uniswap.org/explore/pools/robinhood/0x10cc6bd38112cac182db90b6a71d8bb5939526ba'),
    '0x10cc6bd38112cac182db90b6a71d8bb5939526ba',
  );

  // Block explorer URL
  assert.equal(
    cleanSearchQuery('https://rh-scan.com/address/0x10cc6bd38112cac182db90b6a71d8bb5939526ba'),
    '0x10cc6bd38112cac182db90b6a71d8bb5939526ba',
  );

  // Canonical full ID
  assert.equal(
    cleanSearchQuery('4663:uniswap_v4:0x4be9657ec9002e528f4f17a5c43edc525a07f888f7b180c2afbf75e096c4f38a'),
    '0x4be9657ec9002e528f4f17a5c43edc525a07f888f7b180c2afbf75e096c4f38a',
  );

  // Protocol prefix ID
  assert.equal(
    cleanSearchQuery('uniswap_v4:0x4be9657ec9002e528f4f17a5c43edc525a07f888f7b180c2afbf75e096c4f38a'),
    '0x4be9657ec9002e528f4f17a5c43edc525a07f888f7b180c2afbf75e096c4f38a',
  );

  // Raw 64 hex without 0x
  assert.equal(
    cleanSearchQuery('4be9657ec9002e528f4f17a5c43edc525a07f888f7b180c2afbf75e096c4f38a'),
    '0x4be9657ec9002e528f4f17a5c43edc525a07f888f7b180c2afbf75e096c4f38a',
  );

  // Raw 40 hex without 0x
  assert.equal(
    cleanSearchQuery('10cc6bd38112cac182db90b6a71d8bb5939526ba'),
    '0x10cc6bd38112cac182db90b6a71d8bb5939526ba',
  );

  // Pair delimiters
  assert.equal(cleanSearchQuery('ETH / USDC'), 'ETH/USDC');
  assert.equal(cleanSearchQuery('ETH-USDC'), 'ETH-USDC');
  assert.equal(cleanSearchQuery(''), '');
});

test('deduplicates a page request and refreshes existing membership through entity cache', async () => {
  __resetDirectoryForTests();
  let calls = 0;
  const first: PoolPage = {
    pools: [pool(1)],
    nextCursor: 'next',
    snapshot: 's1',
    updatedAt: 1,
    stale: false,
  };
  const refreshed: PoolPage = {
    pools: [pool(2)],
    nextCursor: null,
    snapshot: 's2',
    updatedAt: 2,
    stale: false,
  };
  globalThis.fetch = (async () => {
    calls += 1;
    await Promise.resolve();
    return new Response(JSON.stringify(calls === 1 ? first : refreshed), {
      status: 200,
    });
  }) as typeof fetch;
  const [a, b] = await Promise.all([fetchDirectoryPage({ limit: 10 }), fetchDirectoryPage({ limit: 10 })]);
  assert.equal(calls, 1);
  assert.equal(a.snapshot, b.snapshot);
  await fetchDirectoryPage({ ids: '1:v3:0xpool' }, undefined, true);
  assert.deepEqual(
    materializePage(first).pools.map((item) => item.priceUsd),
    [2],
  );
  assert.deepEqual(
    materializePage(first).pools.map((item) => item.canonicalId),
    ['1:v3:0xpool'],
  );
});

test('an older reordered page cannot regress independently timestamped entity values', () => {
  const newer = {
    ...pool(2),
    updatedAt: 20,
    stateUpdatedAt: 20,
    tvlUsd: 200,
    tvlUpdatedAt: 20,
    volume24hUsd: 300,
    indexedAt: 20,
  };
  const older = {
    ...pool(1),
    updatedAt: 10,
    stateUpdatedAt: 10,
    tvlUsd: 100,
    tvlUpdatedAt: 10,
    volume24hUsd: 150,
    indexedAt: 10,
  };
  const merged = freshestPool(newer, older);
  assert.equal(merged.priceUsd, 2);
  assert.equal(merged.tvlUsd, 200);
  assert.equal(merged.volume24hUsd, 300);
  assert.equal(merged.updatedAt, 20);
  const metadataOnly = freshestPool(newer, {
    ...older,
    updatedAt: 30,
    token: { ...older.token, name: 'Renamed' },
  });
  assert.equal(metadataOnly.token.name, 'Renamed');
  assert.equal(metadataOnly.priceUsd, 2);
  assert.equal(metadataOnly.tvlUsd, 200);
  assert.equal(metadataOnly.volume24hUsd, 300);
});

test('aborting one overlapping consumer does not cancel the shared request', async () => {
  __resetDirectoryForTests();
  let resolveResponse!: (response: Response) => void;
  let calls = 0;
  globalThis.fetch = (() => {
    calls += 1;
    return new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
  }) as typeof fetch;
  const first = new AbortController();
  const second = new AbortController();
  const abandoned = fetchDirectoryPage({ q: 'tok' }, first.signal);
  const active = fetchDirectoryPage({ q: 'tok' }, second.signal);
  first.abort();
  await assert.rejects(abandoned, { name: 'AbortError' });
  resolveResponse(
    new Response(
      JSON.stringify({
        pools: [pool(3)],
        nextCursor: null,
        snapshot: 's',
        updatedAt: 3,
        stale: false,
      }),
    ),
  );
  assert.equal((await active).pools[0]?.priceUsd, 3);
  assert.equal(calls, 1);
});

test('page cache remains bounded', async () => {
  __resetDirectoryForTests();
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        pools: [],
        nextCursor: null,
        snapshot: 's',
        updatedAt: 1,
        stale: false,
      }),
    )) as typeof fetch;
  for (let index = 0; index < 110; index += 1) await fetchDirectoryPage({ q: `pool-${index}` });
  assert.equal(__directoryStatsForTests().pages, 100);
});

test('execution overlay protects post-Zap state from stale shared observations', () => {
  __resetDirectoryForTests();
  const poolId = '0xpool';
  const sharedState = {
    ...pool(100),
    blockNumber: '1000',
    stateUpdatedAt: 1000,
    tvlUsd: 50000,
  };

  // User performs a Zap execution at block 1005: price moves to 120, tvl moves to 55000
  applyExecutionOverlay(poolId, {
    priceUsd: 120,
    tvlUsd: 55000,
    blockNumber: '1005',
    observedAt: Date.now(),
  });

  // Incoming stale shared observation at block 1002 (older than 1005)
  const staleIncoming = {
    ...pool(102),
    blockNumber: '1002',
    stateUpdatedAt: 1002,
    tvlUsd: 51000,
  };

  const resolved = freshestPool(sharedState, staleIncoming);
  // Execution overlay protected the values
  assert.equal(resolved.priceUsd, 120);
  assert.equal(resolved.tvlUsd, 55000);

  // Incoming newer shared observation at block 1006 (shared state caught up!)
  const caughtUpIncoming = {
    ...pool(125),
    blockNumber: '1006',
    stateUpdatedAt: 1006,
    tvlUsd: 56000,
  };

  const caughtUp = freshestPool(resolved, caughtUpIncoming);
  // Shared state takes over since blockNumber >= overlay blockNumber
  assert.equal(caughtUp.priceUsd, 125);
  assert.equal(caughtUp.tvlUsd, 56000);
  // Overlay is cleared
  assert.equal(getExecutionOverlay(poolId), undefined);

  // Explicit clear test
  applyExecutionOverlay(poolId, { priceUsd: 130 });
  assert.notEqual(getExecutionOverlay(poolId), undefined);
  clearExecutionOverlay(poolId);
  assert.equal(getExecutionOverlay(poolId), undefined);
});

test('expired execution overlay keeps its high-water state against older snapshots', () => {
  vi.useFakeTimers({ now: 100_000 });
  try {
    __resetDirectoryForTests();
    const poolId = '0xpool-expiry';
    const initial = { ...pool(100), id: poolId, canonicalId: `4663:v3:${poolId}`, blockNumber: '1000' };
    materializePage({ pools: [initial], nextCursor: null, snapshot: 's', updatedAt: Date.now(), stale: false });
    applyExecutionOverlay(poolId, { priceUsd: 120, blockNumber: '1005', observedAt: Date.now() });
    vi.advanceTimersByTime(60_001);
    const resolved = freshestPool(
      getEntityPool(poolId)!,
      { ...initial, priceUsd: 102, blockNumber: '1002', stateUpdatedAt: 100_001 },
    );
    assert.equal(resolved.priceUsd, 120);
    assert.equal(resolved.blockNumber, '1005');
  } finally {
    vi.useRealTimers();
  }
});

test('applyExecutionOverlay updates priceNow, priceUsd, fdv, and scales marketCap by circulating ratio', () => {
  __resetDirectoryForTests();
  const poolId = '0xpool-live';
  const initial = {
    ...pool(0.01),
    id: poolId,
    canonicalId: `1:v3:${poolId}`,
    totalSupply: 1_000_000_000,
    priceNow: 0.01,
    priceUsd: 0.01,
    fdv: 10_000_000,
    marketCap: 8_000_000, // 80% circulating ratio
  };

  // Seed into directory entities
  const page: PoolPage = {
    pools: [initial],
    nextCursor: null,
    snapshot: 'test',
    updatedAt: Date.now(),
    stale: false,
  };
  materializePage(page);

  // Live swap event arrives with spot price = 0.02
  applyExecutionOverlay(poolId, {
    priceNow: 0.02,
    tick: 100,
  });

  const materialized = materializePage(page);
  const updated = materialized.pools[0]!;

  // Spot price and USD price updated
  assert.equal(updated.priceNow, 0.02);
  assert.equal(updated.priceUsd, 0.02);
  // FDV updated = 1B * 0.02 = 20M
  assert.equal(updated.fdv, 20_000_000);
  // Market cap scaled by 80% circulating ratio = 16M
  assert.equal(updated.marketCap, 16_000_000);
});

test('applyExecutionOverlay accumulates volume, increments txns, and calculates baseline price deltas', () => {
  __resetDirectoryForTests();
  const hexAddress = '0x40a4000000000000000000000000000000000001';
  const canonicalId = `4663:uniswap_v4:${hexAddress}`;
  const initial = {
    ...pool(100),
    id: `robinhood:${hexAddress}`,
    canonicalId,
    pairAddress: hexAddress,
    priceNow: 100,
    priceUsd: 100,
    priceChange24h: 10, // baseline = 100 / 1.1 = 90.909...
    priceChange5m: 5,   // baseline = 100 / 1.05 = 95.238...
    volume24hUsd: 50_000,
    volume5mUsd: 2_000,
    txns: {
      m5: { buys: 2, sells: 1 },
      h1: { buys: 10, sells: 5 },
      h6: { buys: 20, sells: 10 },
      h24: { buys: 50, sells: 25 },
    },
    txns24h: { buys: 50, sells: 25 },
  };

  const page: PoolPage = {
    pools: [initial],
    nextCursor: null,
    snapshot: 'test',
    updatedAt: Date.now(),
    stale: false,
  };
  materializePage(page);

  // Apply overlay using raw hex address (clean ID matching)
  const swapTime = Date.now();
  applyExecutionOverlay(hexAddress, {
    priceNow: 110,
    priceUsd: 110,
    swapVolumeUsd: 5_000,
    lastSwapDirection: 'up',
    lastSwapAt: swapTime,
  });

  const materialized = materializePage(page);
  const updated = materialized.pools[0]!;

  // Volume accumulated
  assert.equal(updated.volume24hUsd, 55_000);
  assert.equal(updated.volume5mUsd, 7_000);

  // Txns incremented (buy: up)
  assert.equal(updated.txns?.m5?.buys, 3);
  assert.equal(updated.txns?.m5?.sells, 1);
  assert.equal(updated.txns?.h24?.buys, 51);
  assert.equal(updated.txns?.h24?.sells, 25);
  assert.equal(updated.txns24h?.buys, 51);
  assert.equal(updated.txns24h?.sells, 25);

  // Direction & timestamp set
  assert.equal(updated.lastSwapDirection, 'up');
  assert.equal(updated.lastSwapAt, swapTime);

  // Price deltas based on baseline
  // baseline 24h was ~90.909 -> new 24h change = (110 - 90.909) / 90.909 = 21%
  assert.ok(Math.abs(updated.priceChange24h! - 21) < 0.1);

  // Now a sell swap arrives
  applyExecutionOverlay(canonicalId, {
    priceNow: 105,
    priceUsd: 105,
    swapVolumeUsd: 3_000,
    lastSwapDirection: 'down',
    lastSwapAt: swapTime + 1000,
  });

  const materialized2 = materializePage(page);
  const updated2 = materialized2.pools[0]!;

  assert.equal(updated2.volume24hUsd, 58_000);
  assert.equal(updated2.volume5mUsd, 10_000);
  assert.equal(updated2.txns?.m5?.sells, 2);
  assert.equal(updated2.txns?.h24?.sells, 26);
  assert.equal(updated2.txns24h?.sells, 26);
  assert.equal(updated2.lastSwapDirection, 'down');
});

test('getCachedDirectoryPage returns null when uncached and materialized page when cached', () => {
  __resetDirectoryForTests();
  const query = { tab: 'all' as const, limit: 25 };
  assert.equal(getCachedDirectoryPage(query), null);
});
