import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function AdminSkeleton() {
  return (
    <div className="flex flex-col gap-5 w-full flex-1">

      {/* 8 Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Card key={i} className="border-border/70 bg-card/60 shadow-xs p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-24 rounded" />
              <Skeleton className="size-4 rounded" />
            </div>
            <Skeleton className="h-7 w-24 rounded-md" />
            <Skeleton className="h-3 w-36 rounded opacity-60" />
          </Card>
        ))}
      </div>

      {/* Settings Cards Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i} className="border-border/70 bg-card/60 shadow-xs">
            <CardHeader className="pb-3 border-b border-border/40 space-y-1">
              <Skeleton className="h-5 w-36 rounded" />
              <Skeleton className="h-3.5 w-60 rounded opacity-60" />
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Users Table Card */}
      <Card className="border-border/70 bg-card/60 shadow-xs">
        <CardHeader className="pb-3 border-b border-border/40 space-y-1">
          <Skeleton className="h-5 w-32 rounded" />
          <Skeleton className="h-3.5 w-52 rounded opacity-60" />
        </CardHeader>
        <CardContent className="p-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3 border-b border-border/20 last:border-b-0">
              <div className="flex items-center gap-2.5">
                <Skeleton className="size-7 rounded-full" />
                <Skeleton className="h-4 w-28 rounded" />
              </div>
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-4 w-16 rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminSkeleton;
