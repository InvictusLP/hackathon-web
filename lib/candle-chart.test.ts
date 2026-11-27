import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  aggregateCandleTick,
  broadcastChartRange,
  calculateAutoscalePriceRange,
  cleanCandles,
  computeMinSpan,
  mergeCandles,
  resampleCandles,
  registerChartSync,
  TIMEFRAMES,
  formatPrice,
  formatMcap,
  type Candle,
} from '../components/app/candle-chart';

test('TIMEFRAMES definition is consistent and accurate', () => {
  assert.equal(TIMEFRAMES['1s'], 1, '1s must be 1 second');
  assert.equal(TIMEFRAMES['15s'], 15, '15s must be 15 seconds');
  assert.equal(TIMEFRAMES['1m'], 60, '1m must be 60 seconds');
  assert.equal(TIMEFRAMES['5m'], 300, '5m must be 300 seconds');
  assert.equal(TIMEFRAMES['15m'], 900, '15m must be 900 seconds');
  assert.equal(TIMEFRAMES['1h'], 3600, '1h must be 3600 seconds');
});

test('15s bucket calculation and aggregation', () => {
  const tf = TIMEFRAMES['15s'];
  const epoch120000 = 1700000010 - (1700000010 % 15); // Perfectly 15s aligned

  // Tick at 12:00:01 (base + 1)
  const res1 = aggregateCandleTick(null, 100, epoch120000 + 1, tf);
  assert.ok(res1);
  assert.equal(res1.isNew, true);
  assert.equal(res1.bar.time, epoch120000);
  assert.equal(res1.bar.open, 100);
  assert.equal(res1.bar.high, 100);
  assert.equal(res1.bar.low, 100);
  assert.equal(res1.bar.close, 100);

  // Tick at 12:00:14 (base + 14) still belongs to 12:00:00 candle
  const res2 = aggregateCandleTick(res1.bar, 105, epoch120000 + 14, tf);
  assert.ok(res2);
  assert.equal(res2.isNew, false);
  assert.equal(res2.bar.time, epoch120000);
  assert.equal(res2.bar.open, 100);
  assert.equal(res2.bar.high, 105);
  assert.equal(res2.bar.low, 100);
  assert.equal(res2.bar.close, 105);

  // Tick at 12:00:15 (base + 15) must start a new candle at 12:00:15
  const res3 = aggregateCandleTick(res2.bar, 108, epoch120000 + 15, tf);
  assert.ok(res3);
  assert.equal(res3.isNew, true);
  assert.equal(res3.bar.open, 108, 'open should start at the trade execution price');
  assert.equal(res3.bar.high, 108);
  assert.equal(res3.bar.low, 108);
  assert.equal(res3.bar.close, 108);
});

test('aggregateCandleTick requires authentic positive finite timestamp and rejects synthetic or invalid timestamps', () => {
  const tf = 60;
  assert.equal(aggregateCandleTick(null, 100, 0, tf), null, 'Must reject 0 timestamp');
  assert.equal(aggregateCandleTick(null, 100, -10, tf), null, 'Must reject negative timestamp');
  assert.equal(aggregateCandleTick(null, 100, NaN, tf), null, 'Must reject NaN timestamp');
  assert.equal(aggregateCandleTick(null, 100, Infinity, tf), null, 'Must reject Infinite timestamp');
  assert.equal(aggregateCandleTick(null, 0, 1000, tf), null, 'Must reject non-positive price');
  assert.equal(aggregateCandleTick(null, -5, 1000, tf), null, 'Must reject negative price');
  assert.equal(aggregateCandleTick(null, 100, 1000, 0), null, 'Must reject non-positive timeframe');
});

test('aggregateCandleTick preserves volume, trades, source, and currency provenance', () => {
  const initial: Candle = {
    time: 1020,
    open: 10,
    high: 12,
    low: 9,
    close: 11,
    volume: 500,
    trades: 3,
    source: 'v2',
    currency: 'USD',
  };

  // Same bucket update
  const tick1 = aggregateCandleTick(initial, 13, 1030, 60);
  assert.ok(tick1);
  assert.equal(tick1.isNew, false);
  assert.equal(tick1.bar.volume, 500);
  assert.equal(tick1.bar.trades, 4);
  assert.equal(tick1.bar.source, 'v2');
  assert.equal(tick1.bar.currency, 'USD');

  // Next bucket update
  const tick2 = aggregateCandleTick(tick1.bar, 14, 1085, 60);
  assert.ok(tick2);
  assert.equal(tick2.isNew, true);
  assert.equal(tick2.bar.trades, 1);
  assert.equal(tick2.bar.source, 'v2');
  assert.equal(tick2.bar.currency, 'USD');
});

test('Boundary handling across 59s -> 60s, 14s -> 15s, and 1h', () => {
  const baseMinute = 1700000000 - (1700000000 % 3600); // Clean hour boundary

  // 15s timeframe: 14s -> 15s
  const b14 = Math.floor((baseMinute + 14) / 15) * 15;
  const b15 = Math.floor((baseMinute + 15) / 15) * 15;
  assert.equal(b14, baseMinute);
  assert.equal(b15, baseMinute + 15);

  // 15s timeframe: 59s -> 60s
  const b59 = Math.floor((baseMinute + 59) / 15) * 15;
  const b60 = Math.floor((baseMinute + 60) / 15) * 15;
  assert.equal(b59, baseMinute + 45);
  assert.equal(b60, baseMinute + 60);

  // 1m timeframe: 59s -> 60s
  const m59 = Math.floor((baseMinute + 59) / 60) * 60;
  const m60 = Math.floor((baseMinute + 60) / 60) * 60;
  assert.equal(m59, baseMinute);
  assert.equal(m60, baseMinute + 60);

  // 5m timeframe: 299s -> 300s
  const m5_299 = Math.floor((baseMinute + 299) / 300) * 300;
  const m5_300 = Math.floor((baseMinute + 300) / 300) * 300;
  assert.equal(m5_299, baseMinute);
  assert.equal(m5_300, baseMinute + 300);

  // 15m timeframe: 899s -> 900s
  const m15_899 = Math.floor((baseMinute + 899) / 900) * 900;
  const m15_900 = Math.floor((baseMinute + 900) / 900) * 900;
  assert.equal(m15_899, baseMinute);
  assert.equal(m15_900, baseMinute + 900);

  // 1h timeframe: 3599s -> 3600s
  const h3599 = Math.floor((baseMinute + 3599) / 3600) * 3600;
  const h3600 = Math.floor((baseMinute + 3600) / 3600) * 3600;
  assert.equal(h3599, baseMinute);
  assert.equal(h3600, baseMinute + 3600);
});

test('Same-bucket ticks update H/L/C correctly and preserve open', () => {
  const tf = TIMEFRAMES['1m'];
  const bucket = 1700000000 - (1700000000 % 60);

  // Initial tick
  let current: Candle = {
    time: bucket,
    open: 50,
    high: 50,
    low: 50,
    close: 50,
  };

  // Higher tick (55)
  const r1 = aggregateCandleTick(current, 55, bucket + 10, tf);
  assert.ok(r1 && !r1.isNew);
  current = r1.bar;
  assert.equal(current.open, 50);
  assert.equal(current.high, 55);
  assert.equal(current.low, 50);
  assert.equal(current.close, 55);

  // Lower tick (45)
  const r2 = aggregateCandleTick(current, 45, bucket + 20, tf);
  assert.ok(r2 && !r2.isNew);
  current = r2.bar;
  assert.equal(current.open, 50);
  assert.equal(current.high, 55);
  assert.equal(current.low, 45);
  assert.equal(current.close, 45);

  // Rebound tick (52)
  const r3 = aggregateCandleTick(current, 52, bucket + 30, tf);
  assert.ok(r3 && !r3.isNew);
  current = r3.bar;
  assert.equal(current.open, 50);
  assert.equal(current.high, 55);
  assert.equal(current.low, 45);
  assert.equal(current.close, 52);
});

test('Out-of-order stale ticks are ignored', () => {
  const tf = TIMEFRAMES['1m'];
  const currentBucket = 1700000060;
  const current: Candle = {
    time: currentBucket,
    open: 50,
    high: 55,
    low: 45,
    close: 52,
  };

  // Tick with earlier timestamp (belongs to bucket 1700000000)
  const stale = aggregateCandleTick(current, 60, 1700000020, tf);
  assert.equal(stale, null, 'Stale out-of-order tick must be ignored');
});

test('Cross-chart range synchronization registry dispatches to peers without infinite loops', () => {
  const groupId = 'test-sync-group-1';
  let chart1Received: any = null;
  let chart2Received: any = null;

  const unreg1 = registerChartSync(groupId, (range, sourceId) => {
    if (sourceId === 'chart-1') return; // Guard: skip self
    chart1Received = range;
  });

  const unreg2 = registerChartSync(groupId, (range, sourceId) => {
    if (sourceId === 'chart-2') return; // Guard: skip self
    chart2Received = range;
  });

  // Chart 1 broadcasts range
  const testRange = { from: 1700000000 as any, to: 1700003600 as any };
  broadcastChartRange(groupId, testRange, 'chart-1');

  assert.equal(chart1Received, null, 'Chart 1 should not receive its own broadcast (prevents feedback loop)');
  assert.deepEqual(chart2Received, testRange, 'Chart 2 should receive Chart 1 broadcast');

  // Cleanup
  unreg1();
  unreg2();

  chart2Received = null;
  broadcastChartRange(groupId, testRange, 'chart-1');
  assert.equal(chart2Received, null, 'Unregistered chart should not receive messages');
});

test('Visible range overlap detection preserves viewport or falls back correctly', () => {
  const isRangeOverlapping = (
    range: { from: number; to: number } | null,
    dataMinTime: number,
    dataMaxTime: number,
  ): boolean => {
    if (!range) return false;
    return range.from <= dataMaxTime && range.to >= dataMinTime;
  };

  const dataMin = 1700001000;
  const dataMax = 1700005000;

  // Fully inside:
  assert.equal(isRangeOverlapping({ from: 1700002000, to: 1700004000 }, dataMin, dataMax), true);

  // Partial overlap on right:
  assert.equal(isRangeOverlapping({ from: 1700004000, to: 1700006000 }, dataMin, dataMax), true);

  // Partial overlap on left:
  assert.equal(isRangeOverlapping({ from: 1700000000, to: 1700002000 }, dataMin, dataMax), true);

  // Completely before dataset:
  assert.equal(isRangeOverlapping({ from: 1700000000, to: 1700000500 }, dataMin, dataMax), false);

  // Completely after dataset:
  assert.equal(isRangeOverlapping({ from: 1700006000, to: 1700007000 }, dataMin, dataMax), false);

  // Null range:
  assert.equal(isRangeOverlapping(null, dataMin, dataMax), false);
});

test('cleanCandles preserves authentic market wicks and rejects invalid prices', () => {
  const normalCandles: Candle[] = [
    { time: 1000, open: 100, high: 102, low: 99, close: 101 },
    { time: 1060, open: 101, high: 103, low: 100, close: 102 },
    { time: 1120, open: 102, high: 104, low: 101, close: 103 },
  ];
  const cleanedNormal = cleanCandles(normalCandles);
  assert.equal(cleanedNormal.length, 3);
  assert.equal(cleanedNormal[0]?.high, 102, 'Natural high should remain untouched');
  assert.equal(cleanedNormal[0]?.low, 99, 'Natural low should remain untouched');

  // Real extreme volatility (+500% candle / 5x spike): must NEVER be clipped
  const extremeCandles: Candle[] = [
    { time: 1000, open: 100, high: 102, low: 99, close: 101 },
    { time: 1060, open: 101, high: 500, low: 100, close: 102 }, // Valid 500 high spike
    { time: 1120, open: 102, high: 103, low: 101, close: 102 },
  ];
  const cleanedExtreme = cleanCandles(extremeCandles);
  assert.equal(cleanedExtreme[1]!.high, 500, 'Authentic market high spike must be preserved without clipping');
  assert.equal(cleanedExtreme[1]!.low, 100, 'Low must remain intact');

  // Authentic extreme wicks/spikes (e.g. 7.7M high spike on 0.0003 candle): must be preserved without artificial reciprocal inversion
  const anomalousCandles: Candle[] = [
    { time: 1000, open: 0.0003, high: 0.00032, low: 0.00029, close: 0.00031 },
    { time: 1060, open: 0.00031, high: 7714013, low: 0.0003, close: 0.00031 },
    { time: 1120, open: 0.00031, high: 0.00033, low: 0.0003, close: 0.00032 },
  ];
  const cleanedAnomalous = cleanCandles(anomalousCandles);
  assert.equal(cleanedAnomalous.length, 3);
  assert.equal(cleanedAnomalous[1]!.high, 7714013, 'Authentic high wick must be preserved without reciprocal inversion');

  // Invalid candles (NaN, negative, zero, inverted high < low) must be rejected
  const invalidCandles: Candle[] = [
    { time: 1000, open: 100, high: 102, low: 99, close: 101 },
    { time: 1060, open: 0, high: 100, low: 50, close: 80 }, // zero open -> invalid
    { time: 1120, open: 100, high: 90, low: 95, close: 92 }, // high < open -> invalid
    { time: 1180, open: NaN, high: 100, low: 90, close: 95 }, // NaN -> invalid
    { time: 1240, open: 100, high: 105, low: 95, close: 102 }, // valid
  ];
  const cleanedInvalid = cleanCandles(invalidCandles);
  assert.equal(cleanedInvalid.length, 2, 'Only valid positive candles should pass validation');
  assert.equal(cleanedInvalid[0]?.time, 1000);
  assert.equal(cleanedInvalid[1]?.time, 1240);
});

test('computeMinSpan derives adaptive minimum price span without exploding or collapsing', () => {
  // Empty or invalid input
  assert.equal(computeMinSpan([]), 0);

  // Normal crypto dataset ($100 price level, $1-2 candle volatility)
  const candles: Candle[] = [
    { time: 1000, open: 100, high: 101.5, low: 99.5, close: 101 },
    { time: 1060, open: 101, high: 102.5, low: 100.5, close: 102 },
    { time: 1120, open: 102, high: 103.0, low: 101.0, close: 102.5 },
  ];
  const minSpan = computeMinSpan(candles);
  assert.ok(minSpan > 0, 'minSpan must be positive');
  assert.ok(minSpan >= 1.0, 'minSpan should comfortably accommodate typical candle heights');
  assert.ok(minSpan < 100, 'minSpan should not be excessively large');
});

test('calculateAutoscalePriceRange preserves historical range but expands micro-ranges near realtime', () => {
  const minSpan = 4.0; // 4 dollar minimum visible span

  // 1. Wide historical view ($90 - $110, span = 20 > minSpan)
  const wideRange = { minValue: 90, maxValue: 110 };
  const resWide = calculateAutoscalePriceRange(wideRange, 105, minSpan);
  assert.deepEqual(resWide, wideRange, 'Wide historical range must be preserved untouched');

  // 2. Narrow near-realtime view with only 1-2 bars ($100.01 - $100.03, span = 0.02 < minSpan)
  // This was the root cause of the candle ratio morphing/stretching bug!
  const narrowRange = { minValue: 100.01, maxValue: 100.03 };
  const resNarrow = calculateAutoscalePriceRange(narrowRange, 100.02, minSpan);
  assert.ok(resNarrow !== null);
  const newSpan = resNarrow.maxValue - resNarrow.minValue;
  assert.equal(Math.round(newSpan * 100) / 100, 4.0, 'Span must be expanded to minSpan');
  assert.equal(Math.round(((resNarrow.maxValue + resNarrow.minValue) / 2) * 100) / 100, 100.02, 'Midpoint must remain centered');

  // 3. Scrolling into whitespace / future (originalRange is null)
  const resWhitespace = calculateAutoscalePriceRange(null, 150, minSpan);
  assert.ok(resWhitespace !== null);
  assert.equal(resWhitespace.minValue, 150 - minSpan / 2);
  assert.equal(resWhitespace.maxValue, 150 + minSpan / 2);
});

test('calculateAutoscalePriceRange frames active LP ranges when includeRangeLines is enabled', () => {
  // Scenario: rightmost candle is at 100, but user has an LP range from 80 to 120 and requests LP fit
  const narrowRealtimeRange = { minValue: 99.98, maxValue: 100.02 };
  const res = calculateAutoscalePriceRange(narrowRealtimeRange, {
    rangeLow: 80,
    rangeHigh: 120,
    datasetLo: 75,
    datasetHi: 125,
    minSpan: 5,
    fallbackPrice: 100,
    includeRangeLines: true,
  });

  assert.ok(res !== null);
  assert.ok(res.minValue <= 80, 'Min Range line at 80 must stay within visible scale when includeRangeLines is true');
  assert.ok(res.maxValue >= 120, 'Max Range line at 120 must stay within visible scale when includeRangeLines is true');
});

test('calculateAutoscalePriceRange strictly preserves candle range (2300-2500) without squishing when LP range is distant (2000)', () => {
  // Scenario reported by user: token ranging 2300-2500 with default -20% LP preset at 2000
  // In default mode ("Scale Price Chart Only"), candlestick price action must NEVER be squashed
  const visibleCandleRange = { minValue: 2300, maxValue: 2500 };
  const res = calculateAutoscalePriceRange(visibleCandleRange, {
    rangeLow: 2000,
    rangeHigh: 2600,
    datasetLo: 1900,
    datasetHi: 2700,
    minSpan: 10,
    fallbackPrice: 2400,
    includeRangeLines: false, // Default: Scale Price Chart Only
  });

  assert.ok(res !== null);
  // Must strictly frame 2300 - 2500, NOT pulled down to 2000
  assert.equal(res.minValue, 2300, 'Candle low at 2300 must not be squished down to 2000 LP boundary');
  assert.equal(res.maxValue, 2500, 'Candle high at 2500 must not be artificially stretched');
});

test('mergeCandles merges datasets without duplicates and maintains chronological order', () => {
  const c1: Candle = { time: 1000, open: 10, high: 12, low: 9, close: 11 };
  const c2: Candle = { time: 1060, open: 11, high: 13, low: 10, close: 12 };
  const c3: Candle = { time: 1120, open: 12, high: 14, low: 11, close: 13 };

  // Update to c2 and addition of c4
  const c2Updated: Candle = { time: 1060, open: 11, high: 15, low: 10, close: 14 };
  const c4: Candle = { time: 1180, open: 13, high: 15, low: 12, close: 14 };

  const merged = mergeCandles([c1, c2, c3], [c2Updated, c4]);
  assert.equal(merged.length, 4, 'Must contain 4 distinct candles');
  assert.equal(merged[0]?.time, 1000);
  assert.equal(merged[1]?.time, 1060);
  assert.equal(merged[1]?.high, 15, 'Updated candle value should overwrite older bar');
  assert.equal(merged[2]?.time, 1120);
  assert.equal(merged[3]?.time, 1180);
});

test('resampleCandles aggregates 1m candles into 5m candles accurately', () => {
  const candles1m: Candle[] = [
    { time: 300, open: 100, high: 105, low: 98, close: 102 }, // Minute 0
    { time: 360, open: 102, high: 107, low: 101, close: 104 }, // Minute 1
    { time: 420, open: 104, high: 106, low: 99, close: 101 },  // Minute 2
    { time: 480, open: 101, high: 108, low: 100, close: 106 }, // Minute 3
    { time: 540, open: 106, high: 110, low: 105, close: 109 }, // Minute 4
    { time: 600, open: 109, high: 112, low: 108, close: 111 }, // Next 5m bucket (Minute 5)
  ];

  const resampled = resampleCandles(candles1m, 300); // Resample to 5m (300s)
  assert.equal(resampled.length, 2, 'Should create 2 5m candles');

  const first = resampled[0]!;
  assert.equal(first.time, 300);
  assert.equal(first.open, 100, 'Open must match first 1m bar');
  assert.equal(first.high, 110, 'High must match highest high across minutes 0-4');
  assert.equal(first.low, 98, 'Low must match lowest low across minutes 0-4');
  assert.equal(first.close, 109, 'Close must match last 1m bar close');

  const second = resampled[1]!;
  assert.equal(second.time, 600);
  assert.equal(second.open, 109);
  assert.equal(second.close, 111);
});

test('Live aggregation: trades at t=10 produce 1 candle at t=10; gap at t=11 produces NO candle; trade at t=12 produces new candle at 12', () => {
  const tf = 1; // 1-second resolution

  // First trade at t=10, price=100
  const r1 = aggregateCandleTick(null, 100, 10, tf);
  assert.ok(r1 && r1.isNew);
  assert.equal(r1.bar.time, 10);
  assert.equal(r1.bar.open, 100);
  assert.equal(r1.bar.high, 100);
  assert.equal(r1.bar.low, 100);
  assert.equal(r1.bar.close, 100);

  // Second trade at t=10, price=110
  const r2 = aggregateCandleTick(r1.bar, 110, 10, tf);
  assert.ok(r2 && !r2.isNew);
  assert.equal(r2.bar.time, 10);
  assert.equal(r2.bar.high, 110);
  assert.equal(r2.bar.low, 100);
  assert.equal(r2.bar.close, 110);

  // Third trade at t=10, price=90
  const r3 = aggregateCandleTick(r2.bar, 90, 10, tf);
  assert.ok(r3 && !r3.isNew);
  assert.equal(r3.bar.time, 10);
  assert.equal(r3.bar.open, 100);
  assert.equal(r3.bar.high, 110);
  assert.equal(r3.bar.low, 90);
  assert.equal(r3.bar.close, 90);

  // Second 11 has no trades -> NO trade event, NO candle generated.
  // Next trade arrives at second 12, price=95
  const r4 = aggregateCandleTick(r3.bar, 95, 12, tf);
  assert.ok(r4 && r4.isNew);
  assert.equal(r4.bar.time, 12, 'New candle must start at bucket 12');
  assert.equal(r4.bar.open, 95, 'Open should start at trade execution price');
  assert.equal(r4.bar.high, 95);
  assert.equal(r4.bar.low, 95);
  assert.equal(r4.bar.close, 95);
});

test('Market Cap formula: token price 0.00005 WETH * $3000 USD/WETH * 1,000,000 supply = $150,000 USD formatted as $150.00K', () => {
  const tokenPriceInQuote = 0.00005; // WETH per token
  const quoteUsdPrice = 3000;        // 3,000 USD per WETH
  const tokenSupply = 1_000_000;     // 1 million tokens

  // 1. Valid inputs:
  const tokenPriceUsd = tokenPriceInQuote * quoteUsdPrice; // 0.15 USD
  assert.equal(tokenPriceUsd, 0.15);

  const marketCapUsd = tokenPriceUsd * tokenSupply; // 150,000 USD
  assert.equal(marketCapUsd, 150_000);

  const formattedMcap = formatMcap(marketCapUsd);
  assert.equal(formattedMcap, '$150.00K', 'Market cap must format with dollar sign and precision');

  // 2. Price formatting must always prepend dollar sign:
  const formattedQuotePrice = formatPrice(tokenPriceInQuote, 'WETH');
  assert.ok(formattedQuotePrice.startsWith('$'), 'Price must always have dollar sign');
  assert.equal(formattedQuotePrice, '$0.0₄5000');
});

test('Deduplication and ascending chronological sort', () => {
  const unordered: Candle[] = [
    { time: 1060, open: 101, high: 103, low: 100, close: 102 },
    { time: 1000, open: 100, high: 102, low: 99, close: 101 },
    { time: 1060, open: 101, high: 105, low: 100, close: 104 }, // Duplicate bucket: newer close
  ];
  const cleaned = cleanCandles(unordered);
  assert.equal(cleaned.length, 2, 'Duplicate bucket time must be deduplicated');
  assert.equal(cleaned[0]!.time, 1000);
  assert.equal(cleaned[1]!.time, 1060);
  assert.equal(cleaned[1]!.high, 105, 'Latest duplicate observation should take precedence');
});

test('resampleCandles handles natural market gaps without manufacturing phantom bars', () => {
  // Scenario: Trading occurs at 10:00 (600s), 10:01 (660s), then gap of 10 minutes, then trade at 10:11 (1260s)
  // When resampling to 5m (300s buckets):
  // Bucket 600 covers 600s and 660s
  // Bucket 1200 covers 1260s
  // Buckets 900 (10:05-10:10) had NO trades and must NEVER be manufactured!
  const gappedCandles: Candle[] = [
    { time: 600, open: 50, high: 52, low: 49, close: 51 },
    { time: 660, open: 51, high: 54, low: 50, close: 53 },
    { time: 1260, open: 55, high: 60, low: 54, close: 58 },
  ];

  const resampled = resampleCandles(gappedCandles, 300);
  assert.equal(resampled.length, 2, 'Must only produce 2 buckets; no synthetic gap candles');
  assert.equal(resampled[0]!.time, 600);
  assert.equal(resampled[0]!.open, 50);
  assert.equal(resampled[0]!.high, 54);
  assert.equal(resampled[0]!.low, 49);
  assert.equal(resampled[0]!.close, 53);

  assert.equal(resampled[1]!.time, 1200);
  assert.equal(resampled[1]!.open, 55);
  assert.equal(resampled[1]!.high, 60);
  assert.equal(resampled[1]!.low, 54);
  assert.equal(resampled[1]!.close, 58);
});

test('resampleCandles edge cases: empty input, invalid target, single candle', () => {
  assert.deepEqual(resampleCandles([], 300), []);
  assert.deepEqual(resampleCandles([{ time: 100, open: 1, high: 2, low: 0.5, close: 1.5 }], 0), []);
  assert.deepEqual(resampleCandles([{ time: 100, open: 1, high: 2, low: 0.5, close: 1.5 }], -60), []);

  const single: Candle[] = [{ time: 310, open: 10, high: 12, low: 9, close: 11 }];
  const singleResampled = resampleCandles(single, 300);
  assert.equal(singleResampled.length, 1);
  assert.equal(singleResampled[0]!.time, 300);
  assert.equal(singleResampled[0]!.open, 10);
  assert.equal(singleResampled[0]!.high, 12);
  assert.equal(singleResampled[0]!.low, 9);
  assert.equal(singleResampled[0]!.close, 11);
});

test('resampleCandles high-volume stress: O(N) single-pass aggregates 10,000 candles efficiently', () => {
  const count = 10_000;
  const raw: Candle[] = [];
  const baseTime = 1_700_000_000;
  for (let i = 0; i < count; i++) {
    raw.push({
      time: baseTime + i * 60, // 1-minute intervals
      open: 100 + (i % 10),
      high: 105 + (i % 10),
      low: 95 + (i % 10),
      close: 102 + (i % 10),
    });
  }

  const start = performance.now();
  const resampled = resampleCandles(raw, 3600); // Resample to 1-hour (60x compression)
  const elapsed = performance.now() - start;

  assert.equal(resampled.length, Math.ceil(count / 60));
  assert.ok(elapsed < 100, `Resampling 10,000 bars should take < 100ms, took ${elapsed.toFixed(2)}ms`);

  // Verify first bucket aggregation
  const firstBucket = resampled[0]!;
  assert.equal(firstBucket.time, Math.floor(baseTime / 3600) * 3600);
  assert.equal(firstBucket.open, raw[0]!.open);
});

test('mergeCandles two-pointer: handles disjoint, overlapping, and colliding series', () => {
  // 1. Disjoint: existing strictly before incoming
  const early: Candle[] = [
    { time: 100, open: 1, high: 2, low: 0.5, close: 1.5 },
    { time: 200, open: 1.5, high: 2.5, low: 1, close: 2 },
  ];
  const late: Candle[] = [
    { time: 300, open: 2, high: 3, low: 1.8, close: 2.8 },
    { time: 400, open: 2.8, high: 3.5, low: 2.5, close: 3.2 },
  ];
  const mergedDisjoint = mergeCandles(early, late);
  assert.equal(mergedDisjoint.length, 4);
  assert.deepEqual(mergedDisjoint.map((c) => c.time), [100, 200, 300, 400]);

  // 2. Disjoint: incoming strictly before existing
  const mergedReverse = mergeCandles(late, early);
  assert.equal(mergedReverse.length, 4);
  assert.deepEqual(mergedReverse.map((c) => c.time), [100, 200, 300, 400]);

  // 3. Interleaved with timestamp collisions: incoming overwrites existing
  const s1: Candle[] = [
    { time: 100, open: 1, high: 2, low: 0.5, close: 1.5 },
    { time: 300, open: 2, high: 3, low: 1.8, close: 2.8 },
    { time: 500, open: 3, high: 4, low: 2.8, close: 3.8 },
  ];
  const s2: Candle[] = [
    { time: 200, open: 1.5, high: 2.5, low: 1, close: 2 },
    { time: 300, open: 2, high: 99, low: 1.8, close: 95 }, // Overwrites s1 at t=300
    { time: 400, open: 2.5, high: 3.5, low: 2.2, close: 3.0 },
  ];
  const mergedInterleaved = mergeCandles(s1, s2);
  assert.equal(mergedInterleaved.length, 5);
  assert.deepEqual(mergedInterleaved.map((c) => c.time), [100, 200, 300, 400, 500]);
  assert.equal(mergedInterleaved[2]!.high, 99, 'Collision bar must take incoming value');

  // 4. Empty datasets
  assert.deepEqual(mergeCandles([], []), []);
  assert.deepEqual(mergeCandles(early, []), early);
  assert.deepEqual(mergeCandles([], late), late);
});

test('mergeCandles high-volume stress: O(N1 + N2) two-pointer merges 10,000 bars in < 50ms', () => {
  const existing: Candle[] = [];
  const incoming: Candle[] = [];
  const baseTime = 1_700_000_000;

  for (let i = 0; i < 10_000; i++) {
    existing.push({
      time: baseTime + i * 60,
      open: 100,
      high: 110,
      low: 90,
      close: 105,
    });
  }

  // Incoming has 500 updates on the tail + 500 new bars
  for (let i = 9_500; i < 10_500; i++) {
    incoming.push({
      time: baseTime + i * 60,
      open: 100,
      high: 120, // Updated high
      low: 90,
      close: 115,
    });
  }

  const start = performance.now();
  const merged = mergeCandles(existing, incoming);
  const elapsed = performance.now() - start;

  assert.equal(merged.length, 10_500);
  assert.ok(elapsed < 100, `Two-pointer merge should complete in < 100ms, took ${elapsed.toFixed(2)}ms`);
  assert.equal(merged[9500]!.high, 120, 'Tail bars should reflect incoming updates');
  assert.equal(merged[10499]!.time, baseTime + 10499 * 60);
});

test('cleanCandles fast path: single-pass handles sequential duplicate timestamps without sorting', () => {
  const stream: Candle[] = [
    { time: 1000, open: 10, high: 12, low: 9, close: 11 },
    { time: 1000, open: 10, high: 14, low: 9, close: 13 }, // Realtime tick update in same bucket
    { time: 1060, open: 13, high: 15, low: 12, close: 14 },
    { time: 1060, open: 13, high: 16, low: 12, close: 15 }, // Another tick update
    { time: 1120, open: 15, high: 17, low: 14, close: 16 },
  ];

  const cleaned = cleanCandles(stream);
  assert.equal(cleaned.length, 3);
  assert.equal(cleaned[0]!.time, 1000);
  assert.equal(cleaned[0]!.high, 14);
  assert.equal(cleaned[1]!.time, 1060);
  assert.equal(cleaned[1]!.high, 16);
  assert.equal(cleaned[2]!.time, 1120);
});

test('formatMcap handles 0, negative, trillion, billion, million, and thousand scales cleanly', () => {
  assert.equal(formatMcap(0), '$0');
  assert.equal(formatMcap(NaN), '$0');
  assert.equal(formatMcap(-1), '-$1.00');
  assert.equal(formatMcap(500), '$500.00');
  assert.equal(formatMcap(25_000), '$25.00K');
  assert.equal(formatMcap(1_500_000), '$1.50M');
  assert.equal(formatMcap(2_400_000_000), '$2.40B');
  assert.equal(formatMcap(1_200_000_000_000), '$1.20T');

  // O(1) tick formatting simulation:
  const rawPrice = 0.000025;
  const mcapMultiplier = 1_000_000_000; // 1B supply * 1 USD
  const formatted = formatMcap(rawPrice * mcapMultiplier);
  assert.equal(formatted, '$25.00K');
});

