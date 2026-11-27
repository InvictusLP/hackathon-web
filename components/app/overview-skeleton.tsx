import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-5 w-full">
      {/* 4 Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { labelW: 'w-20', valW: 'w-28', badgeW: 'w-16', subW: 'w-44' },
          { labelW: 'w-28', valW: 'w-24', badgeW: 'w-20', subW: 'w-36' },
          { labelW: 'w-18', valW: 'w-26', badgeW: 'w-16', subW: 'w-40' },
          { labelW: 'w-24', valW: 'w-20', badgeW: null, subW: 'w-32' },
        ].map((card, i) => (
          <Card key={i} className="rounded-xl border border-border/70 bg-card/50 shadow-xs ring-0 p-3.5 sm:p-4 flex flex-col justify-between">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-0">
              <Skeleton className={`h-4 ${card.labelW} rounded`} />
              <Skeleton className="size-4 rounded" />
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 p-0 pt-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className={`h-8 ${card.valW} rounded-md`} />
                {card.badgeW && <Skeleton className={`h-5 ${card.badgeW} rounded-full`} />}
              </div>
              <Skeleton className={`h-3.5 ${card.subW} rounded`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Middle Grid: PnL Chart + Unclaimed Fees & Health */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        {/* Left: Realized PnL Chart Card */}
        <Card className="rounded-xl border border-border/70 bg-card/50 shadow-xs ring-0 gap-0 py-0 flex flex-col justify-between h-full min-h-[360px] sm:min-h-[380px] overflow-hidden">
          <CardHeader className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 sm:px-4 sm:py-3 border-b border-border/40">
            <div className="space-y-1">
              <Skeleton className="h-5 w-28 rounded" />
              <Skeleton className="h-3.5 w-48 rounded" />
            </div>
            {/* 7d / 14d / 30d tabs */}
            <div className="flex gap-1 bg-muted/40 p-1 rounded-lg border border-border/40">
              <Skeleton className="h-6 w-10 rounded-md" />
              <Skeleton className="h-6 w-10 rounded-md opacity-50" />
              <Skeleton className="h-6 w-10 rounded-md opacity-50" />
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between space-y-3 pt-2">
            {/* Summary stat strip */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 border-b border-border/20 pb-2.5">
              <div className="space-y-1">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="h-6 w-24 rounded" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="h-6 w-16 rounded" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="h-6 w-16 rounded" />
              </div>
            </div>
            {/* Chart placeholder bars */}
            <div className="w-full flex-1 min-h-[200px] sm:min-h-[220px] flex items-end gap-1.5 sm:gap-2 px-2 pt-1 pb-0.5">
              {[45, 65, 30, 80, 55, 90, 40, 70, 85, 35, 60, 75, 50, 95, 60].map((h, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                  <Skeleton
                    className="w-full rounded-xs opacity-60"
                    style={{ height: `${h}%` }}
                  />
                  <Skeleton className="h-2 w-3 rounded-full opacity-30" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Right Stack: Unclaimed Fees + Liquidity Health */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 xl:grid-rows-2 h-full">
          {/* Card 1: Unclaimed Fees */}
          <Card className="rounded-xl border border-border/70 bg-card/50 shadow-xs ring-0 gap-0 py-0 flex flex-col justify-between overflow-hidden">
            <CardHeader className="p-3 sm:px-4 sm:py-3 border-b border-border/40 shrink-0">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32 rounded" />
                <Skeleton className="size-4 rounded" />
              </div>
              <Skeleton className="h-3.5 w-52 rounded" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between">
                <Skeleton className="h-8 w-28 rounded-md" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="h-9 w-full rounded-xl" />
            </CardContent>
          </Card>

          {/* Card 2: Liquidity Health */}
          <Card className="rounded-xl border border-border/70 bg-card/50 shadow-xs ring-0 gap-0 py-0 flex flex-col justify-between overflow-hidden">
            <CardHeader className="p-3 sm:px-4 sm:py-3 border-b border-border/40 shrink-0">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32 rounded" />
                <Skeleton className="size-4 rounded" />
              </div>
              <Skeleton className="h-3.5 w-44 rounded" />
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Distribution bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-20 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              {/* Legend rows */}
              <div className="grid grid-cols-3 gap-1 pt-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-1">
                    <Skeleton className="h-2.5 w-12 rounded" />
                    <Skeleton className="h-4 w-16 rounded" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Active Positions Table Card */}
      <Card className="rounded-xl border border-border/70 bg-card/50 shadow-xs ring-0 gap-0 py-0 min-h-[260px] sm:min-h-[300px] flex flex-col justify-between overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between p-3 sm:px-4 sm:py-3 border-b border-border/40 shrink-0">
          <div className="space-y-1">
            <Skeleton className="h-5 w-36 rounded" />
            <Skeleton className="h-3.5 w-56 rounded" />
          </div>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-t border-border/20">
            {/* Table Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20 border-b border-border/20 text-xs">
              <Skeleton className="h-3.5 w-20 rounded" />
              <Skeleton className="h-3.5 w-16 rounded hidden sm:block" />
              <Skeleton className="h-3.5 w-16 rounded" />
              <Skeleton className="h-3.5 w-14 rounded" />
              <Skeleton className="h-3.5 w-12 rounded" />
            </div>
            {/* Table Rows */}
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-3 border-b border-border/15 last:border-b-0"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <Skeleton className="size-7 rounded-full" />
                    <Skeleton className="size-5 rounded-full absolute -bottom-0.5 -right-1 ring-1 ring-background" />
                  </div>
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-20 rounded" />
                    <Skeleton className="h-3 w-28 rounded" />
                  </div>
                </div>
                <Skeleton className="h-4 w-20 rounded hidden sm:block" />
                <Skeleton className="h-4 w-16 rounded" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-7 w-16 rounded-lg" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

