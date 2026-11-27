import { Skeleton } from '@/components/ui/skeleton';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function PoolsSkeleton() {
  return (
    <div className="space-y-3 flex-1 flex flex-col h-full min-h-0 overflow-hidden">
      {/* Curated Discovery Lenses & Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-1">
        <div className="flex items-center gap-1">
          <Skeleton className="h-8 w-12 rounded-md" />
          <Skeleton className="h-8 w-14 rounded-md opacity-60" />
          <Skeleton className="h-8 w-18 rounded-md opacity-60" />
          <Skeleton className="h-8 w-14 rounded-md opacity-60" />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-8 rounded-md" />
          <Skeleton className="h-7 w-8 rounded-md" />
        </div>
      </div>

      {/* Directory Table Skeleton - Fixed column widths */}
      <div className="rounded-xl border border-border/70 bg-card/60 shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-x-auto flex-1 min-h-0 flex flex-col app-scrollbar">
          <div
            style={{ scrollbarGutter: 'stable' }}
            className="border-b border-border/50 bg-muted/20 shrink-0 select-none min-w-[960px]"
          >
            <table className="table-fixed w-full caption-bottom text-sm">
              <TableHeader>
                <TableRow className="hover:bg-transparent border-0">
                  <TableHead className="w-[260px] min-w-[240px] h-11 py-3 text-xs font-semibold pl-4">Pool</TableHead>
                  <TableHead className="w-[125px] min-w-[110px] h-11 py-3 text-right text-xs font-semibold hidden sm:table-cell">Price</TableHead>
                  <TableHead className="w-[95px] min-w-[85px] h-11 py-3 text-right text-xs font-semibold hidden lg:table-cell">Age</TableHead>
                  <TableHead className="w-[105px] min-w-[95px] h-11 py-3 text-right text-xs font-semibold hidden md:table-cell">MC</TableHead>
                  <TableHead className="w-[115px] min-w-[100px] h-11 py-3 text-right text-xs font-semibold">TVL</TableHead>
                  <TableHead className="w-[115px] min-w-[100px] h-11 py-3 text-right text-xs font-semibold hidden md:table-cell">Volume</TableHead>
                  <TableHead className="w-[125px] min-w-[110px] h-11 py-3 text-right text-xs font-semibold">Fees</TableHead>
                  <TableHead className="w-[95px] min-w-[85px] h-11 py-3 text-right text-xs font-semibold pr-4">Action</TableHead>
                </TableRow>
              </TableHeader>
            </table>
          </div>

          <div
            style={{ scrollbarGutter: 'stable' }}
            className="overflow-y-auto flex-1 min-h-0 app-scrollbar min-w-[960px]"
          >
            <table className="table-fixed w-full caption-bottom text-sm">
              <TableBody>
                {Array.from({ length: 8 }).map((_, idx) => (
                  <TableRow key={idx} className="border-b border-border/40 last:border-b-0 h-14 sm:h-16">
                  {/* 1. Pool */}
                  <TableCell className="w-[260px] min-w-[240px] pl-4">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="flex flex-col items-center shrink-0 pt-0.5 gap-1">
                        <Skeleton className="w-11 h-[19px] rounded-md" />
                        <div className="flex gap-1">
                          <Skeleton className="size-2.5 rounded" />
                          <Skeleton className="size-2.5 rounded" />
                        </div>
                      </div>
                      <div className="flex flex-col space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Skeleton className="size-4 rounded-full shrink-0" />
                          <Skeleton className="h-4 w-20 rounded" />
                        </div>
                        <Skeleton className="h-3 w-16 rounded opacity-50" />
                      </div>
                    </div>
                  </TableCell>
                  {/* 2. Price */}
                  <TableCell className="w-[125px] min-w-[110px] text-right hidden sm:table-cell">
                    <div className="flex flex-col items-end space-y-1">
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-3 w-12 rounded opacity-50" />
                    </div>
                  </TableCell>
                  {/* 3. Age */}
                  <TableCell className="w-[95px] min-w-[85px] text-right hidden lg:table-cell">
                    <div className="flex flex-col items-end space-y-1">
                      <Skeleton className="h-4 w-10 rounded" />
                      <Skeleton className="h-3 w-12 rounded opacity-50" />
                    </div>
                  </TableCell>
                  {/* 4. MC */}
                  <TableCell className="w-[105px] min-w-[95px] text-right hidden md:table-cell">
                    <div className="flex flex-col items-end space-y-1">
                      <Skeleton className="h-4 w-14 rounded" />
                      <Skeleton className="h-3 w-10 rounded opacity-50" />
                    </div>
                  </TableCell>
                  {/* 5. TVL */}
                  <TableCell className="w-[115px] min-w-[100px] text-right">
                    <div className="flex flex-col items-end space-y-1">
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-3 w-12 rounded opacity-50" />
                    </div>
                  </TableCell>
                  {/* 6. Volume */}
                  <TableCell className="w-[115px] min-w-[100px] text-right hidden md:table-cell">
                    <div className="flex flex-col items-end space-y-1">
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-3 w-12 rounded opacity-50" />
                    </div>
                  </TableCell>
                  {/* 7. Fees */}
                  <TableCell className="w-[125px] min-w-[110px] text-right">
                    <div className="flex flex-col items-end space-y-1">
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-3 w-20 rounded opacity-50" />
                    </div>
                  </TableCell>
                  {/* 8. Action */}
                  <TableCell className="w-[95px] min-w-[85px] text-right pr-4">
                    <Skeleton className="h-8 w-16 ml-auto rounded-md" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      </div>
      <div className="shrink-0 py-2.5 px-4 border-t border-border/40 bg-muted/10 flex items-center justify-between gap-4">
          <Skeleton className="h-4 w-44 rounded" />
          <div className="flex items-center gap-1">
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default PoolsSkeleton;
