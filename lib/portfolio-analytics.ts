import type { DayStats, WebPosition } from './types';
import { formatDayKeyWithOffset } from './pnl-chart';

export const EMPTY_MONTH = { totalPnl: 0, totalVolume: 0, totalFees: 0, greenCount: 0, redCount: 0, peakPnl: 1e-9 };

export function indexCalendar<T extends { closedAt: number }>(records: readonly DayStats[], trades: readonly T[], offset: number) {
  const days = new Map<string, DayStats>();
  const months = new Map<string, typeof EMPTY_MONTH>();
  const tradesByDay = new Map<string, T[]>();
  for (const d of records) {
    days.set(d.day, d);
    const key = d.day.slice(0, 7);
    const month = months.get(key) ?? { ...EMPTY_MONTH };
    month.totalPnl += d.pnlUsd;
    month.totalVolume += d.volumeUsd;
    month.totalFees += d.feesPaidUsd;
    month.greenCount += Number(d.pnlUsd > 0);
    month.redCount += Number(d.pnlUsd < 0);
    month.peakPnl = Math.max(month.peakPnl, Math.abs(d.pnlUsd));
    months.set(key, month);
  }
  for (const t of trades) {
    const key = formatDayKeyWithOffset(t.closedAt, offset);
    const group = tradesByDay.get(key) ?? [];
    group.push(t);
    tradesByDay.set(key, group);
  }
  return { days, months, tradesByDay };
}

/** Disjoint health buckets, shared by badges, meters and fee actions. O(n). */
export function indexPositionHealth<T extends Pick<WebPosition, 'exists' | 'inRange' | 'rangePos' | 'totalUsd' | 'feesUsd'>>(positions: readonly T[]) {
  const claimable: T[] = [], nearBoundary: T[] = [], outOfRange: T[] = [];
  let activeUsd = 0, boundaryUsd = 0, outUsd = 0, activeCount = 0;
  let largestFeePosition: T | null = null;
  for (const p of positions) {
    if (!p.exists) continue;
    if (p.feesUsd > 0) {
      claimable.push(p);
      if (!largestFeePosition || p.feesUsd > largestFeePosition.feesUsd) largestFeePosition = p;
    }
    if (!p.inRange) { outOfRange.push(p); outUsd += p.totalUsd; }
    else if (p.rangePos < 0.2 || p.rangePos > 0.8) { nearBoundary.push(p); boundaryUsd += p.totalUsd; }
    else { activeUsd += p.totalUsd; activeCount++; }
  }
  return { claimable, nearBoundary, outOfRange, activeUsd, boundaryUsd, outUsd, activeCount, largestFeePosition };
}
