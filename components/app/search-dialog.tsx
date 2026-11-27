'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  History,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { CellBadge, MetricTooltip, StandardPairIdentity } from '@/components/app/pool-cells';
import { getProtocolPoolUrl } from '@/lib/protocols';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  cleanSearchQuery,
  freshestPool,
  getEntityPool,
  refreshDirectoryEntities,
  registerPoolEntities,
  subscribeDirectory,
} from '@/lib/pool-directory';
import { settledSearchQuery, usePoolDirectory } from '@/lib/use-pool-directory';
import {
  formatApr,
  formatCompactAge,
  formatPctChange,
  formatPriceUsd,
} from '@/lib/pool-model';
import { compactUsd, usd } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CanonicalPool } from '@/lib/types';
import { useNetwork } from '@/lib/network';
import { cachePoolForWorkstation, poolWorkstationHref, prewarmPoolHistory } from '@/lib/pool-cache';

/** Link to the mint LP page with preselected pool parameters. */
const openHrefForRec = (p: CanonicalPool): string => {
  cachePoolForWorkstation(p);
  prewarmPoolHistory(p, '5m');
  return poolWorkstationHref(p);
};

export interface PoolCardData {
  id: string;
  canonicalId: string;
  version: 'v3' | 'v4' | string;
  protocol?: string;
  dexId?: string;
  chainId?: number;
  token: {
    symbol: string;
    name?: string;
    address: string;
  };
  quote: {
    symbol: string;
    address?: string;
  };
  fee: number;
  tvlUsd: number | null;
  volume24hUsd: number | null;
  feeAprPct?: number | null;
  priceNow: number | null;
  priceUsd?: number | null;
  marketCap?: number | null;
  fdv?: number | null;
  binStepPct?: number | null;
  tickSpacing?: number;
  tick?: number | null;
  priceChange24h?: number | null;
  tvlChange24h?: number | null;
  createdAt?: number | null;
  tokenCreatedAt?: number | null;
  hasHook?: boolean;
  hooksAddress?: string | null;
  launchpad?: string | null;
  isDynamicFee?: boolean;
  blocked?: boolean;
  href: string;
  pairAddress?: string;
  rawPool?: CanonicalPool;
  timestamp?: number;
  stateUpdatedAt?: number | null;
  blockNumber?: string | null;
  poolStateVersion?: number | null;
}

const fromRecItem = (p: CanonicalPool): PoolCardData => {
  const live = getEntityPool(p.canonicalId) ?? getEntityPool(p.id) ?? getEntityPool(p.pairAddress);
  const item = live ? freshestPool(p, live) : p;

  return {
    id: item.id,
    canonicalId: item.canonicalId,
    pairAddress: item.pairAddress || item.id,
    rawPool: item,
    version: item.version,
    protocol: item.protocol || item.dexId || 'uniswap',
    dexId: item.dexId,
    chainId: item.chainId,
    token: {
      symbol: item.token.symbol,
      name: item.token.name,
      address: item.token.address,
    },
    quote: {
      symbol: item.quote.symbol,
      address: item.quote.address,
    },
    fee: item.effectiveFee,
    tvlUsd: item.discoverLiquidityUsd ?? item.externalLiquidityUsd ?? item.tvlUsd,
    volume24hUsd: item.volume24hUsd ?? 0,
    feeAprPct: item.feeAprPct ?? null,
    priceNow: item.priceNow,
    priceUsd: item.priceUsd ?? null,
    marketCap: item.marketCap ?? null,
    fdv: item.fdv ?? null,
    binStepPct: item.binStepPct ?? null,
    tickSpacing: item.tickSpacing,
    tick: item.tick,
    priceChange24h: item.priceChange24h ?? null,
    tvlChange24h: item.tvlChange24h ?? item.tvlChange?.h24 ?? null,
    createdAt: item.createdAt,
    tokenCreatedAt: item.tokenCreatedAt,
    launchpad: item.launchpad ?? null,
    isDynamicFee:
      item.fee === 0x800000 ||
      item.effectiveFee === 0x800000 ||
      Boolean(item.warnings?.includes('DYNAMIC_FEE')) ||
      Boolean(item.labels?.includes('DYNAMIC_FEE')) ||
      (Boolean(item.hooks && !/^0x0{40}$/i.test(item.hooks)) && (item.effectiveFee === 0 || item.fee === 0)),
    hasHook: Boolean(item.hooks && !/^0x0{40}$/i.test(item.hooks)),
    hooksAddress: item.hooks || null,
    blocked: false,
    href: openHrefForRec(item),
  };
};

const fromV2Summary = (p: any): PoolCardData => {
  const poolId = p.poolId || p.id || '';
  const pairAddress = p.poolAddress || p.pairAddress || poolId;
  const chainId = p.chainId ?? 4663;
  const href = poolWorkstationHref({
    id: poolId,
    pairAddress,
    chainId,
  });

  const binStep = p.binStepPct ?? (p.tickSpacing ? (Math.pow(1.0001, p.tickSpacing) - 1) * 100 : null);
  const mcap = p.baseToken?.marketCapUsd ?? p.stats?.marketCapUsd ?? p.marketCap ?? null;
  const fdv = p.baseToken?.fdvUsd ?? p.stats?.fdvUsd ?? p.fdv ?? null;
  const createdAt = p.createdAtTimestamp ?? p.createdAt ?? null;
  const tokenCreatedAt = p.tokenCreatedAtTimestamp ?? p.tokenCreatedAt ?? null;

  const live = getEntityPool(p.canonicalId) ?? getEntityPool(poolId) ?? getEntityPool(pairAddress);
  const v2UpdatedAt = p.stateUpdatedAt ?? (p.updatedAt ? new Date(p.updatedAt).getTime() : 0);
  const useLive = Boolean(live && live.stateUpdatedAt > v2UpdatedAt);

  const priceNow = useLive ? live?.priceNow ?? null : p.spotPriceQuote ?? p.priceNow ?? null;
  const priceUsd = useLive ? live?.priceUsd ?? null : p.spotPriceUsd ?? p.priceUsd ?? null;
  const volume24hUsd = (useLive ? live?.volume24hUsd : null) ?? p.stats?.volume24hUsd ?? p.volume24hUsd ?? 0;
  const feeAprPct = (useLive ? live?.feeAprPct : null) ?? p.stats?.feeAprPct ?? p.feeAprPct ?? null;
  const priceChange24h = (useLive ? live?.priceChange24h : null) ?? p.stats?.priceChange24hPct ?? p.priceChange24h ?? p.priceChange?.h24 ?? null;
  const tvlUsd = (useLive ? live?.discoverLiquidityUsd ?? live?.tvlUsd : null) ?? p.tvlUsd ?? p.stats?.tvlUsd ?? null;
  const tvlChange24h = (useLive ? live?.tvlChange24h : null) ?? p.stats?.tvlChange24hPct ?? p.tvlChange24h ?? p.tvlChange?.h24 ?? null;

  return {
    id: poolId,
    canonicalId: p.canonicalId || poolId,
    pairAddress,
    version: p.protocol || 'v4',
    protocol: `uniswap_${p.protocol || 'v4'}`,
    dexId: `uniswap_${p.protocol || 'v4'}`,
    chainId,
    token: {
      symbol: p.baseToken?.symbol || p.token?.symbol || '',
      name: p.baseToken?.name || p.token?.name,
      address: p.baseToken?.address || p.token?.address || '',
    },
    quote: {
      symbol: p.quoteToken?.symbol || p.quote?.symbol || '',
      address: p.quoteToken?.address || p.quote?.address,
    },
    fee: p.feeBps != null ? p.feeBps * 100 : (p.effectiveFee ?? p.fee ?? 0),
    tvlUsd,
    volume24hUsd,
    feeAprPct,
    priceNow,
    priceUsd,
    marketCap: (useLive ? live?.marketCap : null) ?? mcap,
    fdv: (useLive ? live?.fdv : null) ?? fdv,
    binStepPct: binStep,
    tickSpacing: p.tickSpacing,
    tick: (useLive ? live?.tick : null) ?? p.currentTick ?? p.tick ?? null,
    priceChange24h,
    tvlChange24h,
    createdAt,
    tokenCreatedAt,
    launchpad: p.launchpad ?? live?.launchpad ?? null,
    isDynamicFee: Boolean(
      p.isDynamicFee ||
      live?.fee === 0x800000 ||
      live?.effectiveFee === 0x800000 ||
      live?.warnings?.includes('DYNAMIC_FEE') ||
      live?.labels?.includes('DYNAMIC_FEE')
    ),
    hasHook: Boolean(p.hooksAddress && p.hooksAddress !== '0x0000000000000000000000000000000000000000'),
    hooksAddress: p.hooksAddress || p.hooks || null,
    blocked: false,
    href,
    stateUpdatedAt: useLive ? live?.stateUpdatedAt : v2UpdatedAt,
    blockNumber: useLive ? live?.blockNumber : p.blockNumber ?? null,
    poolStateVersion: useLive ? live?.poolStateVersion : p.poolStateVersion ?? null,
  };
};

export const poolCardToCanonical = (p: PoolCardData): CanonicalPool => {
  if (p.rawPool) return p.rawPool;
  const version = (p.version === 'v3' || p.version === 'v4') ? p.version : 'v4';
  const isRwa = Boolean(
    p.launchpad?.toUpperCase() === 'RWA' ||
    p.launchpad?.toUpperCase() === 'PAIR RWA' ||
    p.token?.symbol?.toUpperCase().includes('RWA')
  );
  const labels = [
    ...(p.isDynamicFee ? ['DYNAMIC_FEE'] : []),
    ...(isRwa ? ['RWA'] : []),
  ];
  return {
      id: p.id,
      canonicalId: p.canonicalId || p.id,
      pairAddress: p.pairAddress || p.id,
      chainId: p.chainId ?? 4663,
      version,
      protocol: p.protocol || `uniswap_${version}`,
      dexId: p.dexId || `uniswap_${version}`,
      token: {
        address: p.token.address,
        symbol: p.token.symbol,
        name: p.token.name || p.token.symbol,
        decimals: (p.token as any)?.decimals ?? 18,
      },
      quote: {
        address: p.quote.address || '',
        symbol: p.quote.symbol,
        name: (p.quote as any)?.name || p.quote.symbol,
        decimals: (p.quote as any)?.decimals ?? 18,
      },
      token0: p.token.address,
      token1: p.quote.address || '',
      quoteIsToken0: false,
      quoteIsNative: p.quote.symbol === 'ETH' || p.quote.symbol === 'WETH',
      fee: p.isDynamicFee ? 0x800000 : p.fee,
      effectiveFee: p.isDynamicFee ? 0 : p.fee,
      feePct: p.fee ? p.fee / 10000 : 0,
      tickSpacing: p.tickSpacing ?? 10,
      binStepPct: p.binStepPct ?? 0,
      tick: p.tick ?? null,
      hooks: p.hooksAddress || '',
      labels,
      warnings: p.isDynamicFee ? ['DYNAMIC_FEE'] : [],
      verification: 'contract-identified',
      createdAt: p.createdAt ?? null,
      tokenCreatedAt: p.tokenCreatedAt ?? null,
      tokenOrigin: isRwa ? 'rwa' : (p.hooksAddress ? 'launchpad' : 'organic'),
      priceNow: p.priceNow,
      priceUsd: p.priceUsd ?? null,
      priceChange24h: p.priceChange24h ?? null,
      priceChange: p.priceChange24h !== null && p.priceChange24h !== undefined ? { h24: p.priceChange24h } : null,
      tvlUsd: p.tvlUsd,
      volume24hUsd: p.volume24hUsd,
      feeAprPct: p.feeAprPct ?? null,
      marketCap: p.marketCap ?? null,
      fdv: p.fdv ?? null,
      launchpad: p.launchpad ?? null,
      stateUpdatedAt: p.stateUpdatedAt ?? Date.now(),
      blockNumber: p.blockNumber ?? null,
      poolStateVersion: p.poolStateVersion ?? null,
    } as unknown as CanonicalPool;
};

const HISTORY_KEY = 'invictus.searchPoolHistory.v4';
const LEGACY_HISTORY_KEY = 'invictus.searchPoolHistory.v3';

const getStoredPoolHistory = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY) || localStorage.getItem(LEGACY_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === 'string' ? item : item?.canonicalId || item?.id))
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .slice(0, 10);
  } catch {
    return [];
  }
};

const saveStoredPoolHistory = (items: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 10)));
  } catch {
    // Ignore storage quota errors
  }
};

/** Unified Pools Table Component with explicit headers and aligned metrics */
const PoolsTable = ({
  pools,
  selectedIndex,
  onSelect,
  onHoverIndex,
}: {
  pools: PoolCardData[];
  selectedIndex?: number;
  onSelect: (pool: PoolCardData) => void;
  onHoverIndex?: (index: number) => void;
}) => {
  const rowRefs = React.useRef<(HTMLTableRowElement | null)[]>([]);

  React.useEffect(() => {
    if (selectedIndex !== undefined && rowRefs.current[selectedIndex]) {
      rowRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden shadow-xs flex-1 min-h-0 flex flex-col">
      <div className="overflow-x-auto flex-1 min-h-0 flex flex-col app-scrollbar">
        {/* Fixed Header: scrollbar does not reach here */}
        <div
          style={{ scrollbarGutter: 'stable' }}
          className="border-b border-border/50 bg-muted/20 shrink-0 select-none min-w-[700px] lg:min-w-0"
        >
          <table className="w-full caption-bottom text-sm table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-0 text-xs">
                <TableHead className="w-[25%] min-w-[180px] h-10 py-2.5 font-semibold pl-4">
                  <span>Pair</span>
                </TableHead>
                <TableHead className="w-[13%] min-w-[90px] h-10 py-2.5 text-right font-semibold">
                  <span>Price</span>
                </TableHead>
                <TableHead className="w-[10%] min-w-[75px] h-10 py-2.5 text-right font-semibold">
                  <MetricTooltip content="Pool age and token age">
                    <span>Age</span>
                  </MetricTooltip>
                </TableHead>
                <TableHead className="w-[13%] min-w-[90px] h-10 py-2.5 text-right font-semibold">
                  <MetricTooltip content="Market cap and 24h change">
                    <span>MC</span>
                  </MetricTooltip>
                </TableHead>
                <TableHead className="w-[13%] min-w-[90px] h-10 py-2.5 text-right font-semibold">
                  <MetricTooltip content="Total value locked and 24h change">
                    <span>TVL</span>
                  </MetricTooltip>
                </TableHead>
                <TableHead className="w-[13%] min-w-[90px] h-10 py-2.5 text-right font-semibold">
                  <MetricTooltip content="24h volume and estimated APR">
                    <span>24h Vol</span>
                  </MetricTooltip>
                </TableHead>
                <TableHead className="w-[13%] min-w-[90px] h-10 py-2.5 text-right font-semibold pr-4">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
          </table>
        </div>

        {/* Scrollable Data Rows: scrollbar starts below the header */}
        <div
          style={{ scrollbarGutter: 'stable' }}
          className="overflow-y-auto flex-1 min-h-0 app-scrollbar min-w-[700px] lg:min-w-0"
        >
          <table className="w-full caption-bottom text-sm table-fixed">
            <TableBody>
            {pools.map((pool, index) => {
              const isSelected = selectedIndex === index;
              const poolAge = pool.createdAt ? formatCompactAge(pool.createdAt) : null;
              const tokenAge = pool.tokenCreatedAt ? formatCompactAge(pool.tokenCreatedAt) : null;
              const tvlChangePct = pool.tvlChange24h ?? (pool.rawPool?.tvlChange24h ?? pool.rawPool?.tvlChange?.h24) ?? null;
              const spacingText =
                pool.tickSpacing !== null && pool.tickSpacing !== undefined
                  ? String(pool.tickSpacing)
                  : pool.binStepPct
                    ? `±${pool.binStepPct.toFixed(2)}%`
                    : null;
              const protocolKey = pool.protocol || pool.dexId || 'uniswap';
              const protocolUrl = getProtocolPoolUrl(protocolKey, pool.id, pool.chainId);
              const priceDisplay = formatPriceUsd(pool.priceUsd, pool.priceNow, pool.quote.symbol);

              const capValue = pool.marketCap && pool.marketCap > 0 ? pool.marketCap : null;
              const capDisplay = capValue ? compactUsd(capValue) : '—';

              return (
                <TableRow
                  key={pool.id}
                  ref={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  onMouseEnter={() => {
                    onHoverIndex?.(index);
                    const canonical = poolCardToCanonical(pool);
                    cachePoolForWorkstation(canonical);
                    prewarmPoolHistory(canonical, '5m');
                  }}
                  onClick={() => onSelect(pool)}
                  className={cn(
                    'hover:bg-muted/30 border-b border-border/40 last:border-b-0 transition-colors cursor-pointer group/row h-14 sm:h-16 relative',
                    isSelected && 'bg-muted/50 dark:bg-muted/40 border-l-2 border-l-primary shadow-2xs',
                  )}
                >
                  {/* Pair Column */}
                  <TableCell className="w-[25%] min-w-[180px] pl-4 py-2 overflow-hidden">
                    <StandardPairIdentity
                      chainId={pool.chainId ?? 4663}
                      baseSymbol={pool.token.symbol}
                      quoteSymbol={pool.quote.symbol}
                      baseAddress={pool.token.address}
                      quoteAddress={pool.quote.address}
                      protocol={protocolKey}
                      protocolVersion={pool.version}
                      poolId={pool.id}
                      protocolUrl={protocolUrl}
                      launchpad={pool.launchpad ?? undefined}
                      hasHook={pool.hasHook}
                      subContent={
                        <div className="flex items-center gap-1.5 text-[11px] font-mono leading-tight">
                          <span className="font-semibold text-foreground tabular">
                            {pool.isDynamicFee ? '0.00%' : `${(pool.fee / 10000).toFixed(2)}%`}
                          </span>
                          {spacingText && (
                            <>
                              <span className="text-foreground/35">·</span>
                              <span className="text-foreground/75">{spacingText}</span>
                            </>
                          )}
                          {pool.version && <CellBadge>{pool.version.toUpperCase()}</CellBadge>}
                          {pool.isDynamicFee && <CellBadge>Dynamic</CellBadge>}
                          {Boolean(
                            pool.launchpad?.toUpperCase().includes('RWA') ||
                            pool.token.name?.includes('Robinhood Token')
                          ) && <CellBadge>RWA</CellBadge>}
                        </div>
                      }
                    />
                  </TableCell>

                  {/* Price Column */}
                  <TableCell className="w-[13%] min-w-[90px] tabular text-right font-mono text-xs overflow-hidden py-2.5">
                    <div className="flex flex-col items-end overflow-hidden select-none">
                      <span className="font-semibold text-foreground text-xs sm:text-[13px] tracking-tight tabular-nums truncate">
                        {priceDisplay}
                      </span>
                      <span className="text-[11px] font-mono leading-tight mt-0.5 truncate">
                        {pool.priceChange24h !== undefined && pool.priceChange24h !== null ? (
                          <span
                            className={cn(
                              'font-medium',
                              pool.priceChange24h > 0
                                ? 'text-emerald-500'
                                : pool.priceChange24h < 0
                                ? 'text-rose-500'
                                : 'text-muted-foreground',
                            )}
                          >
                            {formatPctChange(pool.priceChange24h)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </span>
                    </div>
                  </TableCell>

                  {/* Age Column */}
                  <TableCell className="w-[10%] min-w-[75px] tabular text-right font-mono text-xs overflow-hidden py-2.5">
                    <MetricTooltip
                      content={
                        pool.createdAt || pool.tokenCreatedAt ? (
                          <div className="space-y-1.5 min-w-[175px]">
                            {pool.createdAt && (
                              <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <span className="size-1.5 rounded-full bg-primary/70" /> Pool Created
                                </span>
                                <span className="tabular font-medium font-mono text-foreground">
                                  {new Date(pool.createdAt < 1e11 ? pool.createdAt * 1000 : pool.createdAt).toLocaleDateString(undefined, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </span>
                              </div>
                            )}
                            {pool.tokenCreatedAt && (
                              <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <span className="size-1.5 rounded-full bg-muted-foreground/60" /> Token Created
                                </span>
                                <span className="tabular font-medium font-mono text-foreground">
                                  {new Date(pool.tokenCreatedAt < 1e11 ? pool.tokenCreatedAt * 1000 : pool.tokenCreatedAt).toLocaleDateString(undefined, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : null
                      }
                    >
                      <div className="flex flex-col items-end overflow-hidden select-none">
                        <span className="font-semibold text-foreground text-xs sm:text-[13px] tracking-tight tabular-nums truncate">
                          {poolAge || '—'}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono leading-tight mt-0.5 truncate">
                          {tokenAge || '—'}
                        </span>
                      </div>
                    </MetricTooltip>
                  </TableCell>

                  {/* MC Column */}
                  <TableCell className="w-[13%] min-w-[90px] tabular text-right font-mono text-xs overflow-hidden py-2.5">
                    <MetricTooltip
                      content={
                        pool.fdv && (!pool.marketCap || Math.abs(pool.fdv - pool.marketCap) > 1) ? (
                          <div className="flex items-center justify-between gap-3 min-w-[150px] text-xs">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <span className="size-1.5 rounded-full bg-primary/70" /> FDV
                            </span>
                            <span className="tabular font-medium font-mono text-foreground">{usd(pool.fdv)}</span>
                          </div>
                        ) : null
                      }
                    >
                      <div className="flex flex-col items-end overflow-hidden select-none">
                        <span className="font-semibold text-foreground text-xs sm:text-[13px] tracking-tight tabular-nums truncate">
                          {capDisplay}
                        </span>
                        <span className="text-[11px] font-mono leading-tight mt-0.5 truncate">
                          {pool.priceChange24h !== undefined && pool.priceChange24h !== null ? (
                            <span
                              className={cn(
                                'font-medium',
                                pool.priceChange24h > 0
                                  ? 'text-emerald-500'
                                  : pool.priceChange24h < 0
                                  ? 'text-rose-500'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {formatPctChange(pool.priceChange24h)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </span>
                      </div>
                    </MetricTooltip>
                  </TableCell>

                  {/* TVL Column */}
                  <TableCell className="w-[13%] min-w-[90px] tabular text-right font-mono text-xs overflow-hidden py-2.5">
                    <MetricTooltip
                      content={
                        tvlChangePct !== null ? (
                          <div className="flex items-center justify-between gap-3 min-w-[150px] text-xs">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <span className="size-1.5 rounded-full bg-primary/70" /> 24h TVL Change
                            </span>
                            <span className="tabular font-medium font-mono text-foreground">
                              {formatPctChange(tvlChangePct)}
                            </span>
                          </div>
                        ) : null
                      }
                    >
                      <div className="flex flex-col items-end overflow-hidden select-none">
                        <span className="font-semibold text-foreground text-xs sm:text-[13px] tracking-tight tabular-nums truncate">
                          {usd(pool.tvlUsd)}
                        </span>
                        <span className="text-[11px] font-mono leading-tight mt-0.5 truncate">
                          {tvlChangePct !== null ? (
                            <span
                              className={cn(
                                'font-medium',
                                tvlChangePct > 0
                                  ? 'text-emerald-500'
                                  : tvlChangePct < 0
                                  ? 'text-rose-500'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {formatPctChange(tvlChangePct)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </span>
                      </div>
                    </MetricTooltip>
                  </TableCell>

                  {/* 24h Vol Column */}
                  <TableCell className="w-[13%] min-w-[90px] tabular text-right font-mono text-xs overflow-hidden py-2.5">
                    <MetricTooltip
                      content={
                        <div className="flex items-center gap-2 text-xs text-muted-foreground leading-snug max-w-[200px]">
                          <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span>Annualized from 24h fee revenue relative to TVL</span>
                        </div>
                      }
                    >
                      <div className="flex flex-col items-end overflow-hidden select-none">
                        <span className="font-semibold text-foreground text-xs sm:text-[13px] tracking-tight tabular-nums truncate">
                          {usd(pool.volume24hUsd)}
                        </span>
                        <span className="text-[11px] font-mono leading-tight mt-0.5 truncate">
                          {pool.feeAprPct && pool.feeAprPct > 0 ? (
                            <span className="text-emerald-500/90 font-medium">
                              {formatApr(pool.feeAprPct)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </span>
                      </div>
                    </MetricTooltip>
                  </TableCell>

                  {/* Action Column */}
                  <TableCell className="w-[13%] min-w-[90px] text-right py-2.5 pr-4 overflow-hidden">
                    <div className="flex items-center justify-end">
                      <Button
                        size="sm"
                        variant={isSelected ? 'default' : pool.blocked ? 'outline' : 'default'}
                        className={cn(
                          'h-7 px-2.5 text-xs font-semibold shadow-xs cursor-pointer gap-1 shrink-0 transition-all duration-150',
                          isSelected && 'ring-1 ring-primary/40 shadow-sm',
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(pool);
                        }}
                      >
                        <span>{pool.blocked ? 'View' : 'Deposit'}</span>
                        <ArrowRight className="size-3 transition-transform duration-150 group-hover/row:translate-x-0.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </table>
      </div>
    </div>
  </div>
);
};

export function SearchDialog() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [history, setHistory] = React.useState<PoolCardData[]>([]);
  const [historyIds, setHistoryIds] = React.useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [lastResults, setLastResults] = React.useState<PoolCardData[]>([]);
  const { inNetwork } = useNetwork();

  const rawQuery = query.trim();
  const cleanedRawQuery = cleanSearchQuery(rawQuery);
  const activeQuery = settledSearchQuery(open, cleanedRawQuery, cleanSearchQuery(debouncedQuery));
  const querySettled = activeQuery !== null;
  const historySearch = usePoolDirectory(open && !debouncedQuery && historyIds.length ? { ids: historyIds.join(',') } : null);

  const [v2Loading, setV2Loading] = React.useState(false);
  const [v2Error, setV2Error] = React.useState<string | null>(null);
  const [retryCount, setRetryCount] = React.useState(0);

  React.useEffect(() => {
    if (!activeQuery) {
      setLastResults([]);
      setV2Loading(false);
      return;
    }
    const controller = new AbortController();
    setV2Loading(true);
    setV2Error(null);

    fetch(`/api/v2/search?q=${encodeURIComponent(activeQuery)}&limit=10`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Search failed');
        const json = await res.json();
        const rawPools = json?.data?.pools ?? [];
        const pools = rawPools.map(fromV2Summary);
        const canonicals: CanonicalPool[] = [];
        for (const p of pools) {
          const canonical = poolCardToCanonical(p);
          cachePoolForWorkstation(canonical);
          canonicals.push(canonical);
        }
        registerPoolEntities(canonicals);
        setLastResults(pools);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setV2Error(err instanceof Error ? err.message : 'Search error');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setV2Loading(false);
        }
      });

    return () => controller.abort();
  }, [activeQuery, retryCount]);

  const busy = open && Boolean(rawQuery) && (!querySettled || v2Loading);
  const error = v2Error;

  const inputRef = React.useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Load pool click history from localStorage on mount
  React.useEffect(() => {
    setHistoryIds(getStoredPoolHistory());
  }, []);

  React.useEffect(() => {
    setDebouncedQuery('');
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Reset results when input is cleared
  React.useEffect(() => {
    if (!query.trim()) {
      setLastResults([]);
    }
    setSelectedIndex(0);
  }, [query]);

  React.useEffect(() => {
    if (!historySearch.page?.pools && history.length === 0) return;
    const poolMap = new Map<string, CanonicalPool>();
    if (historySearch.page?.pools) {
      for (const p of historySearch.page.pools) {
        poolMap.set(p.canonicalId.toLowerCase(), p);
        poolMap.set(p.id.toLowerCase(), p);
      }
    }
    const ordered: PoolCardData[] = [];
    const seen = new Set<string>();
    for (const id of historyIds) {
      const clean = id.toLowerCase();
      const live = getEntityPool(id);
      const p = live
        ? (poolMap.get(clean) ? freshestPool(poolMap.get(clean), live) : live)
        : poolMap.get(clean);
      if (p && !seen.has(p.id.toLowerCase())) {
        seen.add(p.id.toLowerCase());
        ordered.push(fromRecItem(p));
      }
    }
    if (ordered.length > 0) {
      setHistory(ordered);
    }
  }, [historySearch.page, historyIds]);

  // Live subscription to directory updates (SSE ticks, execution overlays, refreshDirectoryEntities)
  React.useEffect(() => {
    if (!open) return;
    return subscribeDirectory(() => {
      // 1. Keep history fresh
      setHistory((prev) => {
        if (prev.length === 0) return prev;
        return prev.map((card) => {
          const live = getEntityPool(card.id) ?? getEntityPool(card.canonicalId);
          if (!live) return card;
          return fromRecItem(live);
        });
      });

      // 2. Keep queried search results fresh
      setLastResults((prev) => {
        if (prev.length === 0) return prev;
        return prev.map((card) => {
          const live = getEntityPool(card.id) ?? getEntityPool(card.canonicalId);
          if (!live) return card;
          return fromRecItem(live);
        });
      });
    });
  }, [open]);

  // Hotkey listener: '/' or 'Cmd+K'
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox');

      if (e.key === '/' && !isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Focus input and refresh lightweight ID-only history when opened.
  React.useEffect(() => {
    if (open) {
      const latestIds = getStoredPoolHistory();
      setHistoryIds(latestIds);
      setSelectedIndex(0);

      if (latestIds.length > 0) {
        // Immediate local fallback from existing entities so user sees immediate data
        const initial: PoolCardData[] = [];
        const seen = new Set<string>();
        for (const id of latestIds) {
          const live = getEntityPool(id);
          if (live && !seen.has(live.id.toLowerCase())) {
            seen.add(live.id.toLowerCase());
            initial.push(fromRecItem(live));
          }
        }
        if (initial.length > 0) {
          setHistory(initial);
        }

        // Force fresh network fetch for all history items (bypasses 60s cache)
        void refreshDirectoryEntities(latestIds);
      }
      historySearch.restart();

      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    } else {
      setQuery('');
      setDebouncedQuery('');
      setLastResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  const handleSelectPool = (pool: PoolCardData) => {
    const canonical = poolCardToCanonical(pool);
    cachePoolForWorkstation(canonical);
    prewarmPoolHistory(canonical, '5m');
    setHistoryIds((prev) => {
      const next = [pool.id, ...prev.filter((id) => id !== pool.id && id !== pool.canonicalId)].slice(0, 10);
      saveStoredPoolHistory(next);
      return next;
    });
    setOpen(false);
    React.startTransition(() => {
      router.push(pool.href);
    });
  };

  const clearAllHistory = () => {
    setHistoryIds([]);
    setHistory([]);
    saveStoredPoolHistory([]);
    toast.success('Search history cleared');
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const rawPasted = e.clipboardData.getData('text');
    const cleaned = cleanSearchQuery(rawPasted);
    setQuery(cleaned);
    if (/^0x[a-fA-F0-9]{40}$/.test(cleaned) || /^0x[a-fA-F0-9]{64}$/.test(cleaned)) {
      setDebouncedQuery(cleaned);
    }
  };

  const handleClear = () => {
    setQuery('');
    setDebouncedQuery('');
    setLastResults([]);
    setSelectedIndex(0);
    inputRef.current?.focus();
  };

  // Scoped to the selected network, history included; every network shows them all.
  const activePools = (rawQuery.length > 0 ? lastResults : history).filter((p) => inNetwork(p.chainId)).slice(0, rawQuery.length > 0 ? undefined : 10);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (activePools.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % activePools.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (activePools.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + activePools.length) % activePools.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activePools.length > 0 && activePools[selectedIndex]) {
        handleSelectPool(activePools[selectedIndex]);
      } else if (rawQuery) {
        setDebouncedQuery(rawQuery);
      }
    } else if (e.key === 'Escape') {
      if (query) {
        e.preventDefault();
        e.stopPropagation();
        handleClear();
      }
    }
  };

  return (
    <>
      {/* Topbar Trigger Button */}
      <Button
        variant="outline"
        size="sm"
        className="text-muted-foreground bg-muted/30 hover:bg-muted/60 hover:text-foreground relative h-8 w-full justify-start rounded-lg border-border/50 text-xs sm:w-44 md:w-48 transition-colors cursor-pointer px-2.5"
        onClick={() => setOpen(true)}
      >
        <Search className="size-3.5 text-muted-foreground/70 shrink-0 mr-1.5" />
        <span className="inline-flex truncate text-xs">Search pools...</span>
        <kbd className="bg-background text-muted-foreground pointer-events-none absolute top-1.5 right-1.5 hidden h-5 select-none items-center rounded border border-border/60 px-1.5 font-mono text-[10px] font-medium sm:flex">
          /
        </kbd>
      </Button>

      {/* Modern High-End Search Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-[96vw] sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl h-[580px] sm:h-[620px] max-h-[88vh] flex flex-col p-0 overflow-hidden gap-0 rounded-2xl border border-border/70 bg-popover shadow-2xl"
        >
          {/* Search Header with Stable Height & Rigid Layout */}
          <div className="relative border-b border-border/40 bg-card/15 p-3 sm:p-3.5 shrink-0">
            <DialogTitle className="sr-only">Search Pools</DialogTitle>
            <div className="group relative flex items-center h-12 w-full rounded-xl border border-border/70 bg-background/90 px-3.5 transition-all duration-150 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15 shadow-2xs">
              <Search className="size-4 text-muted-foreground/60 shrink-0 mr-3 pointer-events-none transition-colors group-focus-within:text-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                placeholder="Search pools..."
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                className="h-full w-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm sm:text-base font-normal text-foreground placeholder:text-muted-foreground/45 outline-none focus:outline-none focus:ring-0 leading-normal"
                onChange={(e) => {
                  setQuery(e.target.value);
                }}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
              />
              <div className="flex items-center gap-1.5 shrink-0 ml-2 h-full">
                {query && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="size-6 flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 rounded-md transition-all active:scale-95 cursor-pointer"
                    title="Clear search (Esc)"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center text-[10px] font-mono border border-border/60 hover:border-border/90 rounded px-1.5 py-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer select-none"
                  title="Close (Esc)"
                  aria-label="Close search"
                >
                  ESC
                </button>
              </div>
            </div>

            {/* Subtle indeterminate progress bar at bottom of search header when busy */}
            {busy && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden bg-transparent pointer-events-none">
                <div className="h-full w-full bg-gradient-to-r from-transparent via-primary/80 to-transparent animate-pulse" />
              </div>
            )}
          </div>

          {/* List Content Area */}
          <div className="flex-1 min-h-0 overflow-hidden p-3.5 sm:p-4 flex flex-col">
            {/* Initial search loading (first time, no pools yet) */}
            {busy && activePools.length === 0 && rawQuery.length > 0 && (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center space-y-2.5 select-none">
                <Loader2 className="size-5 animate-spin text-primary/70" />
                <p className="text-xs text-muted-foreground/70 font-mono">Searching pools...</p>
              </div>
            )}

            {/* Error loading pools */}
            {!busy && error && rawQuery.length > 0 && (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-sm text-muted-foreground space-y-2 select-none">
                <p>{error ? `Could not load pools (${error})` : 'Could not load pools'}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs cursor-pointer"
                  onClick={() => setRetryCount((c) => c + 1)}
                >
                  Retry
                </Button>
              </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW B: FILTERED REAL-TIME POOLS (WHEN TYPING A QUERY)                   */}
            {/* ========================================================================= */}
            {rawQuery.length > 0 && !error && (activePools.length > 0 || (!busy && querySettled)) && (
              <div className={cn('flex-1 min-h-0 flex flex-col transition-opacity duration-150', busy && 'opacity-60')}>
                {activePools.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-16 text-center select-none">
                    <p className="text-sm text-muted-foreground">No pools found</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-1 text-xs text-muted-foreground mb-2 shrink-0">
                      <span className="font-semibold text-xs text-foreground tracking-tight">
                        Matching Results
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground/60">
                        {activePools.length} pool{activePools.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <PoolsTable
                      pools={activePools}
                      selectedIndex={selectedIndex}
                      onSelect={handleSelectPool}
                      onHoverIndex={setSelectedIndex}
                    />
                  </>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW C: IDLE VIEW (EMPTY INPUT - SHOWS RECENT SEARCHES OR EMPTY GUIDE)    */}
            {/* ========================================================================= */}
            {rawQuery.length === 0 && (
              <div className="flex-1 min-h-0 flex flex-col">
                {history.length > 0 ? (
                  <div className="flex-1 min-h-0 flex flex-col">
                    <div className="flex items-center justify-between px-1 text-xs text-muted-foreground mb-2 shrink-0">
                      <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground tracking-tight">
                        <History className="size-3.5 text-muted-foreground/60" />
                        <span>Recent Searches</span>
                      </div>
                      <button
                        type="button"
                        onClick={clearAllHistory}
                        className="text-[11px] font-medium text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                      >
                        Clear all
                      </button>
                    </div>

                    <PoolsTable
                      pools={history.slice(0, 10)}
                      selectedIndex={selectedIndex}
                      onSelect={handleSelectPool}
                      onHoverIndex={setSelectedIndex}
                    />
                  </div>
                ) : historySearch.loading && historyIds.length > 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-16 text-center space-y-2.5 select-none">
                    <Loader2 className="size-4 animate-spin text-muted-foreground/60" />
                    <p className="text-xs text-muted-foreground/60 font-mono">Loading history...</p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center select-none py-16">
                    <p className="text-sm text-muted-foreground">No recent searches</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Minimized Terminal Footer Bar */}
          <div className="border-t border-border/40 bg-muted/10 px-4 py-2.5 flex items-center justify-between text-[11px] text-muted-foreground/60 shrink-0 font-mono select-none">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <kbd className="text-[10px] border border-border/50 rounded px-1.5 py-0.5 bg-background/50 leading-none text-muted-foreground font-semibold">
                  ↑↓
                </kbd>
                <span>navigate</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="text-[10px] border border-border/50 rounded px-1.5 py-0.5 bg-background/50 leading-none text-muted-foreground font-semibold">
                  ↵
                </kbd>
                <span>select</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="text-[10px] border border-border/50 rounded px-1.5 py-0.5 bg-background/50 leading-none text-muted-foreground font-semibold">
                  esc
                </kbd>
                <span>close</span>
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
