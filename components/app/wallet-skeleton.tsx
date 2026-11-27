import { Skeleton } from '@/components/ui/skeleton';

export function WalletSkeleton() {
  return (
    <div className="w-full flex-1 flex flex-col min-h-0">
      <div className="w-full flex-1 flex flex-col min-h-[calc(100svh-12rem)] rounded-xl border border-border/70 bg-card/50 overflow-hidden shadow-xs">
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 grid-rows-[52%_48%] gap-px bg-border/20">
          {/* Top-Left: Wallets Table Skeleton */}
          <div className="lg:col-span-7 bg-background/50 flex flex-col min-h-0 p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/20">
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-7 w-24 rounded-md" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border/10">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-4 rounded" />
                    <Skeleton className="h-3.5 w-24 rounded" />
                  </div>
                  <Skeleton className="h-3.5 w-16 rounded" />
                  <Skeleton className="h-6 w-20 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Top-Right: Quick Actions Skeleton */}
          <div className="lg:col-span-5 bg-background/50 flex flex-col min-h-0 p-4">
            <div className="pb-2 border-b border-border/20 mb-3">
              <Skeleton className="h-4 w-24 rounded" />
            </div>
            <div className="grid grid-cols-3 gap-2 flex-1 items-center">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5 p-2">
                  <Skeleton className="size-11 rounded-full" />
                  <Skeleton className="h-2.5 w-10 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Bottom: Holdings Skeleton */}
          <div className="lg:col-span-12 bg-background/50 flex flex-col min-h-0 p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/20">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-3 w-12 rounded" />
            </div>
            <div className="space-y-2 flex-1 overflow-hidden">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border/10">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-6 rounded-full" />
                    <Skeleton className="h-3.5 w-20 rounded" />
                  </div>
                  <Skeleton className="h-3.5 w-16 rounded" />
                  <Skeleton className="h-3.5 w-16 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
