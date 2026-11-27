import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  cachePoolBins,
  cachePoolForWorkstation,
  cachePoolHistory,
  getAnyCachedHistory,
  getCachedPoolBins,
  getCachedPoolForWorkstation,
  getCachedPoolHistory,
  parseIntervalSeconds,
  parseWorkstationPath,
  poolWorkstationHref,
} from './pool-cache.js';
import type { CanonicalPool } from '../shared/pool-directory.js';

test('poolWorkstationHref generates clean workstation URLs', () => {
  assert.equal(
    poolWorkstationHref({
      id: '0x40a433930370f6cdf0a78debc2c6dd599c23bd428c0d67dd8b5373e4f101557f',
      chainId: 'robinhood',
    }),
    '/pool/robinhood/0x40a433930370f6cdf0a78debc2c6dd599c23bd428c0d67dd8b5373e4f101557f',
  );

  assert.equal(
    poolWorkstationHref({
      id: '',
      pairAddress: '0x10cc6bd38112cac182db90b6a71d8bb5939526ba',
      chainId: 1337,
    }),
    '/pool/robinhood/0x10cc6bd38112cac182db90b6a71d8bb5939526ba',
  );
  assert.equal(
    poolWorkstationHref({
      id: '0x40a433930370f6cdf0a78debc2c6dd599c23bd428c0d67dd8b5373e4f101557f',
      pairAddress: '0x10cc6bd38112cac182db90b6a71d8bb5939526ba',
      chainId: 'robinhood',
    }),
    '/pool/robinhood/0x40a433930370f6cdf0a78debc2c6dd599c23bd428c0d67dd8b5373e4f101557f?pair=0x10cc6bd38112cac182db90b6a71d8bb5939526ba',
  );
});

test('workstation pool cache stores and retrieves by multiple normalized keys', () => {
  const dummyPool = {
    id: '0x40A433930370F6CDF0A78DEBC2C6DD599C23BD428C0D67DD8B5373E4F101557F',
    pairAddress: '0x10Cc6BD38112CAC182DB90B6A71D8BB5939526BA',
    canonicalId: 'robinhood:v4:0x40A4',
    symbol: 'ABC/XYZ',
  } as unknown as CanonicalPool;

  cachePoolForWorkstation(dummyPool);

  // Case-insensitive lookup by id
  assert.equal(
    getCachedPoolForWorkstation('0x40a433930370f6cdf0a78debc2c6dd599c23bd428c0d67dd8b5373e4f101557f'),
    dummyPool,
  );
  // Case-insensitive lookup by pairAddress
  assert.equal(
    getCachedPoolForWorkstation('0x10cc6bd38112cac182db90b6a71d8bb5939526ba'),
    dummyPool,
  );
  // Case-insensitive lookup by canonicalId
  assert.equal(
    getCachedPoolForWorkstation('ROBINHOOD:V4:0X40A4'),
    dummyPool,
  );
  // Multi-key lookup checks candidates in order
  assert.equal(
    getCachedPoolForWorkstation('0xunknown', '0x10cc6bd38112cac182db90b6a71d8bb5939526ba'),
    dummyPool,
  );
  // Non-existent key returns null
  assert.equal(getCachedPoolForWorkstation('0xunknown'), null);
  assert.equal(getCachedPoolForWorkstation(null), null);
});

test('workstation path parser matches clean /pool/<chain>/<pool> and /pools/<token> URLs', () => {
  assert.deepEqual(
    parseWorkstationPath('/pool/robinhood/0x40a433930370f6cdf0a78debc2c6dd599c23bd428c0d67dd8b5373e4f101557f'),
    {
      chain: 'robinhood',
      poolId: '0x40a433930370f6cdf0a78debc2c6dd599c23bd428c0d67dd8b5373e4f101557f',
      token: null,
    },
  );

  assert.deepEqual(
    parseWorkstationPath('/pools/0x10cc6bd38112cac182db90b6a71d8bb5939526ba'),
    {
      chain: null,
      poolId: null,
      token: '0x10cc6bd38112cac182db90b6a71d8bb5939526ba',
    },
  );

  assert.deepEqual(
    parseWorkstationPath('/pool/0x10cc6bd38112cac182db90b6a71d8bb5939526ba'),
    {
      chain: null,
      poolId: '0x10cc6bd38112cac182db90b6a71d8bb5939526ba',
      token: null,
    },
  );

  assert.deepEqual(
    parseWorkstationPath('/open'),
    {
      chain: null,
      poolId: null,
      token: null,
    },
  );
});

test('cachePoolBins stores and retrieves bins with freshness flag', () => {
  const dummyBins = { priceNow: 123.45, bins: [] };
  const poolId = '0x40a433930370f6cdf0a78debc2c6dd599c23bd428c0d67dd8b5373e4f101557f';

  cachePoolBins(poolId, dummyBins);

  // Exact match
  const hit1 = getCachedPoolBins<typeof dummyBins>(poolId);
  assert.ok(hit1);
  assert.deepEqual(hit1.data, dummyBins);
  assert.equal(hit1.isFresh, true);

  // Case-insensitive match
  const hit2 = getCachedPoolBins<typeof dummyBins>(poolId.toUpperCase());
  assert.ok(hit2);
  assert.deepEqual(hit2.data, dummyBins);

  // Non-existent
  assert.equal(getCachedPoolBins('0xnone'), null);
  assert.equal(getCachedPoolBins(null), null);
});

test('cachePoolHistory stores and retrieves candlestick history per timeframe', () => {
  const dummyHistory = { candles: [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }] };
  const poolId = '0x40a433930370f6cdf0a78debc2c6dd599c23bd428c0d67dd8b5373e4f101557f';

  cachePoolHistory(poolId, '5m', dummyHistory);

  // Exact match for 5m
  const hit5m = getCachedPoolHistory<typeof dummyHistory>(poolId, '5m');
  assert.ok(hit5m);
  assert.deepEqual(hit5m.data, dummyHistory);
  assert.equal(hit5m.isFresh, true);

  // Multi-key indexing and multi-candidate retrieval
  const pairAddr = '0x10cc6bd38112cac182db90b6a71d8bb5939526ba';
  cachePoolHistory([poolId, pairAddr], '1h', dummyHistory);
  const hitByPair = getCachedPoolHistory<typeof dummyHistory>([pairAddr], '1h');
  assert.ok(hitByPair);
  assert.deepEqual(hitByPair.data, dummyHistory);

  const hitByMulti = getCachedPoolHistory<typeof dummyHistory>(['0xnone', pairAddr], '1h');
  assert.ok(hitByMulti);
  assert.deepEqual(hitByMulti.data, dummyHistory);

  // Non-existent pool returns null
  assert.equal(getCachedPoolHistory('0xnone', '5m'), null);
  assert.equal(getCachedPoolHistory(null, '5m'), null);
});

test('getAnyCachedHistory retrieves available timeframe across all intervals', () => {
  const poolId = '0x7777888899990000aaaabbbbccccddddeeeeffff111122223333444455556666';
  const hist5m = { candles: [{ time: 300, open: 10, high: 12, low: 9, close: 11 }] };
  const hist1h = { candles: [{ time: 3600, open: 10, high: 15, low: 8, close: 14 }] };

  // When only 1h is cached
  cachePoolHistory(poolId, '1h', hist1h);
  const any1 = getAnyCachedHistory(poolId);
  assert.ok(any1);
  assert.equal(any1.interval, '1h');
  assert.deepEqual(any1.data, hist1h);

  // When 5m is also cached, 5m is prioritized over 1h for resampling
  cachePoolHistory(poolId, '5m', hist5m);
  const any2 = getAnyCachedHistory(poolId);
  assert.ok(any2);
  assert.equal(any2.interval, '5m');
  assert.deepEqual(any2.data, hist5m);

  // When targetInterval is 15m, 5m can be resampled (sourceSec <= targetSec)
  const anyFor15m = getAnyCachedHistory(poolId, '15m');
  assert.ok(anyFor15m);
  assert.equal(anyFor15m.interval, '5m');

  // Non-existent pool returns null
  assert.equal(getAnyCachedHistory('0xunknown'), null);
  assert.equal(getAnyCachedHistory(null), null);
});

test('parseIntervalSeconds parses standard and custom intervals accurately', () => {
  assert.equal(parseIntervalSeconds('1s'), 1);
  assert.equal(parseIntervalSeconds('15s'), 15);
  assert.equal(parseIntervalSeconds('1m'), 60);
  assert.equal(parseIntervalSeconds('5m'), 300);
  assert.equal(parseIntervalSeconds('15m'), 900);
  assert.equal(parseIntervalSeconds('1h'), 3600);
  assert.equal(parseIntervalSeconds('4h'), 14400);
  assert.equal(parseIntervalSeconds('1d'), 86400);
});


