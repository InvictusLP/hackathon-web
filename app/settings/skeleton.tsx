import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-5 w-full flex-1">
      {/* Gas Speed & Limit Card */}
        <Card className="border-border/70 bg-card/60 shadow-xs">
          <CardHeader className="pb-3 border-b border-border/40 space-y-1">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-44 rounded" />
              <Skeleton className="h-4 w-28 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-72 rounded opacity-60" />
          </CardHeader>
          <CardContent className="pt-4 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="space-y-1">
                <Skeleton className="h-4 w-40 rounded" />
                <Skeleton className="h-3 w-64 rounded opacity-60" />
              </div>
              <Skeleton className="h-9 w-32 rounded-md" />
            </div>
          </CardContent>
        </Card>

        {/* Execution & Slippage Card */}
        <Card className="border-border/70 bg-card/60 shadow-xs">
          <CardHeader className="pb-3 border-b border-border/40 space-y-1">
            <Skeleton className="h-5 w-40 rounded" />
            <Skeleton className="h-3.5 w-64 rounded opacity-60" />
          </CardHeader>
          <CardContent className="p-0 divide-y divide-border/20">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between px-5 py-4">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-36 rounded" />
                  <Skeleton className="h-3 w-60 rounded opacity-50" />
                </div>
                {i % 2 === 0 ? (
                  <Skeleton className="h-5 w-9 rounded-full" />
                ) : (
                  <Skeleton className="h-9 w-32 rounded-md" />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
    </div>
  );
}

export default SettingsSkeleton;
