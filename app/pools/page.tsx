'use client';

import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { cachePoolForWorkstation, poolWorkstationHref, prewarmPoolHistory } from '@/lib/pool-cache';
import { useInteractionLock } from '@/lib/motion';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns3,
  Funnel,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePersistentTab } from '@/lib/use-persistent-tab';
import { usePoolDirectory } from '@/lib/use-pool-directory';
import { cn } from '@/lib/utils';
import {
  type Timeframe,
  generatePagination,
  toDiscoveredPool,
} from '@/lib/pool-model';
import {
  ActionCell,
  AgeCell,
  FeesCell,
  LiquidityCell,
  MarketCapCell,
  MetricTooltip,
  PoolIdentityCell,
  PriceCell,
  VolumeCell,
} from '@/components/app/pool-cells';
import type { CanonicalPool, PoolSort } from '@/lib/types';
import { useNetwork } from '@/lib/network';
type TabKey = 'all' | 'top_performers' | 'trending' | 'new';
type SortField = PoolSort;
type SortDirection = 'asc' | 'desc';

type ColKey =
  | 'price'
  | 'age'
  | 'mcap'
  | 'tvl'
  | 'volume'
  | 'fee';

const DEFAULT_COLS: ColKey[] = ['price', 'age', 'mcap', 'tvl', 'volume', 'fee'];
const ALL_COLS: ColKey[] = ['price', 'age', 'mcap', 'tvl', 'volume', 'fee'];

const COL_LABELS: Record<ColKey, string> = {
  price: 'Price',
  age: 'Age',
  mcap: 'MC',
  tvl: 'TVL',
  volume: 'Volume',
  fee: 'Fees',
};

const SortIndicator = ({
  active,
  direction,
}: {
  active: boolean;
  direction: 'asc' | 'desc' | null;
}) => (
  <span className="inline-flex flex-col items-center justify-center -space-y-1 shrink-0 select-none mr-1.5">
    <ChevronUp
      className={cn(
        'size-2.5 transition-all duration-150',
        active && direction === 'asc'
          ? 'text-foreground scale-110'
          : 'text-muted-foreground/30 group-hover/th:text-muted-foreground/60',
      )}
    />
    <ChevronDown
      className={cn(
        'size-2.5 transition-all duration-150',
        active && direction === 'desc'
          ? 'text-foreground scale-110'
          : 'text-muted-foreground/30 group-hover/th:text-muted-foreground/60',
      )}
    />
  </span>
);

interface PoolTableRowProps {
  pool: CanonicalPool;
  index: number;
  timeframe: Timeframe;
  visibleCols: Set<ColKey>;
  isCopied: boolean;
  onCopyPool: (id: string) => void;
  isNewEntry?: boolean;
  tabKey?: string;
}

const arePoolRowsEqual = (prev: PoolTableRowProps, next: PoolTableRowProps): boolean => {
  if (prev.index !== next.index) return false;
  if (prev.timeframe !== next.timeframe) return false;
  if (prev.isCopied !== next.isCopied) return false;
  if (prev.isNewEntry !== next.isNewEntry) return false;
  if (prev.tabKey !== next.tabKey) return false;
  if (prev.visibleCols.size !== next.visibleCols.size) return false;
  for (const k of prev.visibleCols) { if (!next.visibleCols.has(k)) return false; }
  const a = prev.pool;
  const b = next.pool;
  if (a === b) return true;
  return (
    a.canonicalId === b.canonicalId &&
    a.priceNow === b.priceNow &&
    a.priceUsd === b.priceUsd &&
    a.discoverLiquidityUsd === b.discoverLiquidityUsd &&
    a.tvlUsd === b.tvlUsd &&
    a.volume24hUsd === b.volume24hUsd &&
    a.volume5mUsd === b.volume5mUsd &&
    a.volume1hUsd === b.volume1hUsd &&
    a.volume6hUsd === b.volume6hUsd &&
    a.marketCap === b.marketCap &&
    a.fdv === b.fdv &&
    a.topScore === b.topScore &&
    a.trendingScore5m === b.trendingScore5m &&
    a.poolCreatedAt === b.poolCreatedAt &&
    a.tokenCreatedAt === b.tokenCreatedAt &&
    a.hooks === b.hooks &&
    a.effectiveFee === b.effectiveFee &&
    a.fees24hUsd === b.fees24hUsd &&
    a.feeAprPct === b.feeAprPct &&
    a.lastSwapAt === b.lastSwapAt &&
    a.lastSwapDirection === b.lastSwapDirection
  );
};

// DESIGN ENFORCEMENT: Do NOT add #rank / RankIndicator back to top, trending, or new tabs.
// All tabs (all, top_performers, trending, new) must use the identical clean pool identity layout without rank badges.
const PoolTableRow = memo(function PoolTableRow({
  pool: p,
  index,
  timeframe,
  visibleCols,
  isCopied,
  onCopyPool,
  isNewEntry,
  tabKey,
}: PoolTableRowProps) {
  const router = useRouter();
  const [prevIndex, setPrevIndex] = useState(index);
  const [prevTabKey, setPrevTabKey] = useState(tabKey);
  const [isSwapping, setIsSwapping] = useState(Boolean(isNewEntry));

  if (tabKey !== prevTabKey) {
    setPrevTabKey(tabKey);
    setPrevIndex(index);
  } else if (index !== prevIndex) {
    setPrevIndex(index);
    setIsSwapping(true);
  }

  useEffect(() => {
    if (!isSwapping) return;
    const timer = setTimeout(() => {
      setIsSwapping(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [isSwapping]);

  if (isSwapping) {
    return (
      <TableRow className="border-b border-border/40 last:border-b-0 h-14 sm:h-16 animate-pulse bg-muted/20">
        {/* 1. Pool Column */}
        <TableCell className="w-[275px] min-w-[250px] pl-4 py-3">
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
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-3 w-16 opacity-50" />
            </div>
          </div>
        </TableCell>

        {/* 2. Price */}
        {visibleCols.has('price') && (
          <TableCell className="w-[125px] min-w-[110px] text-right hidden sm:table-cell pr-3">
            <div className="flex flex-col items-end space-y-1">
              <Skeleton className="h-4 w-16 ml-auto" />
              <Skeleton className="h-3 w-12 opacity-50 ml-auto" />
            </div>
          </TableCell>
        )}

        {/* 3. Age */}
        {visibleCols.has('age') && (
          <TableCell className="w-[95px] min-w-[85px] text-right hidden lg:table-cell">
            <div className="flex flex-col items-end space-y-1">
              <Skeleton className="h-4 w-10 ml-auto" />
              <Skeleton className="h-3 w-12 opacity-50 ml-auto" />
            </div>
          </TableCell>
        )}

        {/* 4. MC (Market Cap) */}
        {visibleCols.has('mcap') && (
          <TableCell className="w-[105px] min-w-[95px] text-right hidden md:table-cell pr-3">
            <div className="flex flex-col items-end space-y-1">
              <Skeleton className="h-4 w-14 ml-auto" />
              <Skeleton className="h-3 w-10 opacity-50 ml-auto" />
            </div>
          </TableCell>
        )}

        {/* 5. TVL */}
        {visibleCols.has('tvl') && (
          <TableCell className="w-[115px] min-w-[100px] text-right pr-3">
            <div className="flex flex-col items-end space-y-1">
              <Skeleton className="h-4 w-16 ml-auto" />
              <Skeleton className="h-3 w-12 opacity-50 ml-auto" />
            </div>
          </TableCell>
        )}

        {/* 6. Volume */}
        {visibleCols.has('volume') && (
          <TableCell className="w-[115px] min-w-[100px] text-right hidden md:table-cell pr-3">
            <div className="flex flex-col items-end space-y-1">
              <Skeleton className="h-4 w-16 ml-auto" />
              <Skeleton className="h-3 w-12 opacity-50 ml-auto" />
            </div>
          </TableCell>
        )}

        {/* 7. Fees */}
        {visibleCols.has('fee') && (
          <TableCell className="w-[125px] min-w-[110px] text-right pr-3">
            <div className="flex flex-col items-end space-y-1">
              <Skeleton className="h-4 w-16 ml-auto" />
              <Skeleton className="h-3 w-20 opacity-50 ml-auto" />
            </div>
          </TableCell>
        )}

        {/* 8. Action */}
        <TableCell className="w-[95px] min-w-[85px] text-right pr-4">
          <Skeleton className="h-8 w-16 ml-auto rounded-md" />
        </TableCell>
      </TableRow>
    );
  }

  const discovered = toDiscoveredPool(p, timeframe);

  const raw = discovered.raw;
  const href = poolWorkstationHref(raw);

  const handleRowClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('button') || target?.closest('a') || target?.closest('input')) {
      return;
    }
    cachePoolForWorkstation(raw);
    prewarmPoolHistory(raw, '5m');
    try {
      startTransition(() => {
        router.push(href);
      });
    } catch {
      window.location.assign(href);
    }
  };

  return (
    <TableRow
      onClick={handleRowClick}
      onMouseEnter={() => {
        cachePoolForWorkstation(raw);
        prewarmPoolHistory(raw, '5m');
      }}
      className="border-b border-border/40 last:border-b-0 hover:bg-muted/30 transition-colors h-14 sm:h-16 cursor-pointer"
    >
      {/* 1. Pool Column */}
      <TableCell className="w-[275px] min-w-[250px] pl-4 py-3 font-medium overflow-hidden">
        <div className="flex items-start gap-1.5 min-w-0">
          <div className="min-w-0 flex-1">
            <PoolIdentityCell
              pool={discovered}
              onCopyPoolId={onCopyPool}
              isCopied={isCopied}
            />
          </div>
        </div>
      </TableCell>

      {/* 2. Price */}
      {visibleCols.has('price') && (
        <TableCell className="w-[125px] min-w-[110px] tabular text-right font-mono text-xs hidden sm:table-cell overflow-visible pr-3">
          <PriceCell pool={discovered} />
        </TableCell>
      )}

      {/* 3. Age */}
      {visibleCols.has('age') && (
        <TableCell className="w-[95px] min-w-[85px] tabular text-right font-mono text-xs hidden lg:table-cell overflow-hidden">
          <AgeCell pool={discovered} />
        </TableCell>
      )}

      {/* 4. MC (Market Cap) */}
      {visibleCols.has('mcap') && (
        <TableCell className="w-[105px] min-w-[95px] tabular text-right font-mono text-xs hidden md:table-cell overflow-visible pr-3">
          <MarketCapCell pool={discovered} />
        </TableCell>
      )}

      {/* 5. TVL */}
      {visibleCols.has('tvl') && (
        <TableCell className="w-[115px] min-w-[100px] tabular text-right font-mono text-xs font-semibold text-foreground overflow-visible pr-3">
          <LiquidityCell pool={discovered} />
        </TableCell>
      )}

      {/* 6. Volume */}
      {visibleCols.has('volume') && (
        <TableCell className="w-[115px] min-w-[100px] tabular text-right font-mono text-xs hidden md:table-cell overflow-visible pr-3">
          <VolumeCell pool={discovered} />
        </TableCell>
      )}

      {/* 7. Fees */}
      {visibleCols.has('fee') && (
        <TableCell className="w-[125px] min-w-[110px] tabular text-right font-mono text-xs overflow-visible pr-3">
          <FeesCell pool={discovered} />
        </TableCell>
      )}

      {/* 8. Action Column (Deposit Only) */}
      <TableCell className="w-[95px] min-w-[85px] text-right pr-4 overflow-hidden">
        <ActionCell pool={discovered} />
      </TableCell>
    </TableRow>
  );
}, arePoolRowsEqual);

const PoolsContent = () => {
  const pathname = usePathname();
  // Only read URL search params when genuinely on a discover/pools route.
  // This prevents params from /open (e.g. ?token=) or other pages from
  // leaking into the discover pool directory when PoolsPage is rendered
  // inside the shell SPA tab switcher.
  const isDiscoverRoute = pathname === '/discover' || pathname === '/pools' || pathname === '/';

  const [currentPage, setCurrentPage] = useState(1);

  // Pool Directory Tabs: all, top performers, trending, new
  const [activeTab, setActiveTab] = usePersistentTab<TabKey>({
    key: 'invictus:subnav:discover:tab',
    defaultValue: 'all',
    validValues: ['all', 'top_performers', 'trending', 'new'] as const,
    urlParam: isDiscoverRoute ? 'tab' : undefined,
  });
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection | null>(null);

  // Global Analysis Window (Timeframe): 5m, 1h, 6h, 24h
  const [timeframe, setTimeframe] = usePersistentTab<Timeframe>({
    key: 'invictus:subnav:discover:timeframe',
    defaultValue: '24h',
    validValues: ['5m', '1h', '6h', '24h'] as const,
    urlParam: isDiscoverRoute ? 'tf' : undefined,
  });
  // Column visibility
  const [visibleColsKey, setVisibleColsKey] = useState(() => DEFAULT_COLS.join(','));
  const visibleCols = useMemo(() => new Set<ColKey>(visibleColsKey.split(',') as ColKey[]), [visibleColsKey]);
  // Metric Filters: empty by default so "All" tab displays all eligible pools
  const [filterMinTvl, setFilterMinTvl] = useState('');
  const [filterMinVol, setFilterMinVol] = useState('');
  const [filterMinApr, setFilterMinApr] = useState('');
  const [debouncedMinTvl, setDebouncedMinTvl] = useState('');
  const [debouncedMinVol, setDebouncedMinVol] = useState('');
  const [debouncedMinApr, setDebouncedMinApr] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMinTvl(filterMinTvl);
      setDebouncedMinVol(filterMinVol);
      setDebouncedMinApr(filterMinApr);
    }, 300);
    return () => clearTimeout(timer);
  }, [filterMinTvl, filterMinVol, filterMinApr]);

  const hasActiveFilters = filterMinTvl !== '' || filterMinVol !== '' || filterMinApr !== '';

  const toggleCol = (key: ColKey) => {
    setVisibleColsKey((prev) => {
      const cols = prev.split(',') as ColKey[];
      const idx = cols.indexOf(key);
      if (idx >= 0) cols.splice(idx, 1);
      else cols.push(key);
      return cols.join(',');
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else if (sortDirection === 'asc') {
        setSortField(null);
        setSortDirection(null);
      } else {
        setSortDirection('desc');
      }
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setSortField(null);
    setSortDirection(null);
  };

  // Clipboard feedbacks
  const [copiedPoolId, setCopiedPoolId] = useState<string | null>(null);
  const urlQuery = useMemo(() => {
    if (!isDiscoverRoute || typeof window === 'undefined') return undefined;
    const sp = new URLSearchParams(window.location.search);
    return sp.get('ca') || sp.get('address') || sp.get('query') || sp.get('q') || undefined;
  }, [isDiscoverRoute]);

  // The directory filters by chain itself; every network leaves the parameter off.
  const { selected: network } = useNetwork();
  const directoryQuery = useMemo(() => ({
    ...(network !== null ? { chain: String(network) } : {}),
    q: urlQuery,
    limit: activeTab === 'all' ? 25 : 100,
    page: activeTab === 'all' ? currentPage : undefined,
    tab: activeTab,
    timeframe,
    ...(sortField && sortDirection ? { sort: sortField, direction: sortDirection } : {}),
    minTvl: debouncedMinTvl || undefined,
    minVolume: debouncedMinVol || undefined,
    minApr: debouncedMinApr || undefined,
  }), [network, urlQuery, activeTab, currentPage, timeframe, sortField, sortDirection, debouncedMinTvl, debouncedMinVol, debouncedMinApr]);

  const { page: directoryPage, loading: loadingRecs, error: directoryLoadError } = usePoolDirectory(directoryQuery);
  const recommended = directoryPage?.pools ?? [];

  useEffect(() => {
    setCurrentPage(1);
  }, [urlQuery, activeTab, timeframe, sortField, sortDirection, debouncedMinTvl, debouncedMinVol, debouncedMinApr]);

  useEffect(() => {
    if (directoryLoadError === 'Snapshot expired') {
      setCurrentPage(1);
    }
  }, [directoryLoadError]);

  const pageSize = 25;
  const isLeaderboard = activeTab !== 'all';
  const rawTotal = directoryPage?.total;
  const totalPools = isLeaderboard
    ? Math.min(recommended.length, 100)
    : (rawTotal ?? null);

  const totalPages =
    totalPools !== null && totalPools !== undefined
      ? Math.max(1, Math.ceil(totalPools / pageSize))
      : null;

  const displayPools = useMemo(() => {
    if (!isLeaderboard) return recommended;
    const start = (currentPage - 1) * pageSize;
    return recommended.slice(start, start + pageSize);
  }, [isLeaderboard, recommended, currentPage, pageSize]);

  const { locked: isInteractionLocked, handlers: tableInteractionHandlers } = useInteractionLock();
  const [stablePools, setStablePools] = useState<CanonicalPool[]>(displayPools);

  useEffect(() => {
    setStablePools(displayPools);
  }, [activeTab, currentPage, sortField, sortDirection, timeframe, debouncedMinTvl, debouncedMinVol, debouncedMinApr]);

  useEffect(() => {
    if (!isInteractionLocked || stablePools.length === 0) {
      setStablePools(displayPools);
    }
  }, [displayPools, isInteractionLocked, stablePools.length]);

  const renderedPools = useMemo(() => {
    if (!isInteractionLocked || stablePools.length === 0) return displayPools;
    const poolMap = new Map(displayPools.map((p) => [p.canonicalId, p]));
    const list = stablePools.map((p) => poolMap.get(p.canonicalId) ?? p);
    return list.length > 0 ? list : displayPools;
  }, [isInteractionLocked, displayPools, stablePools]);

  const knownPoolsRef = useRef<Set<string>>(new Set());
  const initialMountDoneRef = useRef(false);

  useEffect(() => {
    knownPoolsRef.current.clear();
    initialMountDoneRef.current = false;
  }, [activeTab, currentPage, sortField, sortDirection]);

  useEffect(() => {
    if (renderedPools.length > 0 && !initialMountDoneRef.current) {
      renderedPools.forEach((p) => knownPoolsRef.current.add(p.canonicalId));
      initialMountDoneRef.current = true;
    }
  }, [renderedPools]);

  const startItem = totalPools === 0 || displayPools.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem =
    displayPools.length === 0
      ? 0
      : totalPools !== null && totalPools !== undefined
        ? Math.min((currentPage - 1) * pageSize + displayPools.length, totalPools)
        : (currentPage - 1) * pageSize + displayPools.length;

  const totalCountDisplay =
    totalPools !== null && totalPools !== undefined
      ? totalPools.toLocaleString()
      : directoryPage?.nextCursor
        ? `${endItem}+`
        : String(endItem);

  const paginationItems = useMemo(() => {
    if (!totalPages) return [currentPage];
    return generatePagination(currentPage, totalPages);
  }, [currentPage, totalPages]);

  const handlePageClick = (targetPage: number) => {
    if (targetPage === currentPage || loadingRecs) return;
    if (totalPages !== null && (targetPage < 1 || targetPage > totalPages)) return;
    setCurrentPage(targetPage);
  };

  const copyPool = useCallback((id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedPoolId(id);
    toast.success('Pool ID copied');
    setTimeout(() => setCopiedPoolId(null), 2000);
  }, []);

  return (
    <div className="flex flex-col gap-3.5 w-full flex-1 h-full min-h-0 overflow-hidden">
      <div className="space-y-3 flex-1 flex flex-col h-full min-h-0 overflow-hidden">
          {urlQuery && (
            <div className="shrink-0 flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">Directory results for <strong className="font-mono text-foreground">{urlQuery}</strong></span>
              <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs"><Link href="/discover">Clear</Link></Button>
            </div>
          )}

          {/* Curated Discovery Lenses & Toolbar */}
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-1">
            <Tabs
              value={activeTab}
              onValueChange={(v) => handleTabChange(v as TabKey)}
              className="w-auto"
            >
              <TabsList variant="line" className="h-8 gap-0.5">
                {/* Tab 1: All */}
                <TabsTrigger value="all" className="text-xs sm:text-[13px] font-medium px-2.5 sm:px-3 py-1 data-[state=active]:font-semibold">
                  <span>All</span>
                </TabsTrigger>

                {/* Tab 2: Top */}
                <TabsTrigger value="top_performers" className="text-xs sm:text-[13px] font-medium px-2.5 sm:px-3 py-1 data-[state=active]:font-semibold">
                  <span>Top</span>
                </TabsTrigger>

                {/* Tab 3: Trending */}
                <TabsTrigger value="trending" className="text-xs sm:text-[13px] font-medium px-2.5 sm:px-3 py-1 data-[state=active]:font-semibold">
                  <span>Trending</span>
                </TabsTrigger>

                {/* Tab 4: New */}
                <TabsTrigger value="new" className="text-xs sm:text-[13px] font-medium px-2.5 sm:px-3 py-1 data-[state=active]:font-semibold">
                  <span>New</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Toolbar: Global Timeframe | Columns | Filter */}
            <div className="flex items-center gap-1.5">
              {/* Global Timeframe Dropdown (5m, 1h, 6h, 24h, 7d) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground font-mono font-medium"
                    title="Select timeframe"
                  >
                    <span>{timeframe}</span>
                    <ChevronDown className="size-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-24">
                  {(['5m', '1h', '6h', '24h'] as const).map((tf) => (
                    <DropdownMenuCheckboxItem
                      key={tf}
                      checked={timeframe === tf}
                      onCheckedChange={() => setTimeframe(tf)}
                      className="text-xs font-mono"
                    >
                      {tf}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Column Visibility Toggle */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    title="Customize columns"
                  >
                    <Columns3 className="size-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-52 p-2 space-y-0.5">
                  <p className="text-[11px] font-semibold text-muted-foreground px-1 pb-1.5 border-b border-border/40 mb-1">
                    Toggle Columns
                  </p>
                  {ALL_COLS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleCol(key)}
                      className={cn(
                        'w-full flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors text-left',
                        visibleCols.has(key)
                          ? 'text-foreground hover:bg-muted/50'
                          : 'text-muted-foreground/50 hover:bg-muted/30',
                      )}
                    >
                      <span
                        className={cn(
                          'size-3 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors',
                          visibleCols.has(key)
                            ? 'bg-primary border-primary'
                            : 'border-border',
                        )}
                      >
                        {visibleCols.has(key) && <Check className="size-2 text-primary-foreground" />}
                      </span>
                      {COL_LABELS[key]}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* Filter Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-7 gap-1.5 px-2.5 text-xs transition-colors',
                      hasActiveFilters
                        ? 'text-primary hover:text-primary'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    title="Filter pools"
                  >
                    <Funnel className="size-3.5" />
                    {hasActiveFilters && <span className="size-1.5 rounded-full bg-primary" />}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-3 space-y-3">
                  <p className="text-[11px] font-semibold text-muted-foreground border-b border-border/40 pb-1.5">
                    Filter Pools
                  </p>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground font-medium">Min TVL (USD)</label>
                      <Input
                        type="number"
                        value={filterMinTvl}
                        onChange={(e) => setFilterMinTvl(e.target.value)}
                        placeholder="e.g. 50000"
                        className="h-7 text-xs bg-muted/30 border-border/60"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground font-medium">Min Volume (USD)</label>
                      <Input
                        type="number"
                        value={filterMinVol}
                        onChange={(e) => setFilterMinVol(e.target.value)}
                        placeholder="e.g. 10000"
                        className="h-7 text-xs bg-muted/30 border-border/60"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground font-medium">Min Fee APR (%)</label>
                      <Input
                        type="number"
                        value={filterMinApr}
                        onChange={(e) => setFilterMinApr(e.target.value)}
                        placeholder="e.g. 50"
                        className="h-7 text-xs bg-muted/30 border-border/60"
                      />
                    </div>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={() => { setFilterMinTvl(''); setFilterMinVol(''); setFilterMinApr(''); }}
                        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

          </div>

          {/* Table Container with Fixed Column Widths: Pool, Pool Price, Pool Age, MC, TVL, Volume, Fees, Action */}
          <div
            {...tableInteractionHandlers}
            className="rounded-xl border border-border/70 bg-card/60 shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col"
          >
            <div className="overflow-x-auto flex-1 min-h-0 flex flex-col app-scrollbar">
              {/* Fixed Table Header: scrollbar does not reach here */}
              <div
                style={{ scrollbarGutter: 'stable' }}
                className="border-b border-border/50 bg-muted/20 shrink-0 select-none min-w-[960px]"
              >
                <table className="table-fixed w-full caption-bottom text-sm">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-0">
                    {/* 1. Pool (Fixed Width) */}
                    <TableHead className="w-[275px] min-w-[250px] h-11 py-3 text-xs font-semibold pl-4">
                      <span>Pool</span>
                    </TableHead>

                    {/* 2. Price */}
                    {visibleCols.has('price') && (
                      <TableHead className="w-[125px] min-w-[110px] h-11 py-3 text-right text-xs font-semibold hidden sm:table-cell">
                        <MetricTooltip asChild content={`Spot price and ${timeframe} change`}>
                          <button
                            type="button"
                            onClick={() => handleSort('price')}
                            className="inline-flex items-center justify-end w-full group/th cursor-pointer hover:text-foreground transition-colors select-none"
                          >
                            <SortIndicator active={sortField === 'price'} direction={sortDirection} />
                            <span>Price</span>
                          </button>
                        </MetricTooltip>
                      </TableHead>
                    )}

                    {/* 3. Age */}
                    {visibleCols.has('age') && (
                      <TableHead className="w-[95px] min-w-[85px] h-11 py-3 text-right text-xs font-semibold hidden lg:table-cell">
                        <MetricTooltip asChild content="Pool age and token age">
                          <button
                            type="button"
                            onClick={() => handleSort('age')}
                            className="inline-flex items-center justify-end w-full group/th cursor-pointer hover:text-foreground transition-colors select-none"
                          >
                            <SortIndicator active={sortField === 'age'} direction={sortDirection} />
                            <span>Age</span>
                          </button>
                        </MetricTooltip>
                      </TableHead>
                    )}

                    {/* 4. MC (Market Cap) */}
                    {visibleCols.has('mcap') && (
                      <TableHead className="w-[105px] min-w-[95px] h-11 py-3 text-right text-xs font-semibold hidden md:table-cell">
                        <MetricTooltip asChild content={`Market cap and ${timeframe} change`}>
                          <button
                            type="button"
                            onClick={() => handleSort('mcap')}
                            className="inline-flex items-center justify-end w-full group/th cursor-pointer hover:text-foreground transition-colors select-none"
                          >
                            <SortIndicator active={sortField === 'mcap'} direction={sortDirection} />
                            <span>MC</span>
                          </button>
                        </MetricTooltip>
                      </TableHead>
                    )}

                    {/* 5. TVL */}
                    {visibleCols.has('tvl') && (
                      <TableHead className="w-[115px] min-w-[100px] h-11 py-3 text-right text-xs font-semibold">
                        <MetricTooltip asChild content={`Total value locked and ${timeframe} change`}>
                          <button
                            type="button"
                            onClick={() => handleSort('tvl')}
                            className="inline-flex items-center justify-end w-full group/th cursor-pointer hover:text-foreground transition-colors select-none"
                          >
                            <SortIndicator active={sortField === 'tvl'} direction={sortDirection} />
                            <span>TVL</span>
                          </button>
                        </MetricTooltip>
                      </TableHead>
                    )}

                    {/* 6. Volume */}
                    {visibleCols.has('volume') && (
                      <TableHead className="w-[115px] min-w-[100px] h-11 py-3 text-right text-xs font-semibold hidden md:table-cell">
                        <MetricTooltip asChild content={`Trading volume and ${timeframe} change`}>
                          <button
                            type="button"
                            onClick={() => handleSort('volume')}
                            className="inline-flex items-center justify-end w-full group/th cursor-pointer hover:text-foreground transition-colors select-none"
                          >
                            <SortIndicator
                              active={
                                sortField === 'volume' ||
                                sortField === 'volume5m' ||
                                sortField === 'volume1h' ||
                                sortField === 'volume6h'
                              }
                              direction={sortDirection}
                            />
                            <span>Volume</span>
                          </button>
                        </MetricTooltip>
                      </TableHead>
                    )}

                    {/* 7. Fees */}
                    {visibleCols.has('fee') && (
                      <TableHead className="w-[125px] min-w-[110px] h-11 py-3 text-right text-xs font-semibold">
                        <MetricTooltip asChild content="Fee revenue and estimated APR">
                          <button
                            type="button"
                            onClick={() => handleSort('apr')}
                            className="inline-flex items-center justify-end w-full group/th cursor-pointer hover:text-foreground transition-colors select-none"
                          >
                            <SortIndicator
                              active={sortField === 'apr' || sortField === 'fee'}
                              direction={sortDirection}
                            />
                            <span>Fees</span>
                          </button>
                        </MetricTooltip>
                      </TableHead>
                    )}

                    {/* 8. Action */}
                    <TableHead className="w-[95px] min-w-[85px] h-11 py-3 text-right text-xs font-semibold pr-4">Action</TableHead>
                  </TableRow>
                </TableHeader>
              </table>
            </div>

            {/* Scrollable Data Body: scrollbar starts below the header */}
            <div
              style={{ scrollbarGutter: 'stable' }}
              className="overflow-y-auto flex-1 min-h-0 app-scrollbar min-w-[960px] relative"
            >
              {/* Revalidation indicator: subtle top-edge progress when loading with existing data */}
              {loadingRecs && recommended.length > 0 && (
                <div className="absolute top-0 left-0 right-0 h-[2px] z-10 overflow-hidden">
                  <div className="h-full bg-primary/40 animate-pulse" />
                </div>
              )}
              <table className="table-fixed w-full caption-bottom text-sm">
                <TableBody>
                  {(loadingRecs || directoryPage === null) && recommended.length === 0 ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i} className="border-border/40 h-14 sm:h-16">
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
                                <Skeleton className="h-4 w-20" />
                              </div>
                              <Skeleton className="h-3 w-16 opacity-50" />
                            </div>
                          </div>
                        </TableCell>
                        {/* 2. Price */}
                        {visibleCols.has('price') && (
                          <TableCell className="w-[125px] min-w-[110px] text-right hidden sm:table-cell">
                            <div className="flex flex-col items-end space-y-1">
                              <Skeleton className="h-4 w-16" />
                              <Skeleton className="h-3 w-12 opacity-50" />
                            </div>
                          </TableCell>
                        )}
                        {/* 3. Age */}
                        {visibleCols.has('age') && (
                          <TableCell className="w-[95px] min-w-[85px] text-right hidden lg:table-cell">
                            <div className="flex flex-col items-end space-y-1">
                              <Skeleton className="h-4 w-10" />
                              <Skeleton className="h-3 w-12 opacity-50" />
                            </div>
                          </TableCell>
                        )}
                        {/* 4. MC */}
                        {visibleCols.has('mcap') && (
                          <TableCell className="w-[105px] min-w-[95px] text-right hidden md:table-cell">
                            <div className="flex flex-col items-end space-y-1">
                              <Skeleton className="h-4 w-14" />
                              <Skeleton className="h-3 w-10 opacity-50" />
                            </div>
                          </TableCell>
                        )}
                        {/* 5. TVL */}
                        {visibleCols.has('tvl') && (
                          <TableCell className="w-[115px] min-w-[100px] text-right">
                            <div className="flex flex-col items-end space-y-1">
                              <Skeleton className="h-4 w-16" />
                              <Skeleton className="h-3 w-12 opacity-50" />
                            </div>
                          </TableCell>
                        )}
                        {/* 6. Volume */}
                        {visibleCols.has('volume') && (
                          <TableCell className="w-[115px] min-w-[100px] text-right hidden md:table-cell">
                            <div className="flex flex-col items-end space-y-1">
                              <Skeleton className="h-4 w-16" />
                              <Skeleton className="h-3 w-12 opacity-50" />
                            </div>
                          </TableCell>
                        )}
                        {/* 7. Fees */}
                        {visibleCols.has('fee') && (
                          <TableCell className="w-[125px] min-w-[110px] text-right">
                            <div className="flex flex-col items-end space-y-1">
                              <Skeleton className="h-4 w-16" />
                              <Skeleton className="h-3 w-20 opacity-50" />
                            </div>
                          </TableCell>
                        )}
                        {/* 8. Action */}
                        <TableCell className="w-[95px] min-w-[85px] text-right pr-4">
                          <Skeleton className="h-8 w-16 ml-auto rounded-md" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : renderedPools.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={2 + visibleCols.size} className="py-16 text-center select-none">
                        <p className="text-sm text-muted-foreground">
                          {directoryLoadError ? `Could not load pools (${directoryLoadError})` : 'No pools found'}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    renderedPools.map((p, idx) => {
                      const isNew = initialMountDoneRef.current && !knownPoolsRef.current.has(p.canonicalId);
                      if (isNew) {
                        knownPoolsRef.current.add(p.canonicalId);
                      }
                      const tabKey = `${activeTab}:${currentPage}:${sortField}:${sortDirection}`;
                      return (
                        <PoolTableRow
                          key={p.canonicalId}
                          pool={p}
                          index={idx}
                          timeframe={timeframe}
                          visibleCols={visibleCols}
                          isCopied={copiedPoolId === p.id}
                          onCopyPool={copyPool}
                          isNewEntry={isNew}
                          tabKey={tabKey}
                        />
                      );
                    })
                  )}
                </TableBody>
              </table>
            </div>
          </div>

          {/* Pinned Bottom Status Bar: Showing on Left, Numbered Pagination on Right */}
            <div className="shrink-0 py-2.5 px-4 border-t border-border/40 bg-muted/10 text-xs text-muted-foreground flex items-center justify-between gap-4">
              {/* Left Side: Showing X–Y of Z pools only (Refresh button removed) */}
              <div className="flex items-center gap-2 min-w-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate font-mono select-none cursor-default text-xs text-muted-foreground">
                      {totalPools === 0 || displayPools.length === 0 ? (
                        <>
                          Showing <strong className="text-foreground font-semibold">0</strong> of{' '}
                          <strong className="text-foreground font-semibold">0</strong> pools
                        </>
                      ) : (
                        <>
                          Showing{' '}
                          <strong className="text-foreground font-semibold">
                            {startItem}–{endItem}
                          </strong>{' '}
                          of{' '}
                          <strong className="text-foreground font-semibold">
                            {totalCountDisplay}
                          </strong>{' '}
                          pools
                        </>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px] py-1 px-2 font-sans">
                    {totalPools !== null && totalPools !== undefined
                      ? `${totalPools.toLocaleString()} pools (${totalPages} page${totalPages === 1 ? '' : 's'})`
                      : `${displayPools.length} pools`}
                  </TooltipContent>
                </Tooltip>
              </div>
              <nav aria-label="Pool directory pagination" className="flex items-center gap-1 shrink-0">
                {/* Previous Page Arrow Button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-30 disabled:pointer-events-none rounded-md transition-colors"
                      disabled={currentPage <= 1 || loadingRecs}
                      onClick={() => handlePageClick(currentPage - 1)}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px] py-1 px-2 font-sans">
                    {currentPage <= 1 ? 'First page' : 'Previous page'}
                  </TooltipContent>
                </Tooltip>

                {/* Numbered Page Buttons & Ellipsis */}
                <div className="flex items-center gap-1">
                  {paginationItems.map((item, idx) => {
                    if (item === '...') {
                      return (
                        <span
                          key={`ellipsis-${idx}`}
                          className="h-7 min-w-[20px] px-1 text-xs font-mono text-muted-foreground/50 flex items-center justify-center select-none"
                          aria-hidden="true"
                        >
                          …
                        </span>
                      );
                    }

                    const isCurrent = item === currentPage;
                    return (
                      <Tooltip key={`page-${item}`}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled={loadingRecs}
                            onClick={() => handlePageClick(item)}
                            className={cn(
                              'h-7 min-w-[28px] px-2 text-xs font-mono font-medium rounded-md transition-colors flex items-center justify-center cursor-pointer select-none',
                              isCurrent
                                ? 'bg-muted text-foreground font-semibold border border-border/80 shadow-xs'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent',
                              loadingRecs && 'cursor-wait opacity-60',
                            )}
                            aria-current={isCurrent ? 'page' : undefined}
                            aria-label={`Page ${item}`}
                          >
                            {item}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[11px] py-1 px-2 font-sans">
                          {isCurrent ? `Page ${item}` : `Go to page ${item}`}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>

                {/* Next Page Arrow Button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-30 disabled:pointer-events-none rounded-md transition-colors"
                      disabled={
                        (totalPages !== null ? currentPage >= totalPages : !directoryPage?.nextCursor) ||
                        loadingRecs
                      }
                      onClick={() => handlePageClick(currentPage + 1)}
                      aria-label="Next page"
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px] py-1 px-2 font-sans">
                    {totalPages !== null && currentPage >= totalPages
                      ? 'Last page'
                      : 'Next page'}
                  </TooltipContent>
                </Tooltip>
              </nav>
            </div>
          </div>
      </div>
    </div>
  );
};

const Page = () => <PoolsContent />;

export default Page;
