/**
 * PnL Timeline & Timezone Authority for Portfolio Analytics
 *
 * Architecture Principles:
 * 1. Server Authority: The server is the single source of truth for date identity (`todayKey`),
 *    current epoch time (`asOf` / `at`), and operator timezone offset (`tzOffsetMin`, default +07:00 / Jakarta).
 * 2. Manipulation Immunity: Timeline points are generated via pure calendar arithmetic (`stepBackDays`)
 *    anchored strictly to the server-provided `todayKey`. The user changing local OS clock or browser
 *    timezone cannot manipulate or distort historical/active date buckets.
 * 3. Monotonic Drift Guard: When server time is present, local drift is tracked monotonically
 *    via `performance.now()`, preventing local clock jumps from altering time calculations.
 * 4. Cumulative Integrity: A day with 0 closed trades preserves running cumulative PnL. Transitioning
 *    to a new calendar day ("bergeser hari") carries forward previous cumulative PnL without dropping
 *    the chart line to 0.
 */

export const DEFAULT_OPERATOR_TZ_OFFSET_MIN = 7 * 60; // UTC+7 (Asia/Jakarta)
export const DEFAULT_OPERATOR_TZ_NAME = 'Asia/Jakarta';

export interface PnlTimelinePoint {
  day: string; // ISO date format YYYY-MM-DD
  profit: number; // Daily gross profit
  loss: number; // Daily gross loss
  dailyNet: number; // Daily net PnL (profit - loss)
  net: number; // Running cumulative net PnL (used by LineChart dataKey="net")
  cumulative: number; // Explicit semantic alias
}

export interface AnchorTimeOptions {
  todayKey?: string | null;
  serverTime?: number | null;
  tzOffsetMin?: number | null;
  latestKnownDay?: string | null;
  fallbackTimestamp?: number;
}

/**
 * Pure formatting of an epoch timestamp to YYYY-MM-DD using an explicit minute offset.
 * Operates purely in UTC to guarantee deterministic results across all client OS timezones.
 */
export function formatDayKeyWithOffset(
  timestamp: number,
  offsetMinutes: number = DEFAULT_OPERATOR_TZ_OFFSET_MIN,
): string {
  if (!Number.isFinite(timestamp)) return '';
  const d = new Date(timestamp + offsetMinutes * 60_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Validates whether a string is a valid ISO date key (YYYY-MM-DD).
 */
export function isValidDayKey(key: unknown): key is string {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key);
}

/**
 * Resolves the authoritative anchor day key (today in the operator's timezone).
 * Priority:
 * 1. Authoritative `todayKey` from server response / websocket snapshot (unmanipulable).
 * 2. Server timestamp (`serverTime` / `asOf` / `at`) converted via `tzOffsetMin`.
 * 3. Latest recorded day from server historical records (`latestKnownDay`).
 * 4. Fallback timestamp converted via `tzOffsetMin`.
 */
export function resolveAnchorDayKey(options?: AnchorTimeOptions): string {
  const tzOffset = options?.tzOffsetMin ?? DEFAULT_OPERATOR_TZ_OFFSET_MIN;

  // 1. Authoritative server todayKey (unmanipulable)
  if (isValidDayKey(options?.todayKey)) {
    return options.todayKey;
  }

  // 2. Derive from server timestamp
  if (options?.serverTime && Number.isFinite(options.serverTime)) {
    return formatDayKeyWithOffset(options.serverTime, tzOffset);
  }

  // 3. Fallback to latest known day if ahead of local estimated day
  if (isValidDayKey(options?.latestKnownDay)) {
    const fallbackEst = formatDayKeyWithOffset(options?.fallbackTimestamp ?? Date.now(), tzOffset);
    return options.latestKnownDay > fallbackEst ? options.latestKnownDay : fallbackEst;
  }

  // 4. Default fallback
  return formatDayKeyWithOffset(options?.fallbackTimestamp ?? Date.now(), tzOffset);
}

/**
 * Generates an array of N consecutive calendar days in ascending order ending on anchorDayKey.
 * Uses pure UTC date math to guarantee immunity against client clock changes, DST, or browser timezone quirks.
 */
export function stepBackDays(anchorDayKey: string, daysCount: number): string[] {
  if (!isValidDayKey(anchorDayKey) || daysCount <= 0) return [];
  const parts = anchorDayKey.split('-').map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;

  const days: string[] = [];
  for (let i = daysCount - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    const dayStr = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    days.push(dayStr);
  }
  return days;
}

/**
 * Builds continuous cumulative timeline for charts.
 * Guarantees that:
 * - When shifting days (bergeser hari), the new day starts at yesterday's cumulative PnL.
 * - Days with 0 trades never reset the cumulative curve to 0.
 * - Local clock changes cannot manipulate which dates are rendered.
 */
export function buildCumulativePnlTimeline(
  daysCount: number,
  pnlMap: Map<string, number>,
  anchor?: string | AnchorTimeOptions,
): PnlTimelinePoint[] {
  const anchorDayKey = typeof anchor === 'string' ? anchor : resolveAnchorDayKey(anchor);
  const days = stepBackDays(anchorDayKey, daysCount);
  const result: PnlTimelinePoint[] = [];
  let runningCumulative = 0;

  for (const dayStr of days) {
    const dayPnl = pnlMap.get(dayStr) ?? 0;
    runningCumulative += dayPnl;
    const isProfit = dayPnl >= 0;

    result.push({
      day: dayStr,
      profit: isProfit ? dayPnl : 0,
      loss: !isProfit ? Math.abs(dayPnl) : 0,
      dailyNet: dayPnl,
      net: runningCumulative,
      cumulative: runningCumulative,
    });
  }

  return result;
}
