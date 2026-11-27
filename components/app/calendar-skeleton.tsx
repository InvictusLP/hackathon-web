import { Skeleton } from '@/components/ui/skeleton';

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function CalendarSkeleton() {
  return (
    <div className="flex flex-col w-full flex-1">
      <div className="w-full flex-1 flex flex-col min-h-0">
        {/* Calendar Controller & Grid Outer Shell */}
        <div className="rounded-xl border border-border/70 bg-card/50 shadow-xs overflow-hidden flex-1 flex flex-col min-h-[calc(100svh-12rem)]">
          {/* Header Control Toolbar */}
          <div className="shrink-0 flex flex-col gap-3 border-b border-border/40 p-3 sm:px-4 sm:py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-6 w-36 rounded-md" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-3 w-44 rounded opacity-60" />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {/* Month Dropdown Skeleton */}
              <Skeleton className="w-36 sm:w-44 h-8 rounded-md" />

              {/* Prev / Next Month Buttons Skeleton */}
              <div className="flex items-center gap-1">
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="size-8 rounded-md" />
              </div>
            </div>
          </div>

          {/* Weekday Column Headers */}
          <div className="shrink-0 grid grid-cols-7 border-b border-border/40 text-center py-2.5 bg-muted/10">
            {WEEKDAYS.map((day, idx) => (
              <div
                key={day}
                className={`text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase ${
                  idx >= 5 ? 'text-muted-foreground/40' : 'text-muted-foreground/70'
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Performance Calendar Grid */}
          <div className="flex-1 min-h-0 p-2 sm:p-2.5 bg-card/30 flex flex-col justify-between">
            <div className="grid grid-cols-7 auto-rows-fr gap-1 sm:gap-1.5 flex-1 min-h-0">
              {Array.from({ length: 35 }).map((_, i) => (
                <div
                  key={i}
                  className="h-full min-h-14 sm:min-h-16 rounded-lg border border-border/30 bg-card/40 p-1.5 sm:p-2 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-4 rounded" />
                    {i % 5 === 1 && <Skeleton className="size-1.5 rounded-full opacity-60" />}
                  </div>
                  <div className="space-y-1">
                    <Skeleton className="h-3.5 w-12 sm:w-14 rounded" />
                    <Skeleton className="h-2.5 w-8 rounded opacity-50" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CalendarSkeleton;
