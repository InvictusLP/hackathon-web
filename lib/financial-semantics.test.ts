import assert from 'node:assert/strict';
import { test, describe } from 'vitest';
import { toDiscoveredPool } from './pool-model';
import type { CanonicalPool, PoolPage } from './types';
import {
  __resetDirectoryForTests,
  applyExecutionOverlay,
  materializePage,
} from './pool-directory';
import { fetchRobinhoodTokenMeta } from './tokens';

const mockPool = (overrides?: Partial<CanonicalPool>): CanonicalPool => ({
  canonicalId: '4663:uniswap_v4:0x0339f5459fc690ac85f1782e15782a151b4a9e1b',
  chainId: 4663,
  protocol: 'uniswap_v4',
  id: '0x0339f5459fc690ac85f1782e15782a151b4a9e1b',
  pairAddress: '0x0339f5459fc690ac85f1782e15782a151b4a9e1b',
  version: 'v4',
  dexId: 'uniswap',
  token: {
    address: '0x0339f5459fc690ac85f1782e15782a151b4a9e1b',
    symbol: 'MOCK',
    name: 'Mock Token',
    decimals: 18,
  },
  quote: {
    address: '0xquote',
    symbol: 'USDG',
    name: 'USDG',
    decimals: 18,
  },
  token0: '0x0339f5459fc690ac85f1782e15782a151b4a9e1b',
  token1: '0xquote',
  quoteIsToken0: false,
  quoteIsNative: false,
  fee: 3000,
  effectiveFee: 3000,
  feePct: 0.3,
  tickSpacing: 60,
  binStepPct: 0.6018,
  tick: 0,
  hooks: '0x0000000000000000000000000000000000000000',
  labels: [],
  warnings: [],
  verification: 'contract-identified',
  createdAt: Date.now() - 100_000,
  tokenCreatedAt: null,
  priceNow: 0.0195,
  priceUsd: 0.0195,
  tvlUsd: 500_000,
  volume24hUsd: 1_000_000,
  marketCap: 18_200_000, // Provider verified circulating market cap
  fdv: 19_500_000,       // Provider / total supply FDV
  totalSupply: 1_000_000_000,
  fees24hUsd: 3_000,
  feeAprPct: 21.9,
  volToTvlRatio: 2.0,
  updatedAt: Date.now(),
  stateUpdatedAt: Date.now(),
  tvlUpdatedAt: Date.now(),
  indexedAt: Date.now(),
  volumeUpdatedAt: Date.now(),
  marketCapUpdatedAt: Date.now(),
  fdvUpdatedAt: Date.now(),
  blockNumber: '1000',
  provenance: {
    price: 'onchain',
    quoteUsd: 'stable-peg',
    tvl: 'onchain-balances',
    volume: 'dexscreener',
    marketCap: 'dexscreener',
    fees: 'estimated-volume-times-current-fee',
  },
  ...overrides,
});

describe('Frontend Financial Correctness & Semantic Integrity', () => {
  test('Discover preserves strict circulating market cap (18.2M) and derived FDV (19.5M)', () => {
    const raw = mockPool();
    const discovered = toDiscoveredPool(raw, '24h');

    // Invariant: Market Cap is strictly circulating supply * price
    assert.equal(discovered.market.marketCap, 18_200_000);
    // Invariant: FDV is strictly total supply * price
    assert.equal(discovered.market.fdv, 19_500_000);
  });

  test('when circulating market cap is unknown, marketCap is null and NOT populated by FDV', () => {
    const raw = mockPool({
      marketCap: null, // Unknown circulating supply
      fdv: 19_500_000,
    });
    const discovered = toDiscoveredPool(raw, '24h');

    // Invariant: Never substitute FDV as market cap when unknown
    assert.equal(discovered.market.marketCap, null);
    assert.equal(discovered.market.fdv, 19_500_000);
  });

  test('live swap overlay updates spot price, preserves circulating ratio, and updates FDV', () => {
    __resetDirectoryForTests();
    const raw = mockPool();
    const page: PoolPage = {
      pools: [raw],
      nextCursor: null,
      snapshot: 'test',
      updatedAt: Date.now(),
      stale: false,
    };
    materializePage(page);

    // Live swap moves spot from 0.0195 to 0.02
    applyExecutionOverlay(raw.id, {
      priceNow: 0.02,
      tick: 50,
    });

    const updated = materializePage(page).pools[0]!;
    assert.equal(updated.priceNow, 0.02);
    assert.equal(updated.priceUsd, 0.02);
    // FDV moves to 1B * 0.02 = 20M
    assert.equal(updated.fdv, 20_000_000);
    // Market cap scales with circulating ratio (18.2 / 19.5 = ~0.9333333333333333)
    const expectedMcap = 20_000_000 * (18_200_000 / 19_500_000);
    assert.ok(Math.abs(updated.marketCap! - expectedMcap) < 1);
  });

  test('token meta resolver never fabricates marketCap from fdv when marketCap is missing', async () => {
    // Test the internal invariant that fetchRobinhoodTokenMeta leaves marketCap null if only fdv is returned
    // Mock global fetch for this unit test
    const originalFetch = global.fetch;
    try {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            data: {
              symbol: 'TEST',
              name: 'Test Token',
              logoUrl: 'https://example.com/logo.png',
              marketCapUsd: null,
              fdvUsd: 50_000_000,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );

      const meta = await fetchRobinhoodTokenMeta('0xtest-strict-fdv-distinction');
      assert.notEqual(meta, null);
      assert.equal(meta?.fdv, 50_000_000);
      // Invariant: marketCap must remain null!
      assert.equal(meta?.marketCap, null);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
