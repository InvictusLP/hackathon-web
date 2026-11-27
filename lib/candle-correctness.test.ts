import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  cleanCandles,
  mergeCandles,
  resampleCandles,
  isV2SupportedTimeframe,
  mapV2Candles,
  type Candle,
} from './candles.js';
import {
  cachePoolHistory,
  getAnyCachedHistory,
} from './pool-cache.js';

test('resampleCandles rejects downsampling coarse bars into smaller intervals', () => {
  const candles5m: Candle[] = [
    { time: 300, open: 100, high: 105, low: 95, close: 102, volume: 500, trades: 10 },
    { time: 600, open: 102, high: 108, low: 101, close: 107, volume: 600, trades: 12 },
    { time: 900, open: 107, high: 110, low: 104, close: 105, volume: 450, trades: 8 },
  ];

  // Downsampling 5m (300s) to 1s (1s) must be rejected
  const res1s = resampleCandles(candles5m, 1);
  assert.deepEqual(res1s, [], 'Must return empty array instead of relabeling 5m bars as 1s');

  // Downsampling 5m (300s) to 15s (15s) must be rejected
  const res15s = resampleCandles(candles5m, 15);
  assert.deepEqual(res15s, [], 'Must return empty array instead of relabeling 5m bars as 15s');

  // Downsampling 5m (300s) to 1m (60s) must be rejected
  const res1m = resampleCandles(candles5m, 60);
  assert.deepEqual(res1m, [], 'Must return empty array instead of relabeling 5m bars as 1m');

  // Explicit sourceSeconds > targetSeconds must be rejected even with single bar
  const single5m: Candle[] = [
    { time: 300, open: 100, high: 105, low: 95, close: 102, volume: 500, trades: 10 },
  ];
  const resSingle = resampleCandles(single5m, 60, 300);
  assert.deepEqual(resSingle, [], 'Must reject downsample when sourceSeconds > targetSeconds');

  // Valid upsample 5m to 15m (900s) must succeed
  const res15m = resampleCandles(candles5m, 900);
  assert.equal(res15m.length, 2);
  assert.equal(res15m[0]!.time, 0); // floor(300 / 900) * 900 = 0
  assert.equal(res15m[0]!.open, 100);
  assert.equal(res15m[0]!.close, 107);
  assert.equal(res15m[0]!.high, 108);
  assert.equal(res15m[0]!.low, 95);
  assert.equal(res15m[1]!.time, 900);
  assert.equal(res15m[1]!.open, 107);
  assert.equal(res15m[1]!.close, 105);
});

test('resampleCandles accumulates volume and trades and preserves source and currency provenance', () => {
  const candles1m: Candle[] = [
    { time: 60, open: 10, high: 12, low: 9, close: 11, volume: 100, trades: 5, source: 'v2', currency: 'USD' },
    { time: 120, open: 11, high: 14, low: 10, close: 13, volume: 200, trades: 8, source: 'v2', currency: 'USD' },
    { time: 180, open: 13, high: 15, low: 12, close: 14, volume: 150, trades: 6, source: 'v2', currency: 'USD' },
  ];

  const res = resampleCandles(candles1m, 300, 60);
  assert.equal(res.length, 1);
  const bar = res[0]!;
  assert.equal(bar.time, 0); // bucket 0-300
  assert.equal(bar.open, 10);
  assert.equal(bar.high, 15);
  assert.equal(bar.low, 9);
  assert.equal(bar.close, 14);
  assert.equal(bar.volume, 450, 'Volume must be summed across merged bars');
  assert.equal(bar.trades, 19, 'Trades count must be summed across merged bars');
  assert.equal(bar.source, 'v2', 'Source provenance must be preserved');
  assert.equal(bar.currency, 'USD', 'Currency provenance must be preserved');
});

test('cleanCandles and mergeCandles preserve trades, source, and currency provenance', () => {
  const raw: Candle[] = [
    { time: 100, open: 10, high: 12, low: 9, close: 11, volume: 50, trades: 3, source: 'chain', currency: 'USD' },
    { time: 200, open: 11, high: 13, low: 10, close: 12, volume: 75, trades: 4, source: 'chain', currency: 'USD' },
  ];

  const cleaned = cleanCandles(raw);
  assert.equal(cleaned[0]!.trades, 3);
  assert.equal(cleaned[0]!.source, 'chain');
  assert.equal(cleaned[0]!.currency, 'USD');

  const incoming: Candle[] = [
    { time: 200, open: 11, high: 15, low: 10, close: 14, volume: 100, trades: 7, source: 'chain', currency: 'USD' },
  ];
  const merged = mergeCandles(cleaned, incoming);
  assert.equal(merged.length, 2);
  const updatedBar = merged[1]!;
  assert.equal(updatedBar.trades, 7);
  assert.equal(updatedBar.volume, 100);
  assert.equal(updatedBar.source, 'chain');
  assert.equal(updatedBar.currency, 'USD');
});

test('cleanCandles removes reciprocal heuristic masking on authentic extreme wicks', () => {
  const candlesWithExtremeWicks: Candle[] = [
    { time: 1000, open: 0.0003, high: 0.00032, low: 0.00029, close: 0.00031 },
    // 7.7M authentic wick / spike on 0.0003 candle: must NOT be reciprocally masked to 0.00013 or 0.00031
    { time: 1060, open: 0.00031, high: 7714013, low: 0.0003, close: 0.00031 },
    { time: 1120, open: 0.00031, high: 0.00033, low: 0.0003, close: 0.00032 },
  ];

  const cleaned = cleanCandles(candlesWithExtremeWicks);
  assert.equal(cleaned.length, 3);
  assert.equal(cleaned[1]!.high, 7714013, 'Reciprocal heuristic masking removed: authentic price values preserved');
});

test('isV2SupportedTimeframe validates supported timeframes correctly', () => {
  // Supported timeframes (>= 1m)
  assert.equal(isV2SupportedTimeframe('1m'), true);
  assert.equal(isV2SupportedTimeframe('5m'), true);
  assert.equal(isV2SupportedTimeframe('15m'), true);
  assert.equal(isV2SupportedTimeframe('1h'), true);
  assert.equal(isV2SupportedTimeframe('4h'), true);
  assert.equal(isV2SupportedTimeframe('1d'), true);

  // Unsupported sub-minute timeframes
  assert.equal(isV2SupportedTimeframe('1s'), false);
  assert.equal(isV2SupportedTimeframe('15s'), false);
  assert.equal(isV2SupportedTimeframe('30s'), false);
  assert.equal(isV2SupportedTimeframe(''), false);
  assert.equal(isV2SupportedTimeframe('invalid'), false);
});

test('mapV2Candles preserves bucket, volumeUsd, tradesCount, and sets explicit USD provenance', () => {
  const v2Rows = [
    {
      bucket: 1700000000,
      open: 100.5,
      high: 105.2,
      low: 99.8,
      close: 104.1,
      volumeUsd: 125000.5,
      tradesCount: 42,
      isClosed: true,
    },
    {
      bucket: 1700000300,
      open: 104.1,
      high: 106.0,
      low: 103.5,
      close: 105.8,
      volumeUsd: 89000.0,
      tradesCount: 28,
      isClosed: false,
    },
  ];

  const mapped = mapV2Candles(v2Rows);
  assert.equal(mapped.length, 2);
  assert.deepEqual(mapped[0], {
    time: 1700000000,
    open: 100.5,
    high: 105.2,
    low: 99.8,
    close: 104.1,
    volume: 125000.5,
    trades: 42,
    source: 'v2',
    currency: 'USD',
  });
});

test('getAnyCachedHistory with targetInterval never returns a coarser timeframe', () => {
  const poolId = '0x999900001111222233334444555566667777888899990000aaaabbbbccccdddd';
  const hist5m = {
    candles: [{ time: 300, open: 10, high: 12, low: 9, close: 11, volume: 100 }],
    interval: '5m',
    source: 'v2',
    currency: 'USD',
  };
  cachePoolHistory(poolId, '5m', hist5m);

  // When asking for 1s, 5m cannot be downsampled: must return null!
  const res1s = getAnyCachedHistory(poolId, '1s');
  assert.equal(res1s, null, 'Must NOT return 5m when asking for 1s');

  // When asking for 15s, 5m cannot be downsampled: must return null!
  const res15s = getAnyCachedHistory(poolId, '15s');
  assert.equal(res15s, null, 'Must NOT return 5m when asking for 15s');

  // When asking for 1m, 5m cannot be downsampled: must return null!
  const res1m = getAnyCachedHistory(poolId, '1m');
  assert.equal(res1m, null, 'Must NOT return 5m when asking for 1m');

  // When asking for 5m, 5m can be used
  const res5m = getAnyCachedHistory(poolId, '5m');
  assert.ok(res5m);
  assert.equal(res5m.interval, '5m');

  // When asking for 15m, 5m can be resampled (5m <= 15m)
  const res15m = getAnyCachedHistory(poolId, '15m');
  assert.ok(res15m);
  assert.equal(res15m.interval, '5m');
});
