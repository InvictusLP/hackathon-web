'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Fiat } from '@/components/app/fiat';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  LineChart as LineChartIcon,
  PieChart,
  Wallet,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart';
import { ActionProgress, useAction } from '@/components/app/action';
import { useSnapshot } from '@/components/app/live';
import { useNetwork } from '@/lib/network';
import { OverviewSkeleton } from '@/components/app/overview-skeleton';
import { CellBadge, StandardPairIdentity } from '@/components/app/pool-cells';
import { StatCard } from '@/components/app/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePersistentTab } from '@/lib/use-persistent-tab';
import { pct, signedUsd, toneClass, usd } from '@/lib/format';
import { cn } from '@/lib/utils';
import { buildCumulativePnlTimeline, type PnlTimelinePoint } from '@/lib/pnl-chart';

const pnlChartConfig = {
  profit: {
    label: 'Profit',
    color: 'var(--up, #10b981)',
  },
  loss: {
    label: 'Loss',
    color: 'var(--down, #f43f5e)',
  },
  net: {
    label: 'Net PnL',
    color: 'var(--up, #10b981)',
  },
} satisfies ChartConfig;

export const OverviewTabContent = () => {
  const snap = useSnapshot();
  const claim = useAction();
  const [pnlRange, setPnlRange] = usePersistentTab<'7d' | '14d' | '30d'>({
    key: 'invictus:subnav:overview:pnlRange',
    defaultValue: '30d',
    validValues: ['7d', '14d', '30d'] as const,
    syncUrl: false,
  });

  const { inNetwork } = useNetwork();
  // Only the selected network's positions; every network lists them all.
  const positions = useMemo(() => (snap?.positions ?? []).filter((p) => inNetwork(p.chainId)), [snap?.positions, inNetwork]);
  const { claimable, nearBoundary, outOfRange, activeCount, activeUsd, boundaryUsd, outUsd } = useMemo(() => {
    const claimable: typeof positions = [];
    const nearBoundary: typeof positions = [];
    const outOfRange: typeof positions = [];
    let activeCount = 0;
    let activeUsd = 0;
    let boundaryUsd = 0;
    let outUsd = 0;
    for (const p of positions) {
      if (p.feesUsd > 0) claimable.push(p);
      if (!p.inRange) {
        outOfRange.push(p);
        outUsd += p.totalUsd;
      } else if (p.rangePos < 0.2 || p.rangePos > 0.8) {
        nearBoundary.push(p);
        boundaryUsd += p.totalUsd;
      } else {
        activeCount++;
        activeUsd += p.totalUsd;
      }
    }
    return { claimable, nearBoundary, outOfRange, activeCount, activeUsd, boundaryUsd, outUsd };
  }, [positions]);

  if (!snap) {
    return <OverviewSkeleton />;
  }

  const t = snap.totals ?? {
    netWorthUsd: 0,
    todayDeltaPct: null,
    todayDeltaUsd: null,
    valueUsd: 0,
    feesUsd: 0,
    pnlPct: 0,
    count: 0,
    overallPnlUsd: 0,
    realizedUsd: 0,
    depositUsd: 0,
    feesGeneratedUsd: 0,
    noBasis: 0,
  };
  const healthTotal = Math.max(activeUsd + boundaryUsd + outUsd, 1);
  const pnlDaysCount = pnlRange === '7d' ? 7 : pnlRange === '14d' ? 14 : 30;
  const pnlHistory = snap.pnlHistory ?? [];
  const pnlMap = new Map(pnlHistory.map((item) => [item.day, item.pnlUsd]));

  // Generate continuous timeline of N days ending today anchored to server timezone authority
  const stackedChartData = buildCumulativePnlTimeline(pnlDaysCount, pnlMap, {
    todayKey: snap.todayKey,
    serverTime: snap.at,
    tzOffsetMin: snap.tzOffsetMin,
    latestKnownDay: pnlHistory[pnlHistory.length - 1]?.day,
  });

  const periodRealizedUsd = stackedChartData.reduce((sum, day) => sum + day.dailyNet, 0);
  const pnlPositiveDays = stackedChartData.filter((day) => day.dailyNet > 0).length;
  const pnlNegativeDays = stackedChartData.filter((day) => day.dailyNet < 0).length;
  const bestPnlDay = stackedChartData.reduce((best, day) => (day.dailyNet > best ? day.dailyNet : best), 0);
  const largestFeePosition = claimable.reduce<typeof claimable[number] | null>(
    (largest, position) => (!largest || position.feesUsd > largest.feesUsd ? position : largest),
    null,
  );
  const healthPct = (value: number): string => `${Math.round((value / healthTotal) * 100)}%`;
  const showProgress = claim.awaiting !== null || claim.steps.length > 0;
  const claimAll = (): void => {
    void claim.run('/api/collect-all', {});
  };
  const totalRoiPct = t.depositUsd > 0 ? (t.overallPnlUsd / t.depositUsd) * 100 : t.pnlPct;

  return (
    <div className="flex flex-col gap-5 w-full flex-1">
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={PieChart}
          label="Portfolio Value"
          value={<>{usd(t.netWorthUsd)}<Fiat usd={t.netWorthUsd} className="block mt-1" /></>}
          delta={t.todayDeltaPct}
          deltaLabel={t.todayDeltaPct === null ? undefined : `${t.todayDeltaPct >= 0 ? '+' : ''}${t.todayDeltaPct.toFixed(2)}%`}
          sub={t.todayDeltaUsd === null ? 'No 24h baseline' : `${signedUsd(t.todayDeltaUsd)} today`}
        />
        <StatCard
          icon={Coins}
          label="Active Liquidity"
          value={usd(t.valueUsd + t.feesUsd)}
          delta={t.pnlPct}
          deltaLabel={`${t.pnlPct >= 0 ? '+' : ''}${t.pnlPct.toFixed(2)}%`}
          sub={`${t.count} active range${t.count === 1 ? '' : 's'}`}
        />
        <StatCard
          icon={LineChartIcon}
          label="Total PnL"
          value={signedUsd(t.overallPnlUsd)}
          valueClass={toneClass(t.overallPnlUsd)}
          delta={totalRoiPct}
          deltaLabel={`${totalRoiPct >= 0 ? '+' : ''}${totalRoiPct.toFixed(2)}%`}
          sub={`Realized ${signedUsd(t.realizedUsd)}`}
        />
        <StatCard
          icon={Wallet}
          label="Wallet Balance"
          value={usd(snap.wallet?.liquidUsd ?? 0)}
          sub={snap.wallet ? `${snap.wallet.eth.toFixed(4)} ETH for gas` : 'Not connected'}
        />
      </div>


      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)] flex-1 min-h-0">
        <Card className="rounded-xl border border-border/70 bg-card/50 shadow-xs ring-0 gap-0 py-0 flex flex-col overflow-hidden h-full min-h-[calc(100svh-22rem)]">
          <CardHeader className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 p-3 sm:px-4 sm:py-3 border-b border-border/40">
            <div>
              <CardTitle className="text-base font-semibold">Realized PnL</CardTitle>
              <CardDescription className="text-xs">
                Daily profit and loss from completed position activity.
              </CardDescription>
            </div>
            <Tabs value={pnlRange} onValueChange={(v) => setPnlRange(v as '7d' | '14d' | '30d')}>
              <TabsList className="h-7.5 bg-muted/60 p-0.5">
                <TabsTrigger value="7d" className="text-xs px-2.5 h-6.5">7D</TabsTrigger>
                <TabsTrigger value="14d" className="text-xs px-2.5 h-6.5">14D</TabsTrigger>
                <TabsTrigger value="30d" className="text-xs px-2.5 h-6.5">30D</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="flex flex-1 min-h-0 flex-col justify-between gap-2.5 p-3.5 sm:p-4">
            <div className="flex items-baseline justify-between gap-3 shrink-0">
              <div>
                <div className={cn('tabular text-lg sm:text-xl font-bold tracking-tight', toneClass(periodRealizedUsd))}>
                  {signedUsd(periodRealizedUsd)}
                </div>
                <div className="text-muted-foreground mt-0.5 text-xs">
                  Realized in the last {pnlDaysCount} days
                </div>
              </div>
              <div className="text-right">
                <div className="tabular text-sm font-semibold">
                  {pnlPositiveDays} <span className="text-up font-medium">profit days</span>
                </div>
                <div className="tabular text-xs text-muted-foreground">
                  {pnlNegativeDays} loss days
                </div>
              </div>
            </div>

            <div className="w-full flex-1 min-h-0 flex flex-col justify-center pt-1 pb-0.5">
              <ChartContainer config={pnlChartConfig} className="h-full min-h-0 w-full aspect-auto">
                <BarChart accessibilityLayer data={stackedChartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    tickMargin={8}
                    axisLine={false}
                    interval={pnlRange === '30d' ? 4 : pnlRange === '14d' ? 1 : 0}
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
                  <YAxis hide domain={[0, (dataMax: number) => (dataMax > 0 ? dataMax * 1.15 : 10)]} />
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
                                 <span className="size-2 rounded-xs bg-up" /> Profit
                              </span>
                              <span className="tabular font-medium text-up">+{usd(item.profit)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <span className="size-2 rounded-xs bg-down" /> Loss
                              </span>
                              <span className="tabular font-medium text-down">-{usd(item.loss)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/40 font-semibold">
                              <span className="text-muted-foreground">Day Net</span>
                              <span className={cn('tabular', toneClass(item.dailyNet))}>
                                {signedUsd(item.dailyNet)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-muted-foreground text-[11px]">
                              <span>Cumulative</span>
                              <span className={cn('tabular font-semibold', toneClass(item.cumulative))}>
                                {signedUsd(item.cumulative)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar
                    dataKey="profit"
                    name="Profit"
                    stackId="a"
                    fill="var(--color-profit, var(--up, #10b981))"
                    radius={[0, 0, 2, 2]}
                  />
                  <Bar
                    dataKey="loss"
                    name="Loss"
                    stackId="a"
                    fill="var(--color-loss, var(--down, #f43f5e))"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-border/40 pt-2 text-xs shrink-0">
              <div>
                <div className="text-muted-foreground">Best day ({pnlRange.toUpperCase()})</div>
                <div className="tabular mt-0.5 font-semibold text-up">{signedUsd(bestPnlDay)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">All-time realized</div>
                <div className={cn('tabular mt-0.5 font-medium', toneClass(t.realizedUsd))}>{signedUsd(t.realizedUsd)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 xl:grid-rows-2 h-full">
          <Card className="rounded-xl border border-border/70 bg-card/50 shadow-xs ring-0 gap-0 py-0 flex flex-col overflow-hidden">
            <CardHeader className="p-3 sm:px-4 sm:py-3 border-b border-border/40 shrink-0">
              <CardTitle className="text-sm font-semibold">Unclaimed Fees</CardTitle>
              <CardDescription className="text-xs">
                Available across active ranges.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-2.5 p-3 sm:p-3.5">
              <div>
                <div className="tabular text-lg sm:text-xl font-bold tracking-tight text-up">
                  {usd(t.feesUsd)}
                </div>
                <div className="text-muted-foreground mt-0.5 text-xs">
                  Across {claimable.length} claimable position{claimable.length === 1 ? '' : 's'}
                </div>
              </div>
              {largestFeePosition && (
                <div className="flex items-center justify-between gap-3 border-y border-border/40 py-1.5 text-xs">
                  <span className="text-muted-foreground">Largest contributor</span>
                  <span className="tabular font-medium">
                    {largestFeePosition.symbol} / {largestFeePosition.quoteSymbol}{' '}
                    <span className="text-up font-semibold">+{usd(largestFeePosition.feesUsd)}</span>
                  </span>
                </div>
              )}
              {showProgress ? (
                <ActionProgress steps={claim.steps} awaiting={claim.awaiting} onDone={claim.reset} />
              ) : (
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit h-8 px-3 text-xs gap-1.5 shadow-xs cursor-pointer"
                    onClick={claimAll}
                    disabled={!claimable.length || claim.busy}
                  >
                    <span>
                      {claimable.length
                        ? `Claim ${claimable.length} position${claimable.length === 1 ? '' : 's'}`
                        : 'No fees available'}
                    </span>
                    <Coins className="size-3.5" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border/70 bg-card/50 shadow-xs ring-0 gap-0 py-0 flex flex-col overflow-hidden">
            <CardHeader className="p-3 sm:px-4 sm:py-3 border-b border-border/40 shrink-0">
              <CardTitle className="text-sm font-semibold">Liquidity Health</CardTitle>
              <CardDescription className="text-xs">
                Value-weighted range status.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-2.5 p-3 sm:p-3.5">
              <div
                className="bg-muted flex h-1.5 overflow-hidden rounded-full"
                aria-label="Liquidity health distribution"
              >
                <div className="bg-up" style={{ width: `${(activeUsd / healthTotal) * 100}%` }} />
                <div className="bg-amber-500" style={{ width: `${(boundaryUsd / healthTotal) * 100}%` }} />
                <div className="bg-down" style={{ width: `${(outUsd / healthTotal) * 100}%` }} />
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Active <span className="tabular">({activeCount})</span>
                  </span>
                  <span className="tabular font-medium text-up">
                    {usd(activeUsd)} · {healthPct(activeUsd)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Near edge <span className="tabular">({nearBoundary.length})</span>
                  </span>
                  <span className="tabular font-medium text-amber-500">
                    {usd(boundaryUsd)} · {healthPct(boundaryUsd)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Out of range <span className="tabular">({outOfRange.length})</span>
                  </span>
                  <span className="tabular font-medium text-down">
                    {usd(outUsd)} · {healthPct(outUsd)}
                  </span>
                </div>
              </div>
              <div className="space-y-2 pt-0.5">
                {positions.length > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-2.5 py-1.5 text-xs">
                    {outOfRange.length === 0 ? (
                      <>
                        <CheckCircle2 className="size-3.5 text-up shrink-0" />
                        <span className="text-foreground/85 font-medium">All active positions are within range</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                        <span className="text-foreground/85 font-medium">
                          {outOfRange.length} {outOfRange.length === 1 ? 'position' : 'positions'} out of range
                        </span>
                      </>
                    )}
                  </div>
                )}

                <div>
                  <Button variant="outline" size="sm" asChild className="w-fit h-8 px-3 text-xs gap-1.5 shadow-xs cursor-pointer">
                    <Link href="/liquidity">
                      <span>Manage positions</span>
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="rounded-xl border border-border/70 bg-card/50 shadow-xs ring-0 gap-0 py-0 overflow-hidden flex flex-col min-h-[260px] sm:min-h-[300px] justify-between">
        <CardHeader className="shrink-0 flex flex-row items-center justify-between gap-3 p-3 sm:px-4 sm:py-3 border-b border-border/40">
          <div>
            <CardTitle className="text-base font-semibold">Active Positions</CardTitle>
            <CardDescription className="text-xs">
              Highest-priority ranges first.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild className="gap-1 text-xs">
            <Link href="/liquidity">
              <span>View all</span>
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0 flex-1 flex flex-col justify-between">
          {positions.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-xs font-semibold">Pool</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Value</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Fees</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...positions]
                    .sort((a, b) => Number(b.inRange) - Number(a.inRange) || b.valueUsd - a.valueUsd || b.feesUsd - a.feesUsd)
                    .slice(0, 5)
                    .map((p) => (
                      <TableRow key={p.key} className="border-border/40 hover:bg-muted/30">
                        <TableCell className="font-medium">
                          <StandardPairIdentity
                            chainId={p.chainId ?? 4663}
                            poolId={p.poolId}
                            baseSymbol={p.symbol}
                            quoteSymbol={p.quoteSymbol}
                            baseAddress={p.tokenAddress}
                            protocol="uniswap"
                            protocolVersion={p.version}
                            subContent={
                              <div className="flex items-center gap-1.5 hover:text-foreground/90 transition-colors">
                                <span className="font-semibold text-foreground">
                                  {pct(p.feePct, 2)}
                                </span>
                                <span className="text-foreground/35">·</span>
                                <span className="text-foreground/75">
                                  {p.tickSpacing ?? (p.feePct <= 0.01 ? 1 : p.feePct <= 0.05 ? 10 : p.feePct <= 0.3 ? 60 : 200)}
                                </span>
                                <CellBadge>{p.version.toUpperCase()}</CellBadge>
                              </div>
                            }
                          />
                        </TableCell>
                        <TableCell className="tabular text-right font-medium">{usd(p.valueUsd)}</TableCell>
                        <TableCell className="tabular text-right text-emerald-500 font-medium">+{usd(p.feesUsd)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs font-medium',
                              p.inRange ? 'border-up/30 text-up' : 'border-down/30 text-down',
                            )}
                          >
                            {p.inRange ? 'In range' : 'Out of range'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" asChild className="shadow-xs">
                            <Link href="/liquidity">Manage</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-16 text-center select-none">
              <p className="text-sm text-muted-foreground">No active positions yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const OverviewTab = () => <OverviewTabContent />;
