import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function PnlSkeleton() {
  return (
    <div className="flex flex-col gap-5 w-full flex-1">
      {/* Realized Performance & Chart Card Skeleton */}
      <Card className="rounded-xl border border-border/70 bg-card/50 shadow-xs ring-0 gap-0 py-0 overflow-hidden min-h-[calc(100svh-12rem)] flex flex-col justify-between">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:px-4 sm:py-3 border-b border-border/40 shrink-0">
          <div className="space-y-1">
            <Skeleton className="h-5 w-32 rounded" />
            <Skeleton className="h-3.5 w-64 rounded" />
          </div>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </CardHeader>

        {/* 6 Metrics Grid Skeleton - Full Height Dividers */}
        <div className="border-b border-border/40 bg-muted/5 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 lg:divide-x divide-border/40">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex flex-col justify-between p-3.5 sm:px-4 sm:py-3 min-h-20">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="h-6 w-24 rounded-md my-0.5" />
                <Skeleton className="h-2.5 w-16 rounded opacity-60" />
              </div>
            ))}
          </div>
        </div>

        <CardContent className="p-4 sm:p-5 flex-1 flex flex-col min-h-0">
          {/* Line Chart Skeleton */}
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <div className="w-full flex-1 min-h-[280px] sm:min-h-[340px] lg:min-h-[380px] flex items-end gap-2 px-2 pt-4">
              {[35, 55, 25, 65, 45, 80, 50, 90, 70, 45, 60, 75, 40, 65].map((h, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1.5">
                  <Skeleton className="w-full rounded-xs opacity-50" style={{ height: `${h}%` }} />
                  <Skeleton className="h-2 w-3 rounded-full opacity-30" />
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-border/40 mt-auto shrink-0">
              <Skeleton className="h-3.5 w-28 rounded" />
              <Skeleton className="h-3.5 w-28 rounded" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* History Table Skeleton */}
      <Card className="rounded-xl border border-border/70 bg-card/50 shadow-xs ring-0 gap-0 py-0 overflow-hidden flex flex-col">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:px-4 sm:py-3 border-b border-border/40 shrink-0">
          <div className="space-y-1">
            <Skeleton className="h-5 w-24 rounded" />
            <Skeleton className="h-3.5 w-60 rounded" />
          </div>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </CardHeader>
        <CardContent className="p-0 flex flex-col min-h-0">
          <div className="overflow-x-auto">
            <div className="w-full min-w-[960px]">
              <div className="h-11 py-3 px-4 border-b border-border/50 bg-muted/20 flex items-center justify-between">
                <div className="w-[270px] pl-4"><Skeleton className="h-4 w-20" /></div>
                <div className="w-[150px] text-right flex justify-end"><Skeleton className="h-4 w-16" /></div>
                <div className="w-[140px] text-right flex justify-end"><Skeleton className="h-4 w-16" /></div>
                <div className="w-[150px] text-right flex justify-end"><Skeleton className="h-4 w-16" /></div>
                <div className="w-[160px] text-right flex justify-end"><Skeleton className="h-4 w-16" /></div>
                <div className="w-[90px] text-right pr-4 flex justify-end"><Skeleton className="h-4 w-12" /></div>
              </div>
              <div className="divide-y divide-border/30">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-4 h-16">
                    <div className="w-[270px] pl-4 flex items-center gap-2.5 shrink-0">
                      <Skeleton className="size-7 rounded-full shrink-0" />
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-24 rounded" />
                        <Skeleton className="h-3 w-16 rounded opacity-60" />
                      </div>
                    </div>
                    <div className="w-[150px] flex flex-col items-end space-y-1">
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-3 w-10 rounded opacity-60" />
                    </div>
                    <div className="w-[140px] flex flex-col items-end space-y-1">
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-3 w-12 rounded opacity-60" />
                    </div>
                    <div className="w-[150px] flex flex-col items-end space-y-1">
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-3 w-12 rounded opacity-60" />
                    </div>
                    <div className="w-[160px] flex flex-col items-end space-y-1">
                      <Skeleton className="h-4 w-20 rounded" />
                      <Skeleton className="h-3 w-12 rounded opacity-60" />
                    </div>
                    <div className="w-[90px] pr-4 flex justify-end"><Skeleton className="h-7 w-14 rounded-md" /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="shrink-0 py-2.5 px-4 border-t border-border/40 bg-muted/10 flex items-center justify-between">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-7 w-48 rounded-md" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default PnlSkeleton;
