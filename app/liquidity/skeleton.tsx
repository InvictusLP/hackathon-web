import { Skeleton } from '@/components/ui/skeleton';

export function LiquiditySkeleton() {
  return (
    <div className="flex flex-col gap-3 sm:gap-3.5 w-full flex-1 h-full min-h-0 overflow-hidden">
      {/* Sub-Nav Tabs Skeleton with Left Filter Tabs and Right Bulk Action Buttons */}
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-border/50 pb-1">
        <div className="flex items-center gap-0.5">
          <div className="h-8 flex items-center gap-1.5 px-2.5 sm:px-3">
            <Skeleton className="h-3.5 w-8 rounded" />
            <Skeleton className="h-3.5 w-4 rounded-sm" />
          </div>
          <div className="h-8 flex items-center gap-1.5 px-2.5 sm:px-3 opacity-60">
            <Skeleton className="h-3.5 w-14 rounded" />
            <Skeleton className="h-3.5 w-4 rounded-sm" />
          </div>
          <div className="h-8 flex items-center gap-1.5 px-2.5 sm:px-3 opacity-60">
            <Skeleton className="h-3.5 w-18 rounded" />
            <Skeleton className="h-3.5 w-4 rounded-sm" />
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Skeleton className="h-7.5 w-20 sm:w-24 rounded-md" />
          <Skeleton className="h-7.5 w-18 sm:w-20 rounded-md" />
        </div>
      </div>

      {/* Outer Card Skeleton matching Positions Tab layout 1:1 */}
      <div className="w-full flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="rounded-xl border border-border/70 bg-card/50 shadow-xs overflow-hidden flex-1 flex flex-col min-h-0">
          <div className="flex-1 divide-y divide-border/40 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 sm:gap-4 px-3 py-2 sm:px-4 sm:py-2.5 h-[53px] sm:h-[57px]"
              >
                {/* Column 1: Pool Avatar & Identity */}
                <div className="flex items-center gap-3 min-w-0 flex-1 sm:flex-none sm:w-[260px] md:w-[280px]">
                  <div className="relative shrink-0">
                    <Skeleton className="size-7 rounded-full" />
                    <Skeleton className="size-5 rounded-full absolute -bottom-0.5 -right-1 ring-1 ring-background" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Skeleton className="h-3.5 w-24 rounded" />
                      <Skeleton className="h-3.5 w-16 rounded-md opacity-60" />
                    </div>
                    <Skeleton className="h-3 w-28 rounded opacity-50" />
                  </div>
                </div>

                {/* Column 2: Status & Range Bounds */}
                <div className="hidden sm:flex sm:flex-col sm:items-start sm:w-[130px] md:w-[150px] shrink-0">
                  <Skeleton className="h-5 w-20 rounded-md" />
                  <Skeleton className="h-3 w-24 rounded opacity-50 mt-1" />
                </div>

                {/* Column 3: Position Value & PnL */}
                <div className="hidden md:flex md:flex-col md:items-end md:w-[140px] lg:w-[160px] shrink-0">
                  <div className="flex items-baseline gap-1.5">
                    <Skeleton className="h-4 w-16 rounded" />
                    <Skeleton className="h-3.5 w-10 rounded opacity-60" />
                  </div>
                  <Skeleton className="h-3 w-28 rounded opacity-50 mt-1" />
                </div>

                {/* Column 4: Fees Earned */}
                <div className="flex flex-col items-end min-w-[100px] sm:w-[130px] lg:w-[150px] shrink-0">
                  <Skeleton className="h-4 w-16 rounded" />
                  <Skeleton className="h-3 w-20 rounded opacity-50 mt-1" />
                </div>

                {/* Column 5: Icon Actions (Claim, Close, Chevron) */}
                <div className="flex items-center gap-1.5 shrink-0 pl-1">
                  <Skeleton className="size-7.5 rounded-md" />
                  <Skeleton className="size-7.5 rounded-md" />
                  <Skeleton className="size-7.5 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiquiditySkeleton;

