import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';

export const SkeletonMetricRow = () => (
  <div className="flex items-center justify-between py-1 border-b border-border/15 last:border-b-0">
    <Skeleton className="h-3 w-16 rounded" />
    <Skeleton className="h-3 w-12 rounded" />
  </div>
);

export const SkeletonCompactHeader = () => (
  <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2 border-b border-border/30 bg-muted/15 backdrop-blur-md shrink-0">
    {/* Left: Token Pair Identity */}
    <div className="flex items-center gap-2.5 min-w-0">
      {/* Back button skeleton */}
      <Skeleton className="size-7 rounded-lg shrink-0" />

      {/* Pair avatar circles */}
      <div className="relative shrink-0">
        <Skeleton className="size-7 rounded-full" />
        <Skeleton className="size-5 rounded-full absolute -bottom-0.5 -right-1.5 ring-2 ring-background" />
      </div>

      <div className="flex items-center gap-2 min-w-0">
        {/* Pair name */}
        <Skeleton className="h-4 w-20 rounded" />

        {/* Contract address pill */}
        <div className="hidden sm:inline-flex items-center h-5 px-2 gap-1.5 rounded-4xl border border-border/40 bg-muted/25">
          <Skeleton className="h-2.5 w-16 rounded" />
          <div className="flex items-center gap-1 border-l border-border/40 pl-1.5 ml-0.5">
            <Skeleton className="size-3 rounded" />
            <Skeleton className="size-3 rounded" />
            <Skeleton className="size-3 rounded" />
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1">
          <Skeleton className="h-5 w-12 rounded-4xl" />
          <Skeleton className="h-5 w-14 rounded-4xl" />
          <Skeleton className="h-5 w-12 rounded-4xl" />
        </div>
      </div>
    </div>

    {/* Right: Essential Pool Performance Strip */}
    <div className="flex items-center gap-2.5 sm:gap-3.5">
      {[
        { label: 'w-7', val: 'w-16' }, // Price
        { label: 'w-7', val: 'w-12' }, // MCap
        { label: 'w-10', val: 'w-12' }, // 24H Vol
        { label: 'w-10', val: 'w-10' }, // 24H Fees
        { label: 'w-10', val: 'w-10' }, // Est. APR
        { label: 'w-12', val: 'w-8' },  // 24H Change
      ].map((m, i) => (
        <div key={i} className="flex items-center gap-2.5 sm:gap-3.5">
          {i > 0 && <Separator orientation="vertical" className="h-3.5 bg-border/40" />}
          <div className="flex items-center gap-1.5">
            <Skeleton className={`h-2.5 ${m.label} rounded`} />
            <Skeleton className={`h-3 ${m.val} rounded`} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const SkeletonIntelDeck = () => (
  <div className="h-full flex flex-col overflow-hidden">
    {/* Segmented Domain Tabs */}
    <div className="p-2 border-b border-border/30 bg-muted/10 shrink-0 flex items-center justify-between gap-1.5">
      <div className="grid grid-cols-3 gap-1 bg-muted/40 p-0.5 rounded-lg border border-border/40 flex-1">
        <Skeleton className="h-6 rounded-md" />
        <Skeleton className="h-6 rounded-md opacity-40" />
        <Skeleton className="h-6 rounded-md opacity-40" />
      </div>
    </div>

    {/* Scrollable Tab Content */}
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
      {/* Spot Price Card */}
      <div className="rounded-xl bg-muted/20 border border-border/30 p-2.5 space-y-1.5">
        <Skeleton className="h-2.5 w-24 rounded" />
        <div className="flex items-baseline gap-1.5">
          <Skeleton className="h-6 w-32 rounded" />
          <Skeleton className="h-3 w-10 rounded" />
        </div>
        <Skeleton className="h-2.5 w-28 rounded opacity-75" />
      </div>

      {/* Pool & Contract Spec Card */}
      <div className="rounded-xl border border-border/40 bg-card/60 p-2.5 space-y-2 shadow-2xs">
        <Skeleton className="h-2.5 w-36 rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between pt-1 border-t border-border/25">
            <Skeleton className="h-3 w-14 rounded" />
            <Skeleton className="h-3 w-20 rounded" />
          </div>
        ))}
      </div>

      {/* TVL Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>

        {/* Token reserve cards */}
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between rounded-lg bg-muted/15 border border-border/25 p-2">
            <div className="flex items-center gap-1.5">
              <Skeleton className="size-6 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-3 w-10 rounded" />
                <Skeleton className="h-2.5 w-14 rounded" />
              </div>
            </div>
            <div className="space-y-1 items-end flex flex-col">
              <Skeleton className="h-3 w-14 rounded" />
              <Skeleton className="h-2.5 w-16 rounded" />
            </div>
          </div>
        ))}

        {/* TVL bar */}
        <div className="space-y-1">
          <div className="flex justify-between">
            <Skeleton className="h-2.5 w-20 rounded" />
            <Skeleton className="h-2.5 w-14 rounded" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      </div>

      {/* Volume & Yield rows */}
      <div className="pt-2 border-t border-border/25 space-y-0.5">
        <Skeleton className="h-2.5 w-20 rounded mb-1" />
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonMetricRow key={i} />
        ))}
      </div>
    </div>
  </div>
);

export const SkeletonCenterPanel = () => (
  <div className="h-full w-full flex flex-col min-h-0 bg-card/10">
    {/* 1. Price Action Candlestick Chart Area (~65%) */}
    <div className="flex flex-col min-h-0 overflow-hidden p-2 pb-1" style={{ flex: '65 1 0%' }}>
      <div className="flex-1 min-h-0 w-full rounded-xl border border-border/40 bg-card/30 flex flex-col overflow-hidden">
        {/* Interval toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 bg-muted/10 shrink-0">
          <div className="flex items-center gap-1">
            {['1s', '15s', '1m', '5m', '15m', '1h', '4h', '1d'].map((i) => (
              <Skeleton key={i} className="h-5 w-7 rounded-md" />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-5 w-16 rounded-md" />
            <Skeleton className="size-5 rounded-md" />
          </div>
        </div>
        {/* Chart body */}
        <div className="flex-1 min-h-0 w-full relative flex flex-col items-center justify-center p-4">
          <Loader2 className="size-6 animate-spin text-muted-foreground/40 mb-2" />
          <Skeleton className="h-3 w-28 rounded" />
        </div>
      </div>
    </div>

    {/* Resizable handle divider placeholder */}
    <div className="flex items-center justify-center h-2 shrink-0 border-y border-border/30 bg-muted/10">
      <div className="w-8 h-1 rounded-full bg-border/60" />
    </div>

    {/* 2. Positions Section (~35%) */}
    <div className="flex flex-col min-h-0 overflow-hidden bg-card/40 backdrop-blur-xl" style={{ flex: '35 1 0%' }}>
      {/* Header Bar */}
      <div className="flex items-center justify-between px-2.5 py-1.5 gap-2 border-b border-border/40 shrink-0 select-none">
        <Skeleton className="h-4 w-18 rounded" />
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-6 w-20 rounded-md" />
          <div className="flex items-center gap-0.5 bg-muted/40 p-0.5 rounded-lg border border-border/40">
            <Skeleton className="h-5 w-16 rounded-md" />
            <Skeleton className="h-5 w-16 rounded-md opacity-40" />
          </div>
        </div>
      </div>
      {/* Empty positions placeholder */}
      <div className="flex-1 min-h-0 p-3 flex flex-col items-center justify-center gap-2">
        <Skeleton className="h-3 w-44 rounded" />
        <Skeleton className="h-2.5 w-60 rounded opacity-60" />
      </div>
    </div>
  </div>
);

export const SkeletonDeployTerminal = () => (
  <div className="h-full flex-1 min-h-0 flex flex-col overflow-y-auto p-3 space-y-2.5">
    {/* Range Picker Visual Band */}
    <div className="rounded-xl border border-border/30 bg-muted/15 p-2">
      <Skeleton className="h-[130px] w-full rounded-lg" />
    </div>

    {/* Range Presets Strip */}
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20 rounded" />
        <Skeleton className="h-3 w-16 rounded" />
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <Skeleton className="size-5 rounded shrink-0" />
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-6 w-12 rounded-md shrink-0" />
          ))}
        </div>
        <Skeleton className="size-5 rounded shrink-0" />
        <Skeleton className="h-7 w-20 rounded-md shrink-0" />
      </div>
    </div>

    {/* Price Boundaries */}
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24 rounded" />
        <Skeleton className="h-[26px] w-[84px] rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border/30 bg-muted/15 p-2.5 space-y-1.5">
            <Skeleton className="h-2.5 w-16 rounded" />
            <Skeleton className="h-7 w-full rounded-lg" />
            <Skeleton className="h-2.5 w-20 rounded" />
          </div>
        ))}
      </div>
    </div>

    <Separator className="border-border/25" />

    {/* Deposit Amounts */}
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24 rounded" />
        <div className="flex items-center rounded-lg border border-border/40 bg-muted/40 p-0.5">
          <Skeleton className="h-5 w-14 rounded-md" />
          <Skeleton className="h-5 w-14 rounded-md opacity-40" />
        </div>
      </div>
      {/* Amount rows */}
      {[1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-border/30 bg-muted/15 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-3.5 w-12 rounded" />
            </div>
            <Skeleton className="h-6 w-24 rounded-md" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-2.5 w-28 rounded" />
            <Skeleton className="h-2.5 w-16 rounded" />
          </div>
        </div>
      ))}
    </div>

    {/* Action Button */}
    <Skeleton className="h-9 w-full rounded-xl mt-1" />
  </div>
);

export function TerminalSkeleton() {
  return (
    <div className="flex-1 min-h-0 h-full w-full">
      {/* Desktop Skeleton: Exact 3-pane ratio matching the workstation */}
      <div className="hidden xl:flex flex-col flex-1 min-h-0 h-full w-full rounded-2xl border border-border/40 bg-card/20 overflow-hidden shadow-2xs">
        <SkeletonCompactHeader />
        <div className="flex flex-1 min-h-0 w-full">
          {/* Panel 1 (Left): Intel Deck (22% / min-w-60) */}
          <div className="min-w-60 h-full min-h-0 overflow-hidden border-r border-border/30" style={{ flex: '22 1 0%' }}>
            <SkeletonIntelDeck />
          </div>
          {/* Panel 2 (Center): Price Action & Positions (54% / min-w-105) */}
          <div className="min-w-105 h-full min-h-0 overflow-hidden border-r border-border/30" style={{ flex: '54 1 0%' }}>
            <SkeletonCenterPanel />
          </div>
          {/* Panel 3 (Right): Deploy Terminal (24% / min-w-70) */}
          <div className="min-w-70 h-full min-h-0 overflow-hidden" style={{ flex: '24 1 0%' }}>
            <SkeletonDeployTerminal />
          </div>
        </div>
      </div>

      {/* Mobile / Tablet Skeleton */}
      <div className="xl:hidden flex-1 min-h-0 overflow-y-auto app-scrollbar space-y-3 pb-8 w-full">
        <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/20 h-180 flex flex-col">
          <SkeletonCompactHeader />
          <div className="flex-1 min-h-0 w-full">
            <SkeletonCenterPanel />
          </div>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/20 p-3">
          <SkeletonDeployTerminal />
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/20">
          <SkeletonIntelDeck />
        </div>
      </div>
    </div>
  );
}
