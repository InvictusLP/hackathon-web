'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { CardDialog } from '@/components/app/card-dialog';
import { usePortfolioAction } from '@/components/app/portfolio-action-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useFetch } from '@/lib/use-live';
import { useSnapshot } from '@/components/app/live';
import {
  DEFAULT_OPERATOR_TZ_OFFSET_MIN,
  formatDayKeyWithOffset,
  resolveAnchorDayKey,
} from '@/lib/pnl-chart';
import { duration, signedPct, signedUsd, toneClass, usd } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CalendarSkeleton } from '@/components/app/calendar-skeleton';
import type { CalendarPayload, DayStats, PnlPayload } from '@/lib/types';

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const MONTH_NAMES = [
  { value: '01', label: 'Jan', fullLabel: 'January' },
  { value: '02', label: 'Feb', fullLabel: 'February' },
  { value: '03', label: 'Mar', fullLabel: 'March' },
  { value: '04', label: 'Apr', fullLabel: 'April' },
  { value: '05', label: 'May', fullLabel: 'May' },
  { value: '06', label: 'Jun', fullLabel: 'June' },
  { value: '07', label: 'Jul', fullLabel: 'July' },
  { value: '08', label: 'Aug', fullLabel: 'August' },
  { value: '09', label: 'Sep', fullLabel: 'September' },
  { value: '10', label: 'Oct', fullLabel: 'October' },
  { value: '11', label: 'Nov', fullLabel: 'November' },
  { value: '12', label: 'Dec', fullLabel: 'December' },
];

const getTradeDayKey = (closedAt: number, offsetMinutes: number = DEFAULT_OPERATOR_TZ_OFFSET_MIN): string => {
  return formatDayKeyWithOffset(closedAt, offsetMinutes);
};

const formatMonthTitle = (monthKey: string): string => {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
};

const formatFullDate = (dayKey: string): string => {
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return dayKey;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
};

export const CalendarTab = () => {
  const snap = useSnapshot();

  // Robust multi-source fetch: check /api/pnl/calendar first, fallback to /api/pnl
  const { data: calData } = useFetch<CalendarPayload>('/api/pnl/calendar');
  const { data: pnlData } = useFetch<PnlPayload>('/api/pnl');

  const tzOffsetMin =
    calData?.tzOffsetMin ?? pnlData?.tzOffsetMin ?? snap?.tzOffsetMin ?? DEFAULT_OPERATOR_TZ_OFFSET_MIN;

  const todayKey = useMemo(() => {
    return resolveAnchorDayKey({
      todayKey: calData?.todayKey ?? pnlData?.todayKey ?? snap?.todayKey,
      serverTime: calData?.asOf ?? pnlData?.asOf ?? snap?.at,
      tzOffsetMin,
    });
  }, [calData?.todayKey, pnlData?.todayKey, snap?.todayKey, calData?.asOf, pnlData?.asOf, snap?.at, tzOffsetMin]);

  const currentMonthKey = todayKey.slice(0, 7);

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);
  const [inspectDay, setInspectDay] = useState<string | null>(null);

  const { setAction } = usePortfolioAction();

  // Send timeframe-aware share button to Portfolio sub nav (right side, below profile)
  useEffect(() => {
    setAction(
      <CardDialog
        kind="calendar"
        title={`${formatMonthTitle(selectedMonth)} Calendar`}
        label="Share"
        params={`month=${selectedMonth}`}
        variant="outline"
        size="sm"
        className="h-7.5 text-xs"
      />,
    );
    return () => setAction(null);
  }, [selectedMonth, setAction]);

  // Normalize daily records across both endpoints
  const allDays = useMemo<DayStats[]>(() => {
    if (calData?.days && calData.days.length > 0) {
      return calData.days;
    }
    if (pnlData?.daily && pnlData.daily.length > 0) {
      return pnlData.daily;
    }
    if (pnlData?.month?.days && pnlData.month.days.length > 0) {
      return pnlData.month.days.map((d) => ({
        day: d.day,
        pnlUsd: d.pnlUsd,
        volumeUsd: d.volumeUsd,
        opens: d.opens,
        closes: d.closes,
        feesPaidUsd: 0,
      }));
    }
    return [];
  }, [calData?.days, pnlData?.daily, pnlData?.month?.days]);

  // Normalize closed trades list
  const allTrades = useMemo(() => {
    return calData?.trades ?? pnlData?.trades ?? [];
  }, [calData?.trades, pnlData?.trades]);

  // Dynamic list of available years
  const availableYears = useMemo(() => {
    const currentY = parseInt(todayKey.slice(0, 4), 10) || 2026;
    const yearsSet = new Set<number>([currentY, currentY - 1]);
    for (const d of allDays) {
      const y = parseInt(d.day.slice(0, 4), 10);
      if (!isNaN(y)) yearsSet.add(y);
    }
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [todayKey, allDays]);

  const [selectedYear, selectedMonthVal] = useMemo(() => {
    const parts = selectedMonth.split('-');
    return [parts[0] || '2026', parts[1] || '09'];
  }, [selectedMonth]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    const parts = selectedMonth.split('-').map(Number);
    const y = parts[0] ?? 2026;
    const m = parts[1] ?? 1;
    const d = new Date(Date.UTC(y, m - 2, 1));
    setSelectedMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const parts = selectedMonth.split('-').map(Number);
    const y = parts[0] ?? 2026;
    const m = parts[1] ?? 1;
    const d = new Date(Date.UTC(y, m, 1));
    setSelectedMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const handleJumpToToday = () => {
    setSelectedMonth(currentMonthKey);
  };

  // Build calendar matrix for selected month
  const calendarGrid = useMemo(() => {
    const parts = selectedMonth.split('-').map(Number);
    const y = parts[0];
    const m = parts[1];
    if (y === undefined || m === undefined) return { days: [], offset: 0, totalDays: 0 };

    const first = new Date(Date.UTC(y, m - 1, 1));
    const totalDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
    // Monday is index 0; Sunday is index 6
    const offset = (first.getUTCDay() + 6) % 7;

    const days = Array.from({ length: totalDays }, (_, i) => {
      const dayNum = i + 1;
      const key = `${selectedMonth}-${String(dayNum).padStart(2, '0')}`;
      return { dayNum, key };
    });

    return { days, offset, totalDays };
  }, [selectedMonth]);

  // Map day data from payload
  const daysMap = useMemo(() => {
    const map = new Map<string, DayStats>();
    for (const d of allDays) {
      map.set(d.day, d);
    }
    return map;
  }, [allDays]);

  // Aggregate monthly performance statistics
  const monthStats = useMemo(() => {
    const monthDays = allDays.filter((d) => d.day.startsWith(selectedMonth));
    const totalPnl = monthDays.reduce((s, d) => s + d.pnlUsd, 0);
    const totalVolume = monthDays.reduce((s, d) => s + d.volumeUsd, 0);
    const totalFees = monthDays.reduce((s, d) => s + (d.feesEarnedUsd ?? d.feesPaidUsd ?? 0), 0);
    const greenDays = monthDays.filter((d) => d.pnlUsd > 0);
    const redDays = monthDays.filter((d) => d.pnlUsd < 0);
    const peakPnl = Math.max(1e-9, ...monthDays.map((d) => Math.abs(d.pnlUsd)));

    return {
      totalPnl,
      totalVolume,
      totalFees,
      greenCount: greenDays.length,
      redCount: redDays.length,
      peakPnl,
    };
  }, [allDays, selectedMonth]);

  // Trades closed on the inspected day
  const inspectTrades = useMemo(() => {
    if (!inspectDay || allTrades.length === 0) return [];
    return allTrades.filter((t) => getTradeDayKey(t.closedAt, tzOffsetMin) === inspectDay);
  }, [inspectDay, allTrades, tzOffsetMin]);

  const inspectDayStats = inspectDay ? daysMap.get(inspectDay) : null;
  const isSelectedMonthCurrent = selectedMonth === currentMonthKey;

  if (!calData && !pnlData) {
    return <CalendarSkeleton />;
  }

  return (
    <div className="flex flex-col w-full flex-1">
      <div className="w-full flex-1 flex flex-col min-h-0">
        {/* Calendar Controller & Grid Outer Shell */}
        <div className="rounded-xl border border-border/70 bg-card/50 shadow-xs overflow-hidden flex-1 flex flex-col min-h-[calc(100svh-12rem)]">
          {/* Header Control Toolbar */}
          <div className="shrink-0 flex flex-col gap-3 border-b border-border/40 p-3 sm:px-4 sm:py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                  {formatMonthTitle(selectedMonth)}
                </h2>
                <Badge
                  variant={
                    monthStats.totalPnl > 0
                      ? 'success'
                      : monthStats.totalPnl < 0
                        ? 'destructive'
                        : 'secondary'
                  }
                  className="tabular-nums text-xs font-semibold px-2 py-0.5"
                >
                  {signedUsd(monthStats.totalPnl)}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {monthStats.greenCount} profit days, {monthStats.redCount} loss days
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {/* Month Dropdown ("Dropdown Bulan") */}
              <Select
                value={selectedMonthVal}
                onValueChange={(m) => setSelectedMonth(`${selectedYear}-${m}`)}
              >
                <SelectTrigger className="w-28 sm:w-34 h-7.5 text-xs bg-background/80 border-border/60">
                  <span className="flex items-center gap-1.5 truncate">
                    <CalendarDays className="size-3.5 text-muted-foreground shrink-0" />
                    <SelectValue placeholder="Month" />
                  </span>
                </SelectTrigger>
                <SelectContent align="end" className="w-36">
                  {MONTH_NAMES.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">
                      {m.fullLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Year Dropdown ("Dropdown Tahun") */}
              <Select
                value={selectedYear}
                onValueChange={(y) => setSelectedMonth(`${y}-${selectedMonthVal}`)}
              >
                <SelectTrigger className="w-20 sm:w-22 h-7.5 text-xs bg-background/80 border-border/60">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent align="end" className="w-24">
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={String(y)} className="text-xs">
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Navigation ButtonGroup */}
              <div className="inline-flex items-center rounded-lg border border-border/60 bg-background/80 p-0.5 shadow-2xs">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6.5 w-6.5 rounded-md hover:bg-muted"
                  onClick={handlePrevMonth}
                  title="Previous month"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6.5 px-2 text-xs font-medium hover:bg-muted"
                  onClick={handleJumpToToday}
                  disabled={isSelectedMonthCurrent}
                >
                  Today
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6.5 w-6.5 rounded-md hover:bg-muted"
                  onClick={handleNextMonth}
                  disabled={isSelectedMonthCurrent}
                  title="Next month"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Weekday Column Headers */}
          <div className="shrink-0 grid grid-cols-7 border-b border-border/40 text-center py-2.5 bg-muted/10">
            {WEEKDAYS.map((day, idx) => (
              <div
                key={day}
                className={cn(
                  'text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase',
                  idx >= 5 ? 'text-muted-foreground/60' : 'text-muted-foreground',
                )}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Performance Calendar Grid (Always Renders) */}
          <div className="flex-1 min-h-0 p-2 sm:p-2.5 bg-card/30 flex flex-col justify-between">
            <div className="grid grid-cols-7 auto-rows-fr gap-1 sm:gap-1.5 flex-1 min-h-0">
              {/* Offset padding for starting weekday */}
              {Array.from({ length: calendarGrid.offset }, (_, i) => (
                <div
                  key={`blank-${i}`}
                  className="h-full min-h-14 sm:min-h-16 rounded-lg border border-dashed border-border/20 bg-muted/5 opacity-40"
                />
              ))}

              {/* Month Day Cells */}
              {calendarGrid.days.map(({ dayNum, key }) => {
                const dayData = daysMap.get(key);
                const isToday = key === todayKey;
                const pnl = dayData?.pnlUsd ?? 0;
                const hasActivity = Boolean(
                  dayData && (dayData.pnlUsd !== 0 || dayData.volumeUsd > 0 || dayData.opens + dayData.closes > 0),
                );
                const isGreen = pnl > 0;
                const isRed = pnl < 0;

                // Compute subtle proportional tint intensity relative to peak PnL
                const magnitudeRatio = monthStats.peakPnl > 0 ? Math.min(1, Math.abs(pnl) / monthStats.peakPnl) : 0;
                const tintOpacity = Math.max(0.06, Math.min(0.24, 0.06 + magnitudeRatio * 0.18));

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setInspectDay(key)}
                    className={cn(
                      'group relative flex flex-col justify-between h-full min-h-14 sm:min-h-16 p-1.5 sm:p-2 rounded-lg border text-left transition-all duration-200 outline-none',
                      'hover:scale-[1.01] hover:shadow-sm focus-visible:ring-2 focus-visible:ring-primary/60 cursor-pointer',
                      isToday && 'ring-1.5 ring-primary/80',
                      hasActivity
                        ? isGreen
                          ? 'border-emerald-500/30 hover:border-emerald-500/60'
                          : isRed
                            ? 'border-rose-500/30 hover:border-rose-500/60'
                            : 'border-border/60 bg-muted/20 hover:border-border'
                        : 'border-border/30 bg-muted/10 opacity-70 hover:opacity-100 hover:border-border/60',
                    )}
                    style={{
                      backgroundColor: hasActivity
                        ? isGreen
                          ? `rgba(16, 185, 129, ${tintOpacity.toFixed(2)})`
                          : isRed
                            ? `rgba(244, 63, 94, ${tintOpacity.toFixed(2)})`
                            : undefined
                        : undefined,
                    }}
                  >
                    {/* Top Row: Date Number & Badge Indicator */}
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={cn(
                          'text-xs font-semibold tabular-nums',
                          isToday ? 'text-primary font-bold' : 'text-foreground/90',
                        )}
                      >
                        {dayNum}
                      </span>

                      {isToday && (
                        <span className="text-[10px] font-semibold text-primary uppercase tracking-tight">Today</span>
                      )}
                    </div>

                    {/* Middle Row: Day Realized PnL */}
                    <div className="my-auto py-1">
                      {hasActivity && pnl !== 0 ? (
                        <div
                          className={cn(
                            'text-xs sm:text-sm font-bold tabular-nums tracking-tight truncate',
                            isGreen ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400',
                          )}
                        >
                          {signedUsd(pnl)}
                        </div>
                      ) : hasActivity ? (
                        <div className="text-[11px] font-medium text-muted-foreground tabular-nums">
                          {usd(dayData?.volumeUsd)} vol
                        </div>
                      ) : (
                        <div className="text-[11px] text-muted-foreground/40 font-mono">-</div>
                      )}
                    </div>

                    {/* Bottom Row: Micro Fee Tag or Trade Count */}
                    <div className="w-full flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
                      {hasActivity && (dayData?.feesEarnedUsd || dayData?.feesPaidUsd) ? (
                        <span className="truncate text-emerald-600 dark:text-emerald-400 font-medium">
                          +{usd(dayData.feesEarnedUsd ?? dayData.feesPaidUsd)}
                        </span>
                      ) : (
                        <span className="truncate opacity-50">
                          {dayData?.closes ? `${dayData.closes} trade${dayData.closes > 1 ? 's' : ''}` : ''}
                        </span>
                      )}
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-primary">
                        View →
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Legend & Summary Footer */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 mt-auto pt-3 border-t border-border/40 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="size-2.5 rounded-full bg-emerald-500" />
                  <span>Profitable Day ({monthStats.greenCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="size-2.5 rounded-full bg-rose-500" />
                  <span>Drawdown Day ({monthStats.redCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="size-2.5 rounded-full bg-muted-foreground/30" />
                  <span>No Activity</span>
                </div>
              </div>

              <div className="flex items-center gap-6 text-xs tabular-nums">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-medium">Total Volume</span>
                  <span className="font-semibold text-foreground">{usd(monthStats.totalVolume)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-medium">Fees Yield</span>
                  <span className="font-semibold text-emerald-500">+{usd(monthStats.totalFees)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Day Inspection Detail Drawer */}
      <Sheet open={Boolean(inspectDay)} onOpenChange={(open) => !open && setInspectDay(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-5 border-b border-border/40 bg-muted/20">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <CalendarDays className="size-3.5" />
              Day Breakdown
            </div>
            <SheetTitle className="text-lg font-bold tracking-tight">
              {inspectDay ? formatFullDate(inspectDay) : ''}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Day performance breakdown
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Day Scorecard Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/60 bg-card/50 p-3">
                <span className="text-[11px] font-medium text-muted-foreground">Realized Net PnL</span>
                <div
                  className={cn(
                    'text-xl font-bold tabular-nums mt-1',
                    inspectDayStats ? toneClass(inspectDayStats.pnlUsd) : 'text-muted-foreground',
                  )}
                >
                  {inspectDayStats ? signedUsd(inspectDayStats.pnlUsd) : '$0.00'}
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card/50 p-3">
                <span className="text-[11px] font-medium text-muted-foreground">Fees Earned</span>
                <div className="text-xl font-bold tabular-nums mt-1 text-emerald-500">
                  {(inspectDayStats?.feesEarnedUsd || inspectDayStats?.feesPaidUsd) ? `+${usd(inspectDayStats.feesEarnedUsd ?? inspectDayStats.feesPaidUsd)}` : '$0.00'}
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card/50 p-3">
                <span className="text-[11px] font-medium text-muted-foreground">Volume Traded</span>
                <div className="text-base font-semibold tabular-nums mt-1 text-foreground">
                  {usd(inspectDayStats?.volumeUsd ?? 0)}
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card/50 p-3">
                <span className="text-[11px] font-medium text-muted-foreground">Positions Exited</span>
                <div className="text-base font-semibold tabular-nums mt-1 text-foreground">
                  {inspectTrades.length} trade{inspectTrades.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>

            {/* Closed Positions Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Closed Positions ({inspectTrades.length})
                </h3>
              </div>

              {inspectTrades.length === 0 ? (
                <div className="py-16 text-center select-none">
                  <p className="text-sm text-muted-foreground">No positions closed on this day</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {inspectTrades.map((t) => (
                    <div
                      key={t.key}
                      className="rounded-xl border border-border/60 bg-card/60 p-3.5 space-y-2.5 shadow-2xs hover:border-border transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">{t.pair}</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono">
                            {t.version.toUpperCase()}
                          </Badge>
                        </div>
                        <span className={cn('text-sm font-bold tabular-nums', toneClass(t.netPnlUsd ?? t.pnlUsd))}>
                          {signedUsd(t.netPnlUsd ?? t.pnlUsd)}
                          <span className="text-[11px] font-normal text-muted-foreground ml-1">
                            ({signedPct(t.netPnlPct ?? t.pnlPct)})
                          </span>
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/30">
                        <div>
                          <span className="block text-[10px] uppercase opacity-75">Deposited</span>
                          <span className="tabular font-medium text-foreground">{usd(t.depositUsd)}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase opacity-75">Exit Value</span>
                          <span className="tabular font-medium text-foreground">{usd(t.exitUsd)}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase opacity-75">Fees Earned</span>
                          <span className="tabular font-medium text-emerald-500">+{usd(t.feesUsd)}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-border/30 text-[11px] text-muted-foreground">
                        <span>Held: {duration(t.heldMs)}</span>
                        <CardDialog
                          kind="trade"
                          title={`${t.pair} Trade Card`}
                          label="Share"
                          isProfit={t.pnlUsd >= 0}
                          params={`key=${t.key}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
