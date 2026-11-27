'use client';

import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { CardDialog } from '@/components/app/card-dialog';
import { TokenAvatar } from '@/components/app/token-avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PnlSkeleton } from '@/components/app/pnl-skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePersistentTab } from '@/lib/use-persistent-tab';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFetch } from '@/lib/use-live';
import { useSnapshot } from '@/components/app/live';
import { ago, duration, shortAddr, signedPct, signedUsd, toneClass, usd } from '@/lib/format';
import { cn } from '@/lib/utils';
import { generatePagination } from '@/lib/pool-model';
import { CellBadge, MetricTooltip, StandardPairIdentity } from '@/components/app/pool-cells';
import { usePortfolioAction } from '@/components/app/portfolio-action-context';
import { buildCumulativePnlTimeline, type PnlTimelinePoint } from '@/lib/pnl-chart';
import type { ClosedTrade, PeriodStats, PnlPayload } from '@/lib/types';

type WindowRange = '7d' | '14d' | '30d';
type HistoryTab = 'token' | 'pair' | 'position';

const pnlChartConfig = {
  profit: {
    label: 'Profit',
    color: '#10b981',
  },
  loss: {
    label: 'Loss',
    color: '#f43f5e',
  },
  net: {
    label: 'Cumulative PnL',
    color: '#10b981',
  },
} satisfies ChartConfig;

interface PairAggregate {
  pair: string;
  base: string;
  quote: string;
  baseAddress?: string;
  quoteAddress?: string;
  versions: string[];
  tradesCount: number;
  wins: number;
  losses: number;
  totalPnlUsd: number;
  totalDepositUsd: number;
  totalExitUsd: number;
  totalVolumeUsd: number;
  totalFeesUsd: number;
  totalHeldMs: number;
  pnlPct: number;
  avgHeldMs: number;
}

interface HistoryTablePaginationProps {
  currentPage: number; // 1-indexed
  totalPages: number;
  totalCount: number;
  pageSize: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

const HistoryTablePagination = ({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  itemLabel,
  onPageChange,
  isLoading = false,
}: HistoryTablePaginationProps) => {
  const paginationItems = useMemo(
    () => generatePagination(currentPage, totalPages),
    [currentPage, totalPages],
  );

  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="shrink-0 py-2.5 px-4 border-t border-border/40 bg-muted/10 text-xs text-muted-foreground flex items-center justify-between gap-4">
      {/* Left Side: Showing X–Y of Z items (Accurate count only, no refresh) */}
      <div className="flex items-center gap-2 min-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="truncate font-mono select-none cursor-default text-xs text-muted-foreground">
              {totalCount === 0 ? (
                <>
                  Showing <strong className="text-foreground font-semibold">0</strong> of{' '}
                  <strong className="text-foreground font-semibold">0</strong> {itemLabel}
                </>
              ) : (
                <>
                  Showing{' '}
                  <strong className="text-foreground font-semibold">
                    {startItem}–{endItem}
                  </strong>{' '}
                  of{' '}
                  <strong className="text-foreground font-semibold">
                    {totalCount.toLocaleString()}
                  </strong>{' '}
                  {itemLabel}
                </>
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="text-[11px] py-1 px-2 font-sans"
          >
            {totalCount.toLocaleString()} total {itemLabel} across {totalPages} page{totalPages === 1 ? '' : 's'}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Right Side: 1 2 3 ... numbered pagination with adaptive arrows */}
      <nav aria-label={`${itemLabel} pagination`} className="flex items-center gap-1 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-30 disabled:pointer-events-none rounded-md transition-colors"
              disabled={currentPage <= 1 || isLoading}
              onClick={() => onPageChange(currentPage - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="text-[11px] py-1 px-2 font-sans"
          >
            {currentPage <= 1 ? 'First page reached' : 'Previous page'}
          </TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-1">
          {paginationItems.map((item, idx) => {
            if (item === '...') {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="h-7 min-w-[20px] px-1 text-xs font-mono text-muted-foreground/50 flex items-center justify-center select-none"
                  aria-hidden="true"
                >
                  …
                </span>
              );
            }

            const isCurrent = item === currentPage;
            return (
              <Tooltip key={`page-${item}`}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => onPageChange(item)}
                    className={cn(
                      'h-7 min-w-[28px] px-2 text-xs font-mono font-medium rounded-md transition-colors flex items-center justify-center cursor-pointer select-none',
                      isCurrent
                        ? 'bg-muted text-foreground font-semibold border border-border/80 shadow-xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent',
                      isLoading && 'cursor-wait opacity-60',
                    )}
                    aria-current={isCurrent ? 'page' : undefined}
                    aria-label={`Page ${item}`}
                  >
                    {item}
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="text-[11px] py-1 px-2 font-sans"
                >
                  {isCurrent ? `Current page (${item})` : `Go to page ${item}`}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-30 disabled:pointer-events-none rounded-md transition-colors"
              disabled={currentPage >= totalPages || isLoading}
              onClick={() => onPageChange(currentPage + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="text-[11px] py-1 px-2 font-sans"
          >
            {currentPage >= totalPages ? 'Last page reached' : 'Next page'}
          </TooltipContent>
        </Tooltip>
      </nav>
    </div>
  );
};

const Page = () => {
  const snap = useSnapshot();
  const { data, error } = useFetch<PnlPayload>('/api/pnl');
  const [range, setRange] = usePersistentTab<WindowRange>({
    key: 'invictus:subnav:pnl:range',
    defaultValue: '30d',
    validValues: ['7d', '14d', '30d'] as const,
    syncUrl: false,
  });
  const [historyTab, setHistoryTab] = usePersistentTab<HistoryTab>({
    key: 'invictus:subnav:pnl:historyTab',
    defaultValue: 'token',
    validValues: ['token', 'pair', 'position'] as const,
    syncUrl: false,
  });
  const [tradePage, setTradePage] = useState(0);
  const [tokenPage, setTokenPage] = useState(0);
  const [pairPage, setPairPage] = useState(0);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const PAGE = 20;
  const { data: trades, error: tradesError, loading: tradesLoading } = useFetch<{ rows: ClosedTrade[]; total: number }>(`/api/pnl/trades?limit=${PAGE}&offset=${tradePage * PAGE}`);
  const tradeRows = trades?.rows ?? [];
  const tradeTotal = trades?.total ?? data?.stats?.positionsClosed ?? 0;

  const { setAction } = usePortfolioAction();

  // Send timeframe-aware share button to Portfolio sub nav (right side, below profile)
  useEffect(() => {
    setAction(
      <CardDialog
        kind="period"
        initialPeriod={range}
        title={`Realized PnL (${range.toUpperCase()})`}
        label="Share"
        variant="outline"
        size="sm"
        className="h-7.5 text-xs"
      />,
    );
    return () => setAction(null);
  }, [range, setAction]);

  useEffect(() => {
    setTradePage(0);
    setTokenPage(0);
    setPairPage(0);
  }, [snap?.wallet?.address]);

  const copyTokenCA = (e: React.MouseEvent, symbol: string, address?: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (address && address.startsWith('0x')) {
      navigator.clipboard.writeText(address);
      setCopiedToken(symbol);
      toast.success(`${symbol} CA copied`);
      setTimeout(() => setCopiedToken(null), 1500);
    } else {
      navigator.clipboard.writeText(symbol);
      setCopiedToken(symbol);
      toast.success(`${symbol} symbol copied`);
      setTimeout(() => setCopiedToken(null), 1500);
    }
  };

  const copyKey = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    toast.success('Position ID copied');
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // Symbol-to-address map resolving from open positions and closed trades
  const symbolToAddressMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of snap?.positions ?? []) {
      if (p.symbol && p.tokenAddress) {
        map.set(p.symbol.toUpperCase().trim(), p.tokenAddress);
      }
    }
    for (const t of data?.trades ?? []) {
      if (t.tokenAddress) {
        const parts = (t.pair || '').split('/').map((s) => s.trim());
        const b = parts[0] || t.pair;
        if (b) {
          map.set(b.toUpperCase().trim(), t.tokenAddress);
        }
      }
    }
    return map;
  }, [snap?.positions, data?.trades]);

  // Aggregation per trading pair across all pools
  const pairAggregates = useMemo<PairAggregate[]>(() => {
    if (!data?.trades?.length) return [];
    const map = new Map<string, PairAggregate>();

    for (const t of data.trades) {
      const pairName = (t.pair || 'Unknown / USDG').trim();
      const parts = pairName.split('/').map((s) => s.trim());
      const base = parts[0] || pairName;
      const quote = parts[1] || t.quoteKey || 'USDG';
      const baseAddr = t.tokenAddress || symbolToAddressMap.get(base.toUpperCase());
      const quoteAddr = symbolToAddressMap.get(quote.toUpperCase());
      // ponytail: include base address in key so copy-tokens with identical tickers stay distinct
      const key = baseAddr ? `${baseAddr.toLowerCase()}/${quote.toUpperCase()}` : `${base}/${quote}`.toUpperCase();

      let entry = map.get(key);
      if (!entry) {
        entry = {
          pair: `${base} / ${quote}`,
          base,
          quote,
          baseAddress: baseAddr,
          quoteAddress: quoteAddr,
          versions: [],
          tradesCount: 0,
          wins: 0,
          losses: 0,
          totalPnlUsd: 0,
          totalDepositUsd: 0,
          totalExitUsd: 0,
          totalVolumeUsd: 0,
          totalFeesUsd: 0,
          totalHeldMs: 0,
          pnlPct: 0,
          avgHeldMs: 0,
        };
        map.set(key, entry);
      } else {
        if (!entry.baseAddress && baseAddr) {
          entry.baseAddress = baseAddr;
        }
        if (!entry.quoteAddress && quoteAddr) {
          entry.quoteAddress = quoteAddr;
        }
      }

      if (t.version && !entry.versions.includes(t.version.toUpperCase())) {
        entry.versions.push(t.version.toUpperCase());
      }
      entry.tradesCount += 1;
      const netPnl = t.netPnlUsd ?? t.pnlUsd;
      if (netPnl >= 0) entry.wins += 1;
      else entry.losses += 1;
      entry.totalPnlUsd += netPnl;
      entry.totalDepositUsd += t.depositUsd;
      entry.totalExitUsd += t.exitUsd;
      entry.totalVolumeUsd += t.depositUsd + t.exitUsd;
      entry.totalFeesUsd += t.feesUsd;
      entry.totalHeldMs += t.heldMs;
    }

    const list = Array.from(map.values()).map((e) => ({
      ...e,
      pnlPct: e.totalDepositUsd > 0 ? (e.totalPnlUsd / e.totalDepositUsd) * 100 : 0,
      avgHeldMs: e.tradesCount > 0 ? e.totalHeldMs / e.tradesCount : 0,
    }));

    return list.sort((a, b) => Math.abs(b.totalPnlUsd) - Math.abs(a.totalPnlUsd));
  }, [data?.trades, symbolToAddressMap]);

  // ponytail: key by tokenAddress so copy-tokens with identical tickers stay distinct
  const openCountByPair = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of snap?.positions ?? []) {
      const rawSym = (p.symbol || '').toUpperCase().trim();
      const rawQuote = (p.quoteSymbol || '').toUpperCase().trim();
      const parts = rawSym.includes('/') ? rawSym.split('/').map((s) => s.trim()) : [];
      const sym = parts[0] || rawSym;
      const qSym = rawQuote || parts[1] || '';
      const addr = p.tokenAddress?.toLowerCase();
      const key = addr ? `${addr}/${qSym}` : `${sym}/${qSym}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [snap?.positions]);

  const windowDays = range === '7d' ? 7 : range === '14d' ? 14 : 30;

  // Selected period stats (7D, 14D, 30D)
  const currentPeriod = useMemo<PeriodStats>(() => {
    if (!data) {
      const history = snap?.pnlHistory ?? [];
      const days = history.slice(-windowDays).map((d) => ({
        day: d.day,
        pnlUsd: d.pnlUsd,
        volumeUsd: 0,
        opens: 0,
        closes: 0,
      }));
      const pnls = days.map((d) => d.pnlUsd);
      return {
        label: range.toUpperCase(),
        tradeCloses: 0,
        tradeWins: 0,
        bestTrade: null,
        pnlUsd: pnls.reduce((s, v) => s + v, 0),
        volumeUsd: days.reduce((s, d) => s + d.volumeUsd, 0),
        opens: days.reduce((s, d) => s + d.opens, 0),
        closes: days.reduce((s, d) => s + d.closes, 0),
        wins: days.filter((d) => d.pnlUsd > 0).length,
        best: pnls.length ? Math.max(...pnls) : 0,
        worst: pnls.length ? Math.min(...pnls) : 0,
        days,
      };
    }

    if (range === '7d') return data.week;
    if (range === '30d') return data.month;

    if (data.fortnight) return data.fortnight;
    const days = (data.month?.days ?? []).slice(-14);
    const pnls = days.map((d) => d.pnlUsd);
    return {
      label: '14D',
      tradeCloses: 0,
      tradeWins: 0,
      bestTrade: null,
      pnlUsd: pnls.reduce((s, v) => s + v, 0),
      volumeUsd: days.reduce((s, d) => s + d.volumeUsd, 0),
      opens: days.reduce((s, d) => s + d.opens, 0),
      closes: days.reduce((s, d) => s + d.closes, 0),
      wins: days.filter((d) => d.pnlUsd > 0).length,
      best: pnls.length ? Math.max(...pnls) : 0,
      worst: pnls.length ? Math.min(...pnls) : 0,
      days,
    };
  }, [data, range, snap?.pnlHistory, windowDays]);

  // Chart data matching continuous N-day timeline with running cumulative PnL.
  // Uses data.daily as primary source; snap.pnlHistory fallback only until /api/pnl loads.
  const chartData = useMemo(() => {
    const pnlMap = new Map<string, number>();
    const sourceDays = data ? (data.daily ?? []) : (snap?.pnlHistory ?? []);
    for (const d of sourceDays) {
      pnlMap.set(d.day, d.pnlUsd);
    }

    return buildCumulativePnlTimeline(windowDays, pnlMap, {
      todayKey: data?.todayKey ?? snap?.todayKey,
      serverTime: data?.asOf ?? snap?.at,
      tzOffsetMin: data?.tzOffsetMin ?? snap?.tzOffsetMin,
      latestKnownDay: data?.daily?.[0]?.day ?? snap?.pnlHistory?.[(snap?.pnlHistory?.length ?? 0) - 1]?.day,
    });
  }, [snap?.pnlHistory, snap?.todayKey, snap?.at, snap?.tzOffsetMin, data, windowDays]);

  // Lifetime closed trade metrics
  const totalTradesCount = data?.stats?.positionsClosed ?? 0;

  // The compact /api/pnl response contains recent trades only (capped at 200).
  // Do not divide a whole period's PnL by partial deposits or report partial win rates.
  const completeTradeHistory = Boolean(data && (data.trades?.length ?? 0) === data.stats?.positionsClosed);

  // ponytail: data.stats lacks feesEarned; sums capped trades (max 200). Upgrade backend stats with feesEarned.
  const lifetimeFeesUsd = useMemo(() => {
    return (data?.trades ?? []).reduce((acc, t) => acc + t.feesUsd, 0);
  }, [data?.trades]);

  const lifetimeWins = useMemo(() => {
    return (data?.trades ?? []).filter((t) => (t.netPnlUsd ?? t.pnlUsd) >= 0).length;
  }, [data?.trades]);

  // ponytail: backend lacks lifetime tradeWins in stats. Only show when trade history is complete (<=200 trades).
  const winRateLifetime = completeTradeHistory
    ? (data?.trades?.length ? Math.round((lifetimeWins / data.trades.length) * 100) : 0)
    : null;

  const expectedValueUsd = totalTradesCount > 0 ? (data?.stats?.realizedPnlUsd ?? 0) / totalTradesCount : 0;

  const cutoffMs = useMemo(() => Date.now() - windowDays * 86400 * 1000, [windowDays]);
  const windowTrades = useMemo(() => {
    return (data?.trades ?? []).filter((t) => t.closedAt >= cutoffMs);
  }, [data?.trades, cutoffMs]);

  const windowDepositUsd = useMemo(() => {
    return windowTrades.reduce((acc, t) => acc + t.depositUsd, 0);
  }, [windowTrades]);

  const periodRoi = completeTradeHistory && windowDepositUsd > 0
    ? (currentPeriod.pnlUsd / windowDepositUsd) * 100
    : null;

  if (error && !snap) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center select-none py-16">
        <p className="text-sm text-muted-foreground">Failed to load PnL data ({error})</p>
      </div>
    );
  }

  if (!data && !snap) {
    return <PnlSkeleton />;
  }

  return (
    <div className="flex flex-col gap-5 w-full flex-1">
      {/* Realized Performance & Chart Card */}
      <Card className="rounded-xl border border-border/70 bg-card/50 shadow-xs ring-0 gap-0 py-0 overflow-hidden flex-1 flex flex-col min-h-[calc(100svh-13rem)]">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:px-4 sm:py-3 border-b border-border/40 shrink-0">
          <div>
            <CardTitle className="text-base font-semibold">Realized PnL</CardTitle>
            <CardDescription className="text-xs">
              Cumulative earnings and closed position performance.
            </CardDescription>
          </div>
          <Tabs value={range} onValueChange={(v) => setRange(v as WindowRange)}>
            <TabsList className="h-8 bg-muted/60 p-0.5">
              <TabsTrigger value="7d" className="text-xs px-2.5 h-7">7D</TabsTrigger>
              <TabsTrigger value="14d" className="text-xs px-2.5 h-7">14D</TabsTrigger>
              <TabsTrigger value="30d" className="text-xs px-2.5 h-7">30D</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        {/* 6 Key Performance Metrics - Full Height Vertical Dividers */}
        <div className="border-b border-border/40 bg-muted/5 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 lg:divide-x divide-border/40">
            <div className="flex flex-col justify-between p-3.5 sm:px-4 sm:py-3 min-h-20">
              <span className="text-[11px] font-medium text-muted-foreground">Net PnL</span>
              <div className={cn('text-lg sm:text-xl font-bold font-mono tracking-tight my-0.5', toneClass(currentPeriod.pnlUsd))}>
                {signedUsd(currentPeriod.pnlUsd)}
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                {periodRoi === null ? 'ROI unavailable' : `${signedPct(periodRoi)} ROI`}
              </span>
            </div>

            <div className="flex flex-col justify-between p-3.5 sm:px-4 sm:py-3 min-h-20">
              <span className="text-[11px] font-medium text-muted-foreground">Fees Earned</span>
              <div className="text-lg sm:text-xl font-bold font-mono text-emerald-400 tracking-tight my-0.5">
                +{usd(lifetimeFeesUsd)}
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                Recent closed positions
              </span>
            </div>

            <div className="flex flex-col justify-between p-3.5 sm:px-4 sm:py-3 min-h-20">
              <span className="text-[11px] font-medium text-muted-foreground">Total Volume</span>
              <div className="text-lg sm:text-xl font-bold font-mono text-foreground tracking-tight my-0.5">
                {usd(data?.stats?.volumeUsd ?? snap?.totals?.valueUsd ?? 0)}
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                All-time traded
              </span>
            </div>

            <div className="flex flex-col justify-between p-3.5 sm:px-4 sm:py-3 min-h-20">
              <span className="text-[11px] font-medium text-muted-foreground">Recent Win Rate</span>
              <div className="text-lg sm:text-xl font-bold font-mono text-foreground tracking-tight my-0.5">
                {winRateLifetime !== null ? `${winRateLifetime}%` : '—'}
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                {lifetimeWins} of {data?.trades?.length ?? 0} recent trades won
              </span>
            </div>

            <div className="flex flex-col justify-between p-3.5 sm:px-4 sm:py-3 min-h-20">
              <span className="text-[11px] font-medium text-muted-foreground">Closed Positions</span>
              <div className="text-lg sm:text-xl font-bold font-mono text-foreground tracking-tight my-0.5">
                {totalTradesCount}
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                {data?.stats?.positionsOpened ?? snap?.positions?.length ?? 0} opened
              </span>
            </div>

            <div className="flex flex-col justify-between p-3.5 sm:px-4 sm:py-3 min-h-20">
              <span className="text-[11px] font-medium text-muted-foreground">Expected Value</span>
              <div className={cn('text-lg sm:text-xl font-bold font-mono tracking-tight my-0.5', toneClass(expectedValueUsd))}>
                {signedUsd(expectedValueUsd)}
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                Avg per trade
              </span>
            </div>
          </div>
        </div>

        <CardContent className="p-3 sm:p-4 flex-1 min-h-0 flex flex-col gap-2">
          {/* Line Chart */}
          <div className="relative w-full flex-1 min-h-0">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center select-none py-16">
                <p className="text-sm text-muted-foreground">No trading activity in this period</p>
              </div>
            ) : (
              <ChartContainer config={pnlChartConfig} className="absolute inset-0 h-full w-full aspect-auto">
                <LineChart
                  accessibilityLayer
                  data={chartData}
                  margin={{ top: 12, right: 12, left: 12, bottom: 2 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                  <ReferenceLine
                    y={0}
                    stroke="var(--border, #374151)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    tickMargin={8}
                    axisLine={false}
                    interval={range === '30d' ? 4 : range === '14d' ? 1 : 0}
                    tickFormatter={(val: string) => {
                      const parts = val.split('-');
                      if (parts.length === 3) {
                        const m = parseInt(parts[1]!, 10);
                        const d = parseInt(parts[2]!, 10);
                        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        return `${months[m - 1]} ${d}`;
                      }
                      return val;
                    }}
                    className="text-[11px]"
                  />
                  <YAxis
                    hide
                    domain={[
                      (dataMin: number) => (Number.isFinite(dataMin) && dataMin < 0 ? dataMin * 1.1 - 1 : -5),
                      (dataMax: number) => (Number.isFinite(dataMax) && dataMax > 0 ? dataMax * 1.1 + 1 : 5),
                    ]}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0]?.payload as PnlTimelinePoint | undefined;
                      if (!item) return null;
                      return (
                        <div className="rounded-lg border border-border/70 bg-popover p-2.5 text-xs shadow-xl min-w-35 space-y-1.5">
                          <div className="font-semibold text-foreground border-b border-border/40 pb-1">
                            {item.day}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <span className={cn('size-2 rounded-xs', item.dailyNet >= 0 ? 'bg-[#10b981]' : 'bg-[#f43f5e]')} /> Day PnL
                              </span>
                              <span className={cn('tabular font-medium', toneClass(item.dailyNet))}>
                                {signedUsd(item.dailyNet)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/40 font-semibold">
                              <span className="text-muted-foreground">Cumulative PnL</span>
                              <span className={cn('tabular', toneClass(item.net))}>
                                {signedUsd(item.net)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="net"
                    name="Cumulative PnL"
                    stroke={currentPeriod.pnlUsd >= 0 ? '#10b981' : '#f43f5e'}
                    strokeWidth={2.5}
                    connectNulls
                    isAnimationActive={false}
                    dot={{
                      r: 3,
                      fill: currentPeriod.pnlUsd >= 0 ? '#10b981' : '#f43f5e',
                      strokeWidth: 0,
                    }}
                    activeDot={{ r: 5, stroke: currentPeriod.pnlUsd >= 0 ? '#10b981' : '#f43f5e', strokeWidth: 2 }}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </div>

          <div className="flex justify-between items-center text-xs text-muted-foreground pt-2.5 border-t border-border/40 shrink-0 mt-1 px-0.5">
            <span>Best Day <strong className="text-emerald-500 font-semibold">{signedUsd(currentPeriod.best)}</strong></span>
            <span>Worst Day <strong className="text-rose-500 font-semibold">{signedUsd(currentPeriod.worst)}</strong></span>
          </div>
        </CardContent>
      </Card>

      {/* History Section: Pair vs Position Tabs */}
      <Card className="rounded-xl border border-border/70 bg-card/50 shadow-xs ring-0 gap-0 py-0 overflow-hidden flex flex-col">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:px-4 sm:py-3 border-b border-border/40 shrink-0">
          <div>
            <CardTitle className="text-base font-semibold">History</CardTitle>
            <CardDescription className="text-xs">
              Historical performance grouped by token, pair, or individual position.
            </CardDescription>
          </div>
          <Tabs value={historyTab} onValueChange={(v) => setHistoryTab(v as HistoryTab)}>
            <TabsList className="h-8 bg-muted/60 p-0.5">
              <TabsTrigger value="token" className="text-xs px-3 h-7 font-medium gap-1.5">
                <span>Token</span>
                <span className="text-[10px] font-mono px-1 py-0 rounded bg-muted text-muted-foreground">
                  {data?.tokens?.length ?? 0}
                </span>
              </TabsTrigger>
              <TabsTrigger value="pair" className="text-xs px-3 h-7 font-medium gap-1.5">
                <span>Pair</span>
                <span className="text-[10px] font-mono px-1 py-0 rounded bg-muted text-muted-foreground">
                  {pairAggregates.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="position" className="text-xs px-3 h-7 font-medium gap-1.5">
                <span>Position</span>
                <span className="text-[10px] font-mono px-1 py-0 rounded bg-muted text-muted-foreground">
                  {tradeTotal}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent className="p-0 flex flex-col min-h-0">
          {historyTab === 'token' && (
            <>
              <div className="overflow-x-auto">
                <Table className="w-full caption-bottom text-sm table-fixed min-w-[960px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b border-border/50 bg-muted/20">
                      <TableHead className="w-[270px] min-w-[240px] h-11 py-3 text-xs font-semibold pl-4">
                        Token
                      </TableHead>
                      <TableHead className="w-[150px] min-w-[130px] h-11 py-3 text-right text-xs font-semibold">
                        <MetricTooltip content="Total USD capital committed (top) and position count (bottom)">
                          <span>Capital</span>
                        </MetricTooltip>
                      </TableHead>
                      <TableHead className="w-[140px] min-w-[120px] h-11 py-3 text-right text-xs font-semibold">
                        <MetricTooltip content="Cumulative LP fees collected (top) and fee yield on capital (bottom)">
                          <span>Fees</span>
                        </MetricTooltip>
                      </TableHead>
                      <TableHead className="w-[150px] min-w-[130px] h-11 py-3 text-right text-xs font-semibold">
                        <MetricTooltip content="Realized PnL from closed positions (top) and realized return on capital (bottom)">
                          <span>Realized</span>
                        </MetricTooltip>
                      </TableHead>
                      <TableHead className="w-[160px] min-w-[140px] h-11 py-3 text-right text-xs font-semibold">
                        <MetricTooltip content="Total net profit or loss (Realized + Fees + Unrealized) and return on invested capital">
                          <span>Net PnL</span>
                        </MetricTooltip>
                      </TableHead>
                      <TableHead className="w-[90px] min-w-[80px] h-11 py-3 text-right text-xs font-semibold pr-4">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!data?.tokens?.length ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="py-16 text-center select-none">
                          <p className="text-sm text-muted-foreground">No token performance recorded yet</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.tokens.slice(tokenPage * PAGE, (tokenPage + 1) * PAGE).map((token) => {
                        const tokenRoi = token.depositedUsd > 0 ? (token.pnlUsd / token.depositedUsd) * 100 : 0;
                        const feeYield = token.depositedUsd > 0 ? (token.feesUsd / token.depositedUsd) * 100 : 0;
                        const realizedPct = token.depositedUsd > 0 ? (token.realizedUsd / token.depositedUsd) * 100 : 0;
                        const tokenAddress =
                          token.token && !token.token.includes(' ') && token.token.startsWith('0x')
                            ? token.token
                            : symbolToAddressMap.get((token.symbol || '').toUpperCase());
                        return (
                          <TableRow
                            key={token.token || token.symbol}
                            className="border-border/40 hover:bg-muted/30 transition-colors h-14 sm:h-16"
                          >
                            <TableCell className="w-[270px] min-w-[240px] pl-4 py-3 font-medium overflow-hidden">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <TokenAvatar
                                  symbol={token.symbol}
                                  address={tokenAddress}
                                  size="xs"
                                />
                                <div className="flex flex-col text-left min-w-0 flex-1">
                                  <button
                                    type="button"
                                    onClick={(e) => copyTokenCA(e, token.symbol, tokenAddress)}
                                    className="font-bold text-sm text-foreground hover:text-primary transition-colors cursor-pointer inline-flex items-center gap-1 group/tok truncate text-left"
                                    title={tokenAddress ? `Click to copy CA: ${tokenAddress}` : `Copy symbol: ${token.symbol}`}
                                  >
                                    <span className="group-hover/tok:underline underline-offset-2 truncate">
                                      {token.symbol}
                                    </span>
                                    {copiedToken === token.symbol ? (
                                      <Check className="size-2.5 text-emerald-500 shrink-0" />
                                    ) : (
                                      <Copy className="size-2.5 opacity-40 group-hover/tok:opacity-80 shrink-0" />
                                    )}
                                  </button>
                                  {tokenAddress && (
                                    <span className="text-[10px] font-mono text-muted-foreground/60 truncate mt-0.5">
                                      {shortAddr(tokenAddress)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="w-[150px] min-w-[130px] tabular text-right font-mono text-xs overflow-hidden">
                              <div className="flex flex-col items-end overflow-hidden">
                                <span className="font-semibold text-foreground text-xs sm:text-[13px] tracking-tight tabular-nums truncate">
                                  {usd(token.depositedUsd)}
                                </span>
                                <span className="text-[11px] text-muted-foreground font-mono leading-tight mt-0.5 truncate">
                                  {token.open > 0 ? (
                                    <>
                                      <span className="text-foreground font-medium">{token.open} open</span>
                                      <span className="text-muted-foreground/40 mx-1">·</span>
                                      <span>{Math.max(0, token.positions - token.open)} closed</span>
                                    </>
                                  ) : (
                                    <span>{token.positions} closed</span>
                                  )}
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="w-[140px] min-w-[120px] tabular text-right font-mono text-xs overflow-hidden">
                              <div className="flex flex-col items-end overflow-hidden">
                                <span className="font-semibold text-xs sm:text-[13px] tracking-tight tabular-nums text-emerald-500 truncate">
                                  +{usd(token.feesUsd)}
                                </span>
                                <span className="text-[11px] text-emerald-500/80 font-mono leading-tight mt-0.5 truncate">
                                  +{feeYield.toFixed(2)}%
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="w-[150px] min-w-[130px] tabular text-right font-mono text-xs overflow-hidden">
                              <div className="flex flex-col items-end overflow-hidden">
                                <span className={cn('font-semibold text-xs sm:text-[13px] tracking-tight tabular-nums truncate', toneClass(token.realizedUsd))}>
                                  {signedUsd(token.realizedUsd)}
                                </span>
                                <span className={cn('text-[11px] font-mono leading-tight mt-0.5 truncate', toneClass(token.realizedUsd))}>
                                  {signedPct(realizedPct)}
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="w-[160px] min-w-[140px] tabular text-right font-mono text-xs overflow-hidden">
                              <div className="flex flex-col items-end overflow-hidden">
                                <span className={cn('font-bold text-sm tracking-tight tabular-nums truncate', toneClass(token.pnlUsd))}>
                                  {signedUsd(token.pnlUsd)}
                                </span>
                                <span className={cn('text-[11px] font-mono font-medium leading-tight mt-0.5 truncate', toneClass(token.pnlUsd))}>
                                  {signedPct(tokenRoi)}
                                </span>
                                {token.open > 0 && (
                                  <span className={cn('text-[10px] font-mono leading-tight truncate', toneClass(token.unrealizedUsd))}>
                                    unrl: {signedUsd(token.unrealizedUsd)}
                                  </span>
                                )}
                              </div>
                            </TableCell>

                            <TableCell className="w-[90px] min-w-[80px] text-right pr-4 overflow-hidden">
                              <CardDialog
                                kind="token"
                                params={`symbol=${encodeURIComponent(token.symbol)}`}
                                title={`Share ${token.symbol}`}
                                label="Share"
                                isProfit={token.pnlUsd >= 0}
                                variant="outline"
                                size="sm"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <HistoryTablePagination
                currentPage={tokenPage + 1}
                totalPages={Math.max(1, Math.ceil((data?.tokens?.length ?? 0) / PAGE))}
                totalCount={data?.tokens?.length ?? 0}
                pageSize={PAGE}
                itemLabel="tokens"
                onPageChange={(p) => setTokenPage(p - 1)}
              />
            </>
          )}

          {historyTab === 'pair' && (
            <>
              <div className="overflow-x-auto">
                <Table className="w-full caption-bottom text-sm table-fixed min-w-[960px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b border-border/50 bg-muted/20">
                      <TableHead className="w-[270px] min-w-[240px] h-11 py-3 text-xs font-semibold pl-4">
                        Pair
                      </TableHead>
                      <TableHead className="w-[150px] min-w-[130px] h-11 py-3 text-right text-xs font-semibold">
                        <MetricTooltip content="Capital deposited (top) and value returned upon exit (bottom)">
                          <span>Capital</span>
                        </MetricTooltip>
                      </TableHead>
                      <TableHead className="w-[140px] min-w-[120px] h-11 py-3 text-right text-xs font-semibold">
                        <MetricTooltip content="Cumulative LP fees collected (top) and fee yield on capital (bottom)">
                          <span>Fees</span>
                        </MetricTooltip>
                      </TableHead>
                      <TableHead className="w-[150px] min-w-[130px] h-11 py-3 text-right text-xs font-semibold">
                        <MetricTooltip content="Win rate percentage and record of profitable vs unprofitable trades">
                          <span>Win Rate</span>
                        </MetricTooltip>
                      </TableHead>
                      <TableHead className="w-[160px] min-w-[140px] h-11 py-3 text-right text-xs font-semibold">
                        <MetricTooltip content="Net profit or loss in USD and ROI percentage">
                          <span>Net PnL</span>
                        </MetricTooltip>
                      </TableHead>
                      <TableHead className="w-[90px] min-w-[80px] h-11 py-3 text-right text-xs font-semibold pr-4">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pairAggregates.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="py-16 text-center select-none">
                          <p className="text-sm text-muted-foreground">No closed trades recorded yet</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      pairAggregates.slice(pairPage * PAGE, (pairPage + 1) * PAGE).map((row) => {
                        const winRate = row.tradesCount > 0 ? Math.round((row.wins / row.tradesCount) * 100) : 0;
                        const feeYield = row.totalDepositUsd > 0 ? (row.totalFeesUsd / row.totalDepositUsd) * 100 : 0;
                        const openCount = openCountByPair.get(row.baseAddress ? `${row.baseAddress.toLowerCase()}/${(row.quote || '').toUpperCase()}` : `${(row.base || '').toUpperCase()}/${(row.quote || '').toUpperCase()}`) || 0;

                        return (
                          <TableRow
                            key={row.baseAddress ? `${row.baseAddress}/${row.quote}` : row.pair}
                            className="border-border/40 hover:bg-muted/30 transition-colors h-14 sm:h-16"
                          >
                            <TableCell className="w-[270px] min-w-[240px] pl-4 py-2 font-medium overflow-hidden">
                              <StandardPairIdentity
                                chainId={(row as any).chainId ?? 4663}
                                baseSymbol={row.base}
                                quoteSymbol={row.quote}
                                baseAddress={row.baseAddress}
                                quoteAddress={row.quoteAddress}
                                protocol="uniswap"
                                subContent={
                                  <div className="flex items-center gap-1.5 hover:text-foreground/90 transition-colors">
                                    {row.versions.map((v) => (
                                      <CellBadge key={v}>{v.toUpperCase()}</CellBadge>
                                    ))}
                                    <CellBadge>{openCount > 0 ? `${openCount} active` : 'Closed'}</CellBadge>
                                    <span className="text-foreground/35">·</span>
                                    <span className="text-foreground/75">
                                      {row.tradesCount} {row.tradesCount === 1 ? 'trade' : 'trades'}
                                    </span>
                                  </div>
                                }
                              />
                            </TableCell>

                            <TableCell className="w-[150px] min-w-[130px] tabular text-right font-mono text-xs overflow-hidden">
                              <div className="flex flex-col items-end overflow-hidden">
                                <span className="font-semibold text-foreground text-xs sm:text-[13px] tracking-tight tabular-nums truncate">
                                  {usd(row.totalDepositUsd)}
                                </span>
                                <span className="text-[11px] text-muted-foreground font-mono leading-tight mt-0.5 truncate">
                                  {usd(row.totalExitUsd)}
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="w-[140px] min-w-[120px] tabular text-right font-mono text-xs overflow-hidden">
                              <div className="flex flex-col items-end overflow-hidden">
                                <span className="font-semibold text-xs sm:text-[13px] tracking-tight tabular-nums text-emerald-500 truncate">
                                  +{usd(row.totalFeesUsd)}
                                </span>
                                <span className="text-[11px] text-emerald-500/80 font-mono leading-tight mt-0.5 truncate">
                                  +{feeYield.toFixed(2)}%
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="w-[150px] min-w-[130px] tabular text-right font-mono text-xs overflow-hidden">
                              <div className="flex flex-col items-end overflow-hidden">
                                <span className="font-semibold text-xs sm:text-[13px] tracking-tight tabular-nums text-foreground">
                                  {winRate}%
                                </span>
                                <span className="text-[11px] font-mono leading-tight mt-0.5 truncate">
                                  <span className="text-emerald-500 font-medium">{row.wins}W</span>
                                  <span className="text-muted-foreground/40 mx-0.5">·</span>
                                  <span className="text-rose-500 font-medium">{row.losses}L</span>
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="w-[160px] min-w-[140px] tabular text-right font-mono text-xs overflow-hidden">
                              <div className="flex flex-col items-end overflow-hidden">
                                <span className={cn('font-bold text-sm tracking-tight tabular-nums truncate', toneClass(row.totalPnlUsd))}>
                                  {signedUsd(row.totalPnlUsd)}
                                </span>
                                <span className={cn('text-[11px] font-mono font-medium leading-tight mt-0.5 truncate', toneClass(row.totalPnlUsd))}>
                                  {signedPct(row.pnlPct)}
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="w-[90px] min-w-[80px] text-right pr-4 overflow-hidden">
                              <CardDialog
                                kind="token"
                                params={`pair=${encodeURIComponent(row.pair)}&symbol=${encodeURIComponent(row.pair)}`}
                                title={`Share ${row.pair}`}
                                label="Share"
                                isProfit={row.totalPnlUsd >= 0}
                                variant="outline"
                                size="sm"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <HistoryTablePagination
                currentPage={pairPage + 1}
                totalPages={Math.max(1, Math.ceil(pairAggregates.length / PAGE))}
                totalCount={pairAggregates.length}
                pageSize={PAGE}
                itemLabel="pairs"
                onPageChange={(p) => setPairPage(p - 1)}
              />
            </>
          )}

          {historyTab === 'position' && (
            <>
              <div className="overflow-x-auto">
                <Table className="w-full caption-bottom text-sm table-fixed min-w-[960px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b border-border/50 bg-muted/20">
                      <TableHead className="w-[270px] min-w-[240px] h-11 py-3 text-xs font-semibold pl-4">
                        Position
                      </TableHead>
                      <TableHead className="w-[150px] min-w-[130px] h-11 py-3 text-right text-xs font-semibold">
                        <MetricTooltip content="Capital deposited (top) and value returned upon exit (bottom)">
                          <span>Capital</span>
                        </MetricTooltip>
                      </TableHead>
                      <TableHead className="w-[140px] min-w-[120px] h-11 py-3 text-right text-xs font-semibold">
                        <MetricTooltip content="Cumulative LP fees collected (top) and fee yield on capital (bottom)">
                          <span>Fees</span>
                        </MetricTooltip>
                      </TableHead>
                      <TableHead className="w-[150px] min-w-[130px] h-11 py-3 text-right text-xs font-semibold">
                        <MetricTooltip content="Holding duration (top) and when closed (bottom)">
                          <span>Duration</span>
                        </MetricTooltip>
                      </TableHead>
                      <TableHead className="w-[160px] min-w-[140px] h-11 py-3 text-right text-xs font-semibold">
                        <MetricTooltip content="Net profit or loss in USD and ROI percentage">
                          <span>Net PnL</span>
                        </MetricTooltip>
                      </TableHead>
                      <TableHead className="w-[90px] min-w-[80px] h-11 py-3 text-right text-xs font-semibold pr-4">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tradesLoading ? (
                      Array.from({ length: 5 }).map((_, idx) => (
                        <TableRow key={`pos-skeleton-${idx}`} className="border-border/40 h-14 sm:h-16">
                          <TableCell className="w-[270px] min-w-[240px] pl-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <Skeleton className="size-7 rounded-full shrink-0" />
                              <div className="space-y-1 min-w-0">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-3 w-16 opacity-60" />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="w-[150px] min-w-[130px] text-right">
                            <div className="space-y-1 ml-auto w-20">
                              <Skeleton className="h-4 w-20 ml-auto" />
                              <Skeleton className="h-3 w-14 ml-auto opacity-60" />
                            </div>
                          </TableCell>
                          <TableCell className="w-[140px] min-w-[120px] text-right">
                            <div className="space-y-1 ml-auto w-16">
                              <Skeleton className="h-4 w-16 ml-auto" />
                              <Skeleton className="h-3 w-12 ml-auto opacity-60" />
                            </div>
                          </TableCell>
                          <TableCell className="w-[150px] min-w-[130px] text-right">
                            <div className="space-y-1 ml-auto w-16">
                              <Skeleton className="h-4 w-16 ml-auto" />
                              <Skeleton className="h-3 w-14 ml-auto opacity-60" />
                            </div>
                          </TableCell>
                          <TableCell className="w-[160px] min-w-[140px] text-right">
                            <div className="space-y-1 ml-auto w-20">
                              <Skeleton className="h-4 w-20 ml-auto" />
                              <Skeleton className="h-3 w-12 ml-auto opacity-60" />
                            </div>
                          </TableCell>
                          <TableCell className="w-[90px] min-w-[80px] text-right pr-4">
                            <Skeleton className="h-7 w-14 ml-auto rounded-md" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : tradesError ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="py-16 text-center select-none">
                          <p className="text-sm text-muted-foreground">Failed to load trades ({tradesError})</p>
                        </TableCell>
                      </TableRow>
                    ) : tradeRows.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="py-16 text-center select-none">
                          <p className="text-sm text-muted-foreground">No closed trades recorded yet</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      tradeRows.map((t) => {
                        const parts = (t.pair || '').split('/').map((s) => s.trim());
                        const baseSymbol = parts[0] || t.pair;
                        const quoteSymbol = parts[1] || t.quoteKey || 'USDG';
                        const baseAddress = t.tokenAddress || symbolToAddressMap.get(baseSymbol.toUpperCase());
                        const quoteAddress = symbolToAddressMap.get(quoteSymbol.toUpperCase());
                        const feeYield = t.depositUsd > 0 ? (t.feesUsd / t.depositUsd) * 100 : 0;

                        return (
                          <TableRow
                            key={(t as any).chainId ? `${(t as any).chainId}:${t.key}` : t.key}
                            className="border-border/40 hover:bg-muted/30 transition-colors h-14 sm:h-16"
                          >
                            <TableCell className="w-[270px] min-w-[240px] pl-4 py-2 font-medium overflow-hidden">
                              <StandardPairIdentity
                                chainId={(t as any).chainId ?? 4663}
                                baseSymbol={baseSymbol}
                                quoteSymbol={quoteSymbol}
                                baseAddress={baseAddress}
                                quoteAddress={quoteAddress}
                                protocol="uniswap"
                                protocolVersion={t.version}
                                poolId={t.key}
                                subContent={
                                  <div className="flex items-center gap-1.5 hover:text-foreground/90 transition-colors">
                                    <button
                                      type="button"
                                      onClick={(e) => copyKey(e, t.key)}
                                      className="font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer inline-flex items-center gap-1"
                                      title={`Click to copy Position ID: ${t.key}`}
                                    >
                                      <span>#{t.key.replace(/^v[34]:/, '').slice(-8)}</span>
                                      {copiedKey === t.key ? (
                                        <Check className="size-2.5 text-emerald-500" />
                                      ) : (
                                        <Copy className="size-2.5 opacity-40 hover:opacity-100" />
                                      )}
                                    </button>
                                    <CellBadge>{t.version.toUpperCase()}</CellBadge>
                                    {t.heldMs ? (
                                      <>
                                        <span className="text-foreground/35">·</span>
                                        <span className="text-foreground/75">{duration(t.heldMs)}</span>
                                      </>
                                    ) : null}
                                  </div>
                                }
                              />
                            </TableCell>

                            <TableCell className="w-[150px] min-w-[130px] tabular text-right font-mono text-xs overflow-hidden">
                              <div className="flex flex-col items-end overflow-hidden">
                                <span className="font-semibold text-foreground text-xs sm:text-[13px] tracking-tight tabular-nums truncate">
                                  {usd(t.depositUsd)}
                                </span>
                                <span className="text-[11px] text-muted-foreground font-mono leading-tight mt-0.5 truncate">
                                  {usd(t.exitUsd)}
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="w-[140px] min-w-[120px] tabular text-right font-mono text-xs overflow-hidden">
                              <div className="flex flex-col items-end overflow-hidden">
                                <span className="font-semibold text-xs sm:text-[13px] tracking-tight tabular-nums text-emerald-500 truncate">
                                  +{usd(t.feesUsd)}
                                </span>
                                <span className="text-[11px] text-emerald-500/80 font-mono leading-tight mt-0.5 truncate">
                                  +{feeYield.toFixed(2)}%
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="w-[150px] min-w-[130px] tabular text-right font-mono text-xs overflow-hidden">
                              <div className="flex flex-col items-end overflow-hidden">
                                <span className="font-semibold text-xs sm:text-[13px] tracking-tight tabular-nums text-foreground">
                                  {duration(t.heldMs)}
                                </span>
                                <span className="text-[11px] text-muted-foreground font-mono leading-tight mt-0.5 truncate">
                                  {ago(t.closedAt)}
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="w-[160px] min-w-[140px] tabular text-right font-mono text-xs overflow-hidden">
                              <div className="flex flex-col items-end overflow-hidden">
                                {(() => {
                                  const netPnl = t.netPnlUsd ?? t.pnlUsd;
                                  const netPct = t.netPnlPct ?? (t.depositUsd > 0 ? (netPnl / t.depositUsd) * 100 : 0);
                                  const cost = (t.gasUsd ?? 0) + (t.feeChargedUsd ?? 0);
                                  return (
                                    <>
                                      <span className={cn('font-bold text-sm tracking-tight tabular-nums truncate', toneClass(netPnl))}>
                                        {signedUsd(netPnl)}
                                      </span>
                                      <span className={cn('text-[11px] font-mono font-medium leading-tight mt-0.5 truncate', toneClass(netPnl))}>
                                        {signedPct(netPct)}
                                        {cost > 0 && (
                                          <span
                                            className="text-[10px] text-muted-foreground font-normal ml-1 cursor-help"
                                            title={`Gross: ${signedUsd(t.pnlUsd)} · Deductions: -${usd(cost)}`}
                                          >
                                            (-{usd(cost)})
                                          </span>
                                        )}
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>
                            </TableCell>

                            <TableCell className="w-[90px] min-w-[80px] text-right pr-4 overflow-hidden">
                              <CardDialog
                                kind="trade"
                                title={`${t.pair} Trade`}
                                label="Share"
                                isProfit={(t.netPnlUsd ?? t.pnlUsd) >= 0}
                                params={`key=${t.key}`}
                                variant="outline"
                                size="sm"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <HistoryTablePagination
                currentPage={tradePage + 1}
                totalPages={Math.max(1, Math.ceil(tradeTotal / PAGE))}
                totalCount={tradeTotal}
                pageSize={PAGE}
                itemLabel="positions"
                onPageChange={(p) => setTradePage(p - 1)}
                isLoading={tradesLoading}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const PnlTab = () => <Page />;
