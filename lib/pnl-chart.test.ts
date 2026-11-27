import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  buildCumulativePnlTimeline,
  formatDayKeyWithOffset,
  resolveAnchorDayKey,
  stepBackDays,
  DEFAULT_OPERATOR_TZ_OFFSET_MIN,
} from './pnl-chart.js';

test('DEFAULT_OPERATOR_TZ_OFFSET_MIN is 420 minutes (UTC+7 / Jakarta)', () => {
  assert.equal(DEFAULT_OPERATOR_TZ_OFFSET_MIN, 420);
});

test('formatDayKeyWithOffset respects explicit timezone offsets', () => {
  // 2026-09-15 20:00:00 UTC is 2026-09-16 03:00:00 in Jakarta (UTC+7 / 420 mins)
  const utcEvening = Date.parse('2026-09-15T20:00:00Z');
  assert.equal(formatDayKeyWithOffset(utcEvening, 420), '2026-09-16');

  // In UTC (0 mins offset), it is still 2026-09-15
  assert.equal(formatDayKeyWithOffset(utcEvening, 0), '2026-09-15');

  // In New York (UTC-4 / -240 mins), it is 2026-09-15 16:00
  assert.equal(formatDayKeyWithOffset(utcEvening, -240), '2026-09-15');
});

test('stepBackDays handles month boundaries and leap years deterministically', () => {
  // 7 days ending on 2026-09-03 steps back into August
  const sepDays = stepBackDays('2026-09-03', 5);
  assert.deepEqual(sepDays, [
    '2026-08-30',
    '2026-08-31',
    '2026-09-01',
    '2026-09-02',
    '2026-09-03',
  ]);

  // Year boundary: ending on 2026-01-02 steps back into 2025
  const yearDays = stepBackDays('2026-01-02', 4);
  assert.deepEqual(yearDays, [
    '2025-12-30',
    '2025-12-31',
    '2026-01-01',
    '2026-01-02',
  ]);

  // Leap year: 2024 was a leap year, March 2 steps back across Feb 29
  const leapDays = stepBackDays('2024-03-02', 4);
  assert.deepEqual(leapDays, [
    '2024-02-28',
    '2024-02-29',
    '2024-03-01',
    '2024-03-02',
  ]);
});

test('resolveAnchorDayKey enforces server authority and blocks client clock manipulation', () => {
  // Case 1: Server explicitly provides todayKey: '2026-09-16'.
  // Client local clock is manipulated by user to 2030 (skewed forward by 4 years).
  const manipulatedClientNow = Date.parse('2030-05-20T12:00:00Z');
  const resolved = resolveAnchorDayKey({
    todayKey: '2026-09-16',
    fallbackTimestamp: manipulatedClientNow,
  });
  // Server todayKey must be used, completely ignoring the manipulated client clock!
  assert.equal(resolved, '2026-09-16');

  // Case 2: todayKey not provided, but serverTime is provided (authoritative server clock).
  // Client clock is manipulated to 2020 (skewed backward).
  const authoritativeServerTime = Date.parse('2026-09-16T04:00:00Z'); // 11:00 AM Jakarta
  const resolvedFromTimestamp = resolveAnchorDayKey({
    serverTime: authoritativeServerTime,
    tzOffsetMin: 420,
    fallbackTimestamp: Date.parse('2020-01-01T00:00:00Z'),
  });
  assert.equal(resolvedFromTimestamp, '2026-09-16');

  // Case 3: Configured operator timezone changes (e.g. operator configured UTC+8 / 480 mins)
  const serverEvening = Date.parse('2026-09-15T16:30:00Z');
  // At UTC 16:30, UTC+7 is 23:30 (2026-09-15), but UTC+8 is 00:30 (2026-09-16)
  assert.equal(resolveAnchorDayKey({ serverTime: serverEvening, tzOffsetMin: 420 }), '2026-09-15');
  assert.equal(resolveAnchorDayKey({ serverTime: serverEvening, tzOffsetMin: 480 }), '2026-09-16');
});

test('buildCumulativePnlTimeline does not reset net to 0 when shifting days with zero activity', () => {
  // Server anchor day is 2026-09-16
  const pnlMap = new Map<string, number>([
    ['2026-09-14', 50],
    ['2026-09-15', 100],
    // 2026-09-16 has zero trades closed so far
  ]);

  const timeline = buildCumulativePnlTimeline(7, pnlMap, '2026-09-16');

  assert.equal(timeline.length, 7);

  // Today is the last element
  const todayPoint = timeline[6]!;
  assert.equal(todayPoint.day, '2026-09-16');
  assert.equal(todayPoint.dailyNet, 0);
  assert.equal(todayPoint.profit, 0);
  assert.equal(todayPoint.loss, 0);

  // Critical fix: cumulative net PnL remains $150 and does NOT reset to 0!
  assert.equal(todayPoint.net, 150);
  assert.equal(todayPoint.cumulative, 150);

  // Yesterday point
  const yesterdayPoint = timeline[5]!;
  assert.equal(yesterdayPoint.day, '2026-09-15');
  assert.equal(yesterdayPoint.dailyNet, 100);
  assert.equal(yesterdayPoint.net, 150);

  // Day before yesterday
  const dayBeforePoint = timeline[4]!;
  assert.equal(dayBeforePoint.day, '2026-09-14');
  assert.equal(dayBeforePoint.dailyNet, 50);
  assert.equal(dayBeforePoint.net, 50);
});

test('buildCumulativePnlTimeline preserves running cumulative across profit, loss, and quiet days', () => {
  const pnlMap = new Map<string, number>([
    ['2026-09-16', 200], // +200
    ['2026-09-17', 0],   // quiet day -> stays 200
    ['2026-09-18', -50], // loss -> 150
    ['2026-09-19', 100], // profit -> 250
    ['2026-09-20', -20], // loss -> 230
  ]);

  const timeline = buildCumulativePnlTimeline(5, pnlMap, {
    todayKey: '2026-09-20',
  });
  assert.equal(timeline.length, 5);

  assert.deepEqual(timeline.map((t) => t.day), [
    '2026-09-16',
    '2026-09-17',
    '2026-09-18',
    '2026-09-19',
    '2026-09-20',
  ]);

  assert.deepEqual(timeline.map((t) => t.dailyNet), [200, 0, -50, 100, -20]);
  assert.deepEqual(timeline.map((t) => t.net), [200, 200, 150, 250, 230]);
  assert.deepEqual(timeline.map((t) => t.profit), [200, 0, 0, 100, 0]);
  assert.deepEqual(timeline.map((t) => t.loss), [0, 0, 50, 0, 20]);
});

test('buildCumulativePnlTimeline handles completely empty activity cleanly', () => {
  const emptyMap = new Map<string, number>();

  const timeline = buildCumulativePnlTimeline(7, emptyMap, '2026-09-16');
  assert.equal(timeline.length, 7);

  for (const point of timeline) {
    assert.equal(point.dailyNet, 0);
    assert.equal(point.net, 0);
    assert.equal(point.cumulative, 0);
    assert.equal(point.profit, 0);
    assert.equal(point.loss, 0);
  }
});
