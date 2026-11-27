import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  formatApr,
  formatCompactAge,
  formatFeeTier,
  formatPctChange,
  formatPriceUsd,
  formatTurnoverRatio,
  generatePagination,
  getEstimatedAprForTimeframe,
  getFeeRevenueForTimeframe,
  getPriceChangeForTimeframe,
  getTvlChangeForTimeframe,
  getVolumeChangeForTimeframe,
  getVolumeForTimeframe,
  toDiscoveredPool,
} from './pool-model';
import type { CanonicalPool } from './types';

const mockPool = (overrides?: Partial<CanonicalPool>): CanonicalPool => ({
  canonicalId: '1:v3:0x1234567890abcdef1234567890abcdef12345678',
  chainId: 1,
  protocol: 'uniswap',
  id: '0x1234567890abcdef1234567890abcdef12345678',
  pairAddress: '0x1234567890abcdef1234567890abcdef12345678',
  version: 'v3',
  dexId: 'uniswap',
  token: {
    address: '0xbase',
    symbol: 'TEST',
    name: 'Test Token',
    decimals: 18,
  },
  quote: {
    address: '0xquote',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
  },
  token0: '0xbase',
  token1: '0xquote',
  quoteIsToken0: false,
  quoteIsNative: false,
  fee: 10000,
  effectiveFee: 10000,
  feePct: 1,
  tickSpacing: 200,
  binStepPct: 2.0,
  tick: 12345,
  hooks: '0x0000000000000000000000000000000000000000',
  labels: [],
  warnings: [],
  verification: 'contract-identified',
  createdAt: Date.now() - 63 * 86_400_000, // 63 days ago
  tokenCreatedAt: null,
  priceNow: 0.0032731471,
  priceUsd: 8.66,
  tvlUsd: 6_150_000,
  volume24hUsd: 4_600_000,
  volume1hUsd: 200_000,
  volume6hUsd: 1_200_000,
  volume5mUsd: 25_000,
  priceChange24h: 8.4,
  priceChange1h: 0.5,
  priceChange6h: 2.1,
  priceChange5m: 0.1,
  tvlChange24h: 1.25,
  tvlChange1h: -0.45,
  tvlChange6h: 0.8,
  tvlChange5m: 0.05,
  volumeTimeframes: {
    m5: 25_000,
    h1: 200_000,
    h6: 1_200_000,
    h24: 4_600_000,
  },
  priceChange: {
    m5: 0.1,
    h1: 0.5,
    h6: 2.1,
    h24: 8.4,
  },
  tvlChange: {
    m5: 0.05,
    h1: -0.45,
    h6: 0.8,
    h24: 1.25,
  },
  txns: {
    h24: { buys: 120, sells: 80 },
  },
  marketCap: 458_000_000,
  fdv: 500_000_000,
  fees24hUsd: 46_000,
  feeAprPct: 273.0,
  volToTvlRatio: 0.748,
  updatedAt: Date.now(),
  stateUpdatedAt: Date.now(),
  tvlUpdatedAt: Date.now(),
  indexedAt: Date.now(),
  volumeUpdatedAt: Date.now(),
  marketCapUpdatedAt: Date.now(),
  fdvUpdatedAt: Date.now(),
  blockNumber: '123456',
  provenance: {
    price: 'onchain',
    quoteUsd: 'onchain',
    tvl: 'onchain-balances',
    volume: 'dexscreener',
    marketCap: 'dexscreener',
    fees: 'estimated-volume-times-current-fee',
  },
  ...overrides,
});

test('formatFeeTier formats standard and dynamic fees cleanly', () => {
  assert.equal(formatFeeTier(10000), '1.00%');
  assert.equal(formatFeeTier(3000), '0.30%');
  assert.equal(formatFeeTier(500), '0.05%');
  assert.equal(formatFeeTier(100), '0.01%');
  assert.equal(formatFeeTier(2500), '0.25%');
  assert.equal(formatFeeTier(10080), '1.00%');
  assert.equal(formatFeeTier(100000), '10.0%');
  assert.equal(formatFeeTier(125000), '12.5%');
  assert.equal(formatFeeTier(200000), '20.0%');
  assert.equal(formatFeeTier(0x800000), '0.00%');
  assert.equal(formatFeeTier(0, true), '0.00%');
  assert.equal(formatFeeTier(0, false), '0.00%');
  assert.equal(formatFeeTier(null), '—');
});

test('formatTurnoverRatio formats volume to TVL multiples correctly without multiplication sign', () => {
  assert.equal(formatTurnoverRatio(0.748), '0.75 TVL');
  assert.equal(formatTurnoverRatio(23.72), '23.7 TVL');
  assert.equal(formatTurnoverRatio(105.4), '105 TVL');
  assert.equal(formatTurnoverRatio(0.003), '<0.01 TVL');
  assert.equal(formatTurnoverRatio(0), '0.00 TVL');
  assert.equal(formatTurnoverRatio(null), '—');
  assert.equal(formatTurnoverRatio(1250), '>999 TVL');
});

test('formatCompactAge produces duration strings with ago suffix', () => {
  const sixtyThreeDaysAgo = Date.now() - 63 * 86_400_000;
  assert.equal(formatCompactAge(sixtyThreeDaysAgo), '63d ago');
  assert.equal(formatCompactAge(null), '—');
});

test('formatApr formats yield with estimation symbol and handles extreme numbers', () => {
  assert.equal(formatApr(null), '—');
  assert.equal(formatApr(0), '0.0% APR');
  assert.equal(formatApr(-5), '0.0% APR');
  assert.equal(formatApr(273.0), '~273.0% APR');
  assert.equal(formatApr(1450), '~1,450% APR');
  assert.equal(formatApr(14520), '~14.5k% APR');
  assert.equal(formatApr(150000), '>99k% APR');
});

test('formatPctChange formats price percentage changes and caps extremes', () => {
  assert.equal(formatPctChange(8.4), '+8.40%');
  assert.equal(formatPctChange(-3.25), '-3.25%');
  assert.equal(formatPctChange(0.001), '0.00%');
  assert.equal(formatPctChange(15000), '+15.0k%');
  assert.equal(formatPctChange(150000), '>+99k%');
  assert.equal(formatPctChange(-120000), '<-99k%');
  assert.equal(formatPctChange(null), '—');
});

test('formatPriceUsd handles standard prices, extreme valuations, and sub-cent precision cleanly', () => {
  assert.equal(formatPriceUsd(8.66), '$8.66');
  assert.equal(formatPriceUsd(2411.43), '$2,411.43');
  assert.equal(formatPriceUsd(3.4e6), '$3.40M');
  assert.equal(formatPriceUsd(2.5e9), '$2.50B');
  assert.equal(formatPriceUsd(1.5e12), '$1.50T');
  assert.equal(formatPriceUsd(1.008), '$1');
  assert.equal(formatPriceUsd(null, 1.008, 'USDG'), '$1');
  assert.equal(formatPriceUsd(null, 0.003273, 'WETH'), '$0.003273');
  assert.equal(formatPriceUsd(null, null), '—');
});

test('timeframe volume and price change resolution', () => {
  const p = mockPool();
  assert.equal(getVolumeForTimeframe(p, '6h'), 1_200_000);
  assert.equal(getVolumeForTimeframe(p, '1h'), 200_000);
  assert.equal(getVolumeForTimeframe(p, '5m'), 25_000);

  assert.equal(getPriceChangeForTimeframe(p, '24h'), 8.4);
  assert.equal(getPriceChangeForTimeframe(p, '6h'), 2.1);
  assert.equal(getPriceChangeForTimeframe(p, '1h'), 0.5);
  assert.equal(getPriceChangeForTimeframe(p, '5m'), 0.1);

  assert.equal(getTvlChangeForTimeframe(p, '24h'), 1.25);
  assert.equal(getTvlChangeForTimeframe(p, '1h'), -0.45);
  assert.equal(getTvlChangeForTimeframe(p, '6h'), 0.8);
  assert.equal(getTvlChangeForTimeframe(p, '5m'), 0.05);
});

test('getVolumeChangeForTimeframe covers all timeframes (5m, 1h, 6h, 24h)', () => {
  const maturePool = mockPool({
    createdAt: Date.now() - 7 * 86400 * 1000,
    volume24hUsd: 100_000,
    volume6hUsd: 30_000,
    volume1hUsd: 6_000,
    volume5mUsd: 600,
  });

  // Mature pool: all timeframes compute valid non-null, non-explosive percentage changes
  const chg24h = getVolumeChangeForTimeframe(maturePool, '24h');
  const chg6h = getVolumeChangeForTimeframe(maturePool, '6h');
  const chg1h = getVolumeChangeForTimeframe(maturePool, '1h');
  const chg5m = getVolumeChangeForTimeframe(maturePool, '5m');

  assert.ok(chg24h !== null && Number.isFinite(chg24h));
  assert.ok(chg6h !== null && Number.isFinite(chg6h));
  assert.ok(chg1h !== null && Number.isFinite(chg1h));
  assert.ok(chg5m !== null && Number.isFinite(chg5m));

  // Brand new pool (created 30 minutes ago): MUST NOT blow up to +2300% or +28700%
  const newPool = mockPool({
    createdAt: Date.now() - 30 * 60 * 1000,
    poolCreatedAt: Date.now() - 30 * 60 * 1000,
    volume24hUsd: 10_000,
    volume6hUsd: 10_000,
    volume1hUsd: 10_000,
    volume5mUsd: 1_000,
  });

  const newChg24h = getVolumeChangeForTimeframe(newPool, '24h');
  const newChg6h = getVolumeChangeForTimeframe(newPool, '6h');
  const newChg1h = getVolumeChangeForTimeframe(newPool, '1h');
  const newChg5m = getVolumeChangeForTimeframe(newPool, '5m');

  assert.notEqual(newChg24h, 2300, '24h change on new pool must not be fabricated +2300%');
  assert.notEqual(newChg1h, 2300, '1h change on new pool must not be fabricated +2300%');
  assert.equal(newChg1h, 0, '1h change on new pool in its first hour should be 0.0% initial baseline');
  assert.equal(newChg6h, 0, '6h change on new pool should be 0.0% initial baseline');
  assert.ok(newChg5m !== null && newChg5m < 500, '5m change on new pool must not explode');
});

test('fee revenue and APR calculation for timeframes', () => {
  const p = mockPool();
  // 24h: 4.6M volume * 1% (10,000 / 1M) = $46,000
  assert.equal(getFeeRevenueForTimeframe(p, '24h', 4_600_000), 46_000);
  // 1h: 200k volume * 1% = $2,000
  assert.equal(getFeeRevenueForTimeframe(p, '1h', 200_000), 2_000);

  // 24h uses stored feeAprPct if present
  assert.equal(getEstimatedAprForTimeframe(p, '24h', 46_000), 273.0);
  // 1h: ($2,000 * 24 * 365) / 6.15M * 100
  const expected1hApr = ((2_000 * 24 * 365) / 6_150_000) * 100;
  const computed1hApr = getEstimatedAprForTimeframe(p, '1h', 2_000);
  assert.ok(computed1hApr !== null);
  assert.ok(Math.abs(computed1hApr - expected1hApr) < 0.001);
});

test('toDiscoveredPool builds complete semantic groups', () => {
  const p = mockPool();
  const discovered = toDiscoveredPool(p, '24h');

  // Pool identity
  assert.equal(discovered.poolIdentity.token0.symbol, 'TEST');
  assert.equal(discovered.poolIdentity.token1.symbol, 'WETH');
  assert.equal(discovered.poolIdentity.protocolVersion, 'v3');
  assert.equal(discovered.poolIdentity.feeTierFormatted, '1.00%');
  assert.equal(discovered.poolIdentity.tickSpacing, 200);

  // Market
  assert.equal(discovered.market.marketCap, 458_000_000);
  assert.equal(discovered.market.priceUsd, 8.66);
  assert.equal(discovered.market.priceChangePct, 8.4);

  // Liquidity
  assert.equal(discovered.liquidity.tvlUsd, 6_150_000);
  assert.equal(discovered.liquidity.isConcentrated, true);
  assert.equal(discovered.liquidity.tvlChangePct, 1.25);

  const discovered1h = toDiscoveredPool(p, '1h');
  assert.equal(discovered1h.liquidity.tvlChangePct, -0.45);

  // Activity
  assert.equal(discovered.activity.volumeUsd, 4_600_000);
  assert.ok(discovered.activity.volumeToTvl !== null);
  assert.ok(Math.abs(discovered.activity.volumeToTvl - 4_600_000 / 6_150_000) < 0.001);
  assert.equal(discovered.activity.swapsCount, 200);

  // Yield
  assert.equal(discovered.yield.feeRevenueUsd, 46_000);
  assert.equal(discovered.yield.estimatedApr, 273.0);
});

test('generatePagination handles small total pages <= 7', () => {
  assert.deepEqual(generatePagination(1, 0), [1]);
  assert.deepEqual(generatePagination(1, 1), [1]);
  assert.deepEqual(generatePagination(1, 3), [1, 2, 3]);
  assert.deepEqual(generatePagination(2, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(generatePagination(4, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test('generatePagination handles larger total pages > 7 with ellipsis', () => {
  // Start window (currentPage <= 4)
  assert.deepEqual(generatePagination(1, 10), [1, 2, 3, 4, 5, '...', 10]);
  assert.deepEqual(generatePagination(3, 10), [1, 2, 3, 4, 5, '...', 10]);
  assert.deepEqual(generatePagination(4, 10), [1, 2, 3, 4, 5, '...', 10]);

  // End window (currentPage >= totalPages - 3)
  assert.deepEqual(generatePagination(7, 10), [1, '...', 6, 7, 8, 9, 10]);
  assert.deepEqual(generatePagination(9, 10), [1, '...', 6, 7, 8, 9, 10]);
  assert.deepEqual(generatePagination(10, 10), [1, '...', 6, 7, 8, 9, 10]);

  // Middle window (4 < currentPage < totalPages - 3)
  assert.deepEqual(generatePagination(5, 12), [1, '...', 4, 5, 6, '...', 12]);
  assert.deepEqual(generatePagination(6, 12), [1, '...', 5, 6, 7, '...', 12]);
  assert.deepEqual(generatePagination(8, 12), [1, '...', 7, 8, 9, '...', 12]);
});

test('toDiscoveredPool preserves PAIR RWA launchpad and detects dynamic fee', () => {
  const pRwa = mockPool({
    launchpad: 'PAIR RWA',
    fee: 0x800000,
    effectiveFee: 0x800000,
  });
  const discoveredRwa = toDiscoveredPool(pRwa, '24h');
  assert.equal(discoveredRwa.poolIdentity.launchpad, 'PAIR RWA');
  assert.equal(discoveredRwa.poolIdentity.isDynamicFee, true);
  assert.equal(discoveredRwa.poolIdentity.feeTierFormatted, '0.00%');

  const pDynamicWarning = mockPool({
    fee: 0,
    effectiveFee: 0,
    warnings: ['DYNAMIC_FEE'],
  });
  const discoveredDynamic = toDiscoveredPool(pDynamicWarning, '24h');
  assert.equal(discoveredDynamic.poolIdentity.isDynamicFee, true);
  assert.equal(discoveredDynamic.poolIdentity.feeTierFormatted, '0.00%');
});

test('toDiscoveredPool handles Uniswap v4 hook pools with fee 0% and computes APR', () => {
  const pHook = mockPool({
    fee: 0,
    effectiveFee: 0,
    hooks: '0x1234567890123456789012345678901234567890',
    fees24hUsd: null,
    feeAprPct: null,
  });
  const discoveredHook = toDiscoveredPool(pHook, '24h');
  assert.equal(discoveredHook.poolIdentity.hasHook, true);
  assert.equal(discoveredHook.poolIdentity.isDynamicFee, true);
  assert.equal(discoveredHook.poolIdentity.feeTierFormatted, '0.00%');
  // Volume is 4.6M, dynamic hook estimated at 0.3% (3000 bps) -> $13,800
  assert.equal(discoveredHook.yield.feeRevenueUsd, 13_800);
  assert.ok(discoveredHook.yield.estimatedApr !== null && discoveredHook.yield.estimatedApr > 0);

  // Pons hook pool: 0xe5e702641ea86f4ae6cc3cdaed2b886f976be044
  const pPons = mockPool({
    fee: 0,
    effectiveFee: 10000,
    launchpad: 'Pons',
    hooks: '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044',
  });
  const discoveredPons = toDiscoveredPool(pPons, '24h');
  assert.equal(discoveredPons.poolIdentity.hasHook, true);
  assert.equal(discoveredPons.poolIdentity.launchpad, 'Pons');
  assert.equal(discoveredPons.poolIdentity.feeTierFormatted, '1.00%');
  assert.equal(discoveredPons.yield.feeRevenueUsd, 46_000);
  assert.equal(discoveredPons.yield.estimatedApr, 273.0);
});

test('toDiscoveredPool preserves marketCap and derives real-time fdv from totalSupply and priceUsd', () => {
  const p = mockPool({
    totalSupply: 1_000_000_000,
    priceUsd: 0.0195,
    marketCap: 18_200_000,
    fdv: 18_200_000,
  });
  const discovered = toDiscoveredPool(p, '24h');
  assert.equal(discovered.market.marketCap, 18_200_000);
  assert.equal(discovered.market.fdv, 19_500_000);
});


