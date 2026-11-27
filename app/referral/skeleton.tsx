import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function ReferralSkeleton() {
  return (
    <div className="flex flex-col gap-5 flex-1 w-full min-h-[calc(100svh-8rem)]">
      {/* Invite Link Card */}
      <Card className="border-border/70 bg-card/60 shadow-xs shrink-0">
        <CardHeader className="pb-3 border-b border-border/40 space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 rounded shrink-0" />
            <Skeleton className="h-5 w-36 rounded" />
          </div>
          <Skeleton className="h-3.5 w-full max-w-md rounded opacity-60" />
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {/* Link & Copy Action */}
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-10 flex-1 min-w-[200px] rounded-lg" />
            <Skeleton className="h-10 w-28 rounded-md shrink-0" />
          </div>

          {/* Custom Code Editor */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Skeleton className="h-3.5 w-20 rounded" />
            <Skeleton className="h-9 w-44 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </CardContent>
      </Card>

      {/* Unified Referral Overview Card */}
      <Card className="border-border/70 bg-card/60 shadow-xs flex-1 flex flex-col justify-between min-h-[240px] sm:min-h-[270px]">
        <CardHeader className="pb-3 border-b border-border/40 space-y-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 rounded shrink-0" />
            <Skeleton className="h-5 w-36 rounded" />
          </div>
          <Skeleton className="h-3.5 w-full max-w-sm rounded opacity-60" />
        </CardHeader>
        <CardContent className="p-0 flex-1 flex flex-col justify-between">
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30 flex-1">
            {/* Left Cell: Traders Metrics */}
            <div className="p-5 sm:p-6 flex flex-col justify-between gap-4">
              <div>
                <Skeleton className="h-3.5 w-28 rounded" />
                <div className="space-y-1 mt-2">
                  <Skeleton className="h-9 w-20 rounded-md" />
                  <Skeleton className="h-3.5 w-56 rounded opacity-60" />
                </div>
              </div>
            </div>

            {/* Right Cell: Commission & Rewards */}
            <div className="p-5 sm:p-6 space-y-4 flex flex-col justify-between">
              <div>
                <Skeleton className="h-3.5 w-36 rounded" />
                <div className="space-y-1 mt-2">
                  <Skeleton className="h-9 w-28 rounded-md" />
                  <Skeleton className="h-3.5 w-60 rounded opacity-60" />
                </div>
              </div>

              <div className="pt-2 mt-auto">
                <Skeleton className="h-8 w-36 rounded-md" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ReferralSkeleton;
