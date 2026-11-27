/**
 * High-performance, mathematically rigorous candlestick utilities.
 * SOTA O(N) algorithms with minimal heap allocations and zero synthetic fabrication.
 */

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  trades?: number;
  source?: string;
  currency?: string;
}

export const V2_SUPPORTED_TIMEFRAMES = new Set(['1m', '5m', '15m', '1h', '4h', '1d']);

export const isV2SupportedTimeframe = (interval: string): boolean => {
  return V2_SUPPORTED_TIMEFRAMES.has(interval);
};

export const isPoolMatch = (a?: string | null, b?: string | null): boolean => {
  if (!a || !b) return false;
  const aNorm = a.toLowerCase();
  const bNorm = b.toLowerCase();
  if (aNorm === bNorm) return true;
  const aClean = aNorm.includes(':') ? aNorm.split(':').pop()! : aNorm;
  const bClean = bNorm.includes(':') ? bNorm.split(':').pop()! : bNorm;
  return aClean === bClean || aNorm.includes(bClean) || bNorm.includes(aClean);
};

export interface V2CandleDto {
  bucket: number | string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volumeUsd?: number | string;
  tradesCount?: number | string;
  isClosed?: boolean;
}

export const mapV2Candles = (rows: V2CandleDto[]): Candle[] => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.map((c) => ({
    time: Number(c.bucket),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Number(c.volumeUsd ?? 0),
    trades: Number(c.tradesCount ?? 0),
    source: 'v2',
    currency: 'USD',
  }));
};

/**
 * Validates and sanitizes candlestick data in O(N) single-pass.
 * Financial Invariants:
 * - Time > 0
 * - Open, High, Low, Close > 0
 * - High >= max(open, close)
 * - Low <= min(open, close)
 * - High >= Low
 * - Unique timestamps, sorted ascending
 * Never amputates real volatility, launch candles, or price wicks.
 */
export const cleanCandles = (candles: Candle[]): Candle[] => {
  if (!candles || candles.length === 0) return [];
  const len = candles.length;
  const result: Candle[] = [];
  let isStrictlySorted = true;
  let hasDuplicates = false;
  let prevTime = -1;

  for (let i = 0; i < len; i++) {
    const c = candles[i];
    if (!c) continue;
    const time = Math.floor(Number(c.time));
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    const volume = Number(c.volume ?? 0);
    const trades =
      c.trades !== undefined && Number.isFinite(Number(c.trades))
        ? Math.max(0, Math.floor(Number(c.trades)))
        : undefined;
    const source = typeof c.source === 'string' ? c.source : undefined;
    const currency = typeof c.currency === 'string' ? c.currency : undefined;

    // Reject non-finite, non-positive, or physically impossible OHLC relations
    if (
      !Number.isFinite(time) ||
      time <= 0 ||
      !Number.isFinite(open) ||
      open <= 0 ||
      !Number.isFinite(high) ||
      high <= 0 ||
      !Number.isFinite(low) ||
      low <= 0 ||
      !Number.isFinite(close) ||
      close <= 0 ||
      high < low ||
      high < open ||
      high < close ||
      low > open ||
      low > close
    ) {
      continue;
    }

    if (time <= prevTime) {
      if (time === prevTime) {
        hasDuplicates = true;
      } else {
        isStrictlySorted = false;
      }
    }
    prevTime = time;
    result.push({
      time,
      open,
      high,
      low,
      close,
      volume,
      ...(trades !== undefined ? { trades } : {}),
      ...(source ? { source } : {}),
      ...(currency ? { currency } : {}),
    });
  }

  const validLen = result.length;
  if (validLen <= 1) return result;

  // Fast path: pure strictly increasing timestamps (99.9% of all production data)
  // Single-pass O(N) with zero extra allocations, zero sorts, zero Map hashing.
  if (isStrictlySorted && !hasDuplicates) {
    return result;
  }

  // If monotonic non-decreasing with occasional duplicate timestamps:
  if (isStrictlySorted && hasDuplicates) {
    const deduped: Candle[] = [];
    for (let i = 0; i < validLen; i++) {
      const c = result[i]!;
      if (deduped.length > 0 && deduped[deduped.length - 1]!.time === c.time) {
        deduped[deduped.length - 1] = c;
      } else {
        deduped.push(c);
      }
    }
    return deduped;
  }

  // Rare out-of-order fallback: stable sort + deduplication
  result.sort((a, b) => a.time - b.time);
  const deduped: Candle[] = [];
  for (let i = 0; i < validLen; i++) {
    const c = result[i]!;
    if (deduped.length > 0 && deduped[deduped.length - 1]!.time === c.time) {
      deduped[deduped.length - 1] = c;
    } else {
      deduped.push(c);
    }
  }
  return deduped;
};

/**
 * Computes an adaptive minimum price span based on candlestick volatility.
 * Prevents the chart from zooming in into micro-spread noise when panning
 * into near-realtime or empty space, while ensuring natural candle height
 * and authentic price proportions.
 */
export const computeMinSpan = (candles: Candle[]): number => {
  if (!candles || candles.length === 0) return 0;
  const valid = candles.filter((c) => c.open > 0 && c.close > 0 && c.high > 0 && c.low > 0);
  if (valid.length === 0) return 0;

  const candleSpans = valid.map((c) => Math.max(c.high - c.low, Math.abs(c.close - c.open))).filter((s) => s > 0);
  if (!candleSpans.length) return 0;
  candleSpans.sort((a, b) => a - b);
  const medianSpan = candleSpans[Math.floor(candleSpans.length / 2)] || 0;

  const latest = valid[valid.length - 1]?.close || 1;

  // Adapt to local volatility: 1.5x median body/span or 0.2% of price.
  // Never blow up by 25% of the entire 30-day historical dataset.
  return Math.max(
    medianSpan * 1.5,
    latest > 0 ? latest * 0.002 : 0,
    1e-8,
  );
};

/**
 * Merges new candle bars into an existing array of candles in O(N1 + N2) linear time.
 * - Two-pointer merge algorithm (MergeSort standard)
 * - Deduplicates by timestamp
 * - Maintains ascending chronological order
 * - Overwrites overlapping or newer bars with the latest incoming data
 */
export const mergeCandles = (existing: Candle[], incoming: Candle[]): Candle[] => {
  if (!existing || existing.length === 0) return incoming ?? [];
  if (!incoming || incoming.length === 0) return existing ?? [];

  const eClean = cleanCandles(existing);
  const inClean = cleanCandles(incoming);

  const n1 = eClean.length;
  const n2 = inClean.length;

  const merged: Candle[] = [];
  let i = 0;
  let j = 0;

  while (i < n1 && j < n2) {
    const e = eClean[i]!;
    const inc = inClean[j]!;

    if (e.time < inc.time) {
      merged.push(e);
      i++;
    } else if (inc.time < e.time) {
      merged.push(inc);
      j++;
    } else {
      // Collision at the same timestamp: preserve live bar extremes so stale HTTP reads don't truncate wicks or regress close
      const isLatestBar = i === n1 - 1;
      if (isLatestBar) {
        merged.push({
          ...inc,
          close: e.close && e.close > 0 ? e.close : inc.close,
          high: Math.max(e.high, inc.high),
          low: Math.min(e.low, inc.low),
          volume: Math.max(e.volume ?? 0, inc.volume ?? 0),
          trades: Math.max(e.trades ?? 0, inc.trades ?? 0),
          source: inc.source ?? e.source,
          currency: inc.currency ?? e.currency,
        });
      } else {
        merged.push({
          ...inc,
          volume: inc.volume ?? e.volume,
          trades: inc.trades ?? e.trades,
          source: inc.source ?? e.source,
          currency: inc.currency ?? e.currency,
        });
      }
      i++;
      j++;
    }
  }

  while (i < n1) {
    merged.push(eClean[i]!);
    i++;
  }

  while (j < n2) {
    merged.push(inClean[j]!);
    j++;
  }

  return merged;
};

/**
 * Resamples candlestick data from a lower timeframe to a higher timeframe in pure O(N) linear time.
 * E.g., merges 60s candles into 300s (5m) or 3600s (1h) candles.
 * Single-pass linear scan grouping into target buckets Math.floor(c.time / targetSeconds) * targetSeconds.
 * Accumulates Open, High, Low, Close, Volume, and Trades without Map, without hashing, and without .sort().
 * Mathematically exact:
 * - Bucket = Math.floor(time / targetSeconds) * targetSeconds
 * - Open = first bar's open
 * - High = max(highs)
 * - Low = min(lows)
 * - Close = last bar's close
 * - Volume = sum(volumes)
 * - Trades = sum(trades)
 * - Downsampling guard: coarse bars cannot be relabeled/downsampled into finer intervals
 */
export const resampleCandles = (
  candles: Candle[],
  targetSeconds: number,
  sourceSeconds?: number,
): Candle[] => {
  if (!candles || !candles.length || targetSeconds <= 0) return [];
  if (sourceSeconds !== undefined && sourceSeconds > targetSeconds) return [];

  const valid = cleanCandles(candles);
  const n = valid.length;
  if (n === 0) return [];

  // Downsampling prevention: if candle timestamps have spacing greater than targetSeconds,
  // coarse bars must never be relabeled/downsampled into finer intervals
  if (n >= 2) {
    let minDelta = Infinity;
    for (let i = 1; i < n; i++) {
      const diff = valid[i]!.time - valid[i - 1]!.time;
      if (diff > 0 && diff < minDelta) {
        minDelta = diff;
      }
    }
    if (minDelta !== Infinity && targetSeconds < minDelta) {
      return [];
    }
  }

  const result: Candle[] = [];

  const first = valid[0]!;
  let currentBucketTime = Math.floor(first.time / targetSeconds) * targetSeconds;
  let currentOpen = first.open;
  let currentHigh = first.high;
  let currentLow = first.low;
  let currentClose = first.close;
  let currentVolume = first.volume ?? 0;
  let currentTrades = first.trades ?? 0;
  const currentSource = first.source;
  const currentCurrency = first.currency;

  for (let i = 1; i < n; i++) {
    const c = valid[i]!;
    const bucket = Math.floor(c.time / targetSeconds) * targetSeconds;

    if (bucket === currentBucketTime) {
      if (c.high > currentHigh) currentHigh = c.high;
      if (c.low < currentLow) currentLow = c.low;
      currentClose = c.close;
      currentVolume += c.volume ?? 0;
      currentTrades += c.trades ?? 0;
    } else {
      result.push({
        time: currentBucketTime,
        open: currentOpen,
        high: currentHigh,
        low: currentLow,
        close: currentClose,
        volume: currentVolume,
        trades: currentTrades,
        ...(currentSource ? { source: currentSource } : {}),
        ...(currentCurrency ? { currency: currentCurrency } : {}),
      });
      currentBucketTime = bucket;
      currentOpen = c.open;
      currentHigh = c.high;
      currentLow = c.low;
      currentClose = c.close;
      currentVolume = c.volume ?? 0;
      currentTrades = c.trades ?? 0;
    }
  }

  // Push the final accumulated bucket
  result.push({
    time: currentBucketTime,
    open: currentOpen,
    high: currentHigh,
    low: currentLow,
    close: currentClose,
    volume: currentVolume,
    trades: currentTrades,
    ...(currentSource ? { source: currentSource } : {}),
    ...(currentCurrency ? { currency: currentCurrency } : {}),
  });

  return result;
};
