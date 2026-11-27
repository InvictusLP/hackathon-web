'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useNumberTicker } from '@/lib/motion';
import { Check, FishingHook } from 'lucide-react';
import { toast } from 'sonner';
import { PairAvatar } from '@/components/app/token-avatar';
import { ProtocolAvatar } from '@/components/app/protocol-avatar';
import { ChainAvatar } from '@/components/app/chain-avatar';
import { LaunchpadAvatar, getLaunchpadInfo } from '@/components/app/launchpad-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { compactUsd, formatSubscriptPrice, usd } from '@/lib/format';
import { formatExplorerUrl } from '@/lib/explorer';
import { getProtocolPoolUrl, parseProtocol, resolveChainSlug } from '@/lib/protocols';
import { cn } from '@/lib/utils';
import type { DiscoveredPool } from '@/lib/pool-model';
import {
  formatApr,
  formatCompactAge,
  formatPctChange,
  formatPriceUsd,
  formatTurnoverRatio,
} from '@/lib/pool-model';
import { cachePoolForWorkstation, poolWorkstationHref, prewarmPoolHistory } from '@/lib/pool-cache';

/** Reusable metric tooltip wrapper with dark terminal-style styling */
export interface MetricTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  asChild?: boolean;
  sideOffset?: number;
}

export const MetricTooltip: React.FC<MetricTooltipProps> = ({
  content,
  children,
  side = 'top',
  className,
  asChild = false,
  sideOffset = 5,
}) => {
  if (!content) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {asChild ? (
          children
        ) : (
          <span className={cn('inline-flex flex-col cursor-default', className)}>
            {children}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={sideOffset}
        className="rounded-lg border border-border/70 bg-popover/95 text-popover-foreground p-2.5 text-xs shadow-xl backdrop-blur-md select-none"
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
};

export interface MetricIndicator {
  direction: 'up' | 'down';
  key: number;
}

/** Reusable two-level information hierarchy cell */
export interface PrimarySecondaryMetricProps {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  secondaryTone?: 'neutral' | 'positive' | 'negative' | 'warning' | 'muted';
  align?: 'left' | 'right' | 'center';
  className?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
  changeDirection?: 'up' | 'down' | 'neutral' | 'none';
  indicator?: MetricIndicator | null;
}

export const PrimarySecondaryMetric: React.FC<PrimarySecondaryMetricProps> = ({
  primary,
  secondary,
  secondaryTone = 'neutral',
  align = 'right',
  className,
  primaryClassName,
  secondaryClassName,
  indicator,
}) => {
  const toneClasses = {
    neutral: 'text-muted-foreground font-mono',
    muted: 'text-muted-foreground/60 font-mono',
    positive: 'text-up font-mono font-medium',
    negative: 'text-down font-mono font-medium',
    warning: 'text-amber-500 font-mono font-medium',
  }[secondaryTone];

  const alignClasses = {
    left: 'text-left items-start',
    right: 'text-right items-end',
    center: 'text-center items-center',
  }[align];

  return (
    <div
      className={cn(
        'flex flex-col select-none overflow-visible rounded-sm px-0.5 -mx-0.5',
        alignClasses,
        className
      )}
    >
      <div
        className={cn(
          'relative inline-flex items-center font-semibold text-foreground text-xs sm:text-[13px] tracking-tight tabular-nums leading-tight max-w-full rounded-xs px-0.5 transition-colors',
          indicator?.direction === 'up' && 'text-up value-flash-up',
          indicator?.direction === 'down' && 'text-down value-flash-down',
          primaryClassName,
        )}
      >
        <span className="truncate">{primary}</span>
        {indicator && (
          <span
            key={indicator.key}
            className={cn(
              'pointer-events-none absolute left-full ml-1 top-1/2 -translate-y-1/2 flex items-center justify-center',
              indicator.direction === 'up' ? 'text-up animate-triangle-up' : 'text-down animate-triangle-down'
            )}
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 10 8"
              className="w-2.5 h-2 shrink-0 fill-current"
              aria-hidden="true"
            >
              {indicator.direction === 'up' ? (
                <polygon points="5,0.5 9.5,7.5 0.5,7.5" />
              ) : (
                <polygon points="5,7.5 9.5,0.5 0.5,0.5" />
              )}
            </svg>
          </span>
        )}
      </div>
      {secondary !== undefined && secondary !== null && secondary !== '' && (
        <div
          className={cn(
            'text-[11px] tabular-nums font-normal leading-tight mt-0.5 truncate max-w-full',
            toneClasses,
            secondaryClassName,
          )}
        >
          {secondary}
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// 1. POOL IDENTITY CELL (Avatar + Pair + Version + CA Actions)
// -------------------------------------------------------------

function getChainExplorerAddressUrl(address: string, chainId?: string | number | null): string {
  const c = resolveChainSlug(chainId);
  if (c === 'arc') return `https://arc-scan.io/address/${address}`;
  if (c === 'arbitrum') return `https://arbiscan.io/address/${address}`;
  if (c === 'base') return `https://basescan.org/address/${address}`;
  if (c === 'ethereum') return `https://etherscan.io/address/${address}`;
  if (c === 'solana') return `https://solscan.io/account/${address}`;
  if (c === 'bsc' || c === 'bnb') return `https://bscscan.com/address/${address}`;
  if (c === 'polygon') return `https://polygonscan.com/address/${address}`;
  return formatExplorerUrl(address);
}

function getChainDisplayName(chainId?: string | number | null): string {
  const key = String(chainId || '4663').toLowerCase();
  switch (key) {
    case '4663':
    case 'robinhood':
      return 'Robinhood Chain';
    case '5042':
    case 'arc':
      return 'Arc Network';
    case '1':
    case 'ethereum':
      return 'Ethereum';
    case '42161':
    case 'arbitrum':
      return 'Arbitrum';
    case '8453':
    case 'base':
      return 'Base';
    case 'solana':
      return 'Solana';
    case '56':
    case 'bsc':
    case 'bnb':
      return 'BNB Chain';
    case '137':
    case 'polygon':
      return 'Polygon';
    default:
      return 'Chain';
  }
}

/**
 * Neutral micro-badge for identity cells (version, dynamic, rwa, etc.).
 * Inherits the workstation protocol version pill style (rounded-4xl, subtle background, border, font-semibold)
 * scaled down to match fee % and bins/spacing typography with neutral tones.
 */
export const CellBadge: React.FC<{
  children: React.ReactNode;
  variant?: 'neutral' | 'subtle';
  className?: string;
}> = ({ children, variant = 'neutral', className }) => (
  <span
    className={cn(
      'inline-flex items-center justify-center gap-1 px-1.5 py-0 h-4 rounded-4xl border text-[10px] font-mono font-semibold uppercase tracking-tight leading-none select-none shrink-0 transition-colors',
      variant === 'neutral' && 'bg-muted/40 border-border/50 text-muted-foreground',
      variant === 'subtle' && 'bg-muted/25 border-border/40 text-muted-foreground/75',
      className,
    )}
  >
    {children}
  </span>
);

export interface StandardPairIdentityProps {
  chainId?: number | string | null;
  baseSymbol: string;
  quoteSymbol: string;
  baseAddress?: string | null;
  quoteAddress?: string | null;
  baseImg?: string | null;
  quoteImg?: string | null;
  protocol?: string | null;
  protocolVersion?: string | null;
  poolId?: string | null;
  chainExplorerUrl?: string | null;
  protocolUrl?: string | null;
  launchpad?: string | null;
  launchpadUrl?: string | null;
  hasHook?: boolean;
  hookTooltip?: React.ReactNode;
  subContent?: React.ReactNode;
  onCopyPoolId?: (id: string) => void;
  className?: string;
}

export const StandardPairIdentity: React.FC<StandardPairIdentityProps> = ({
  chainId = 4663,
  baseSymbol,
  quoteSymbol,
  baseAddress,
  quoteAddress,
  baseImg,
  quoteImg,
  protocol = 'uniswap',
  protocolVersion,
  poolId,
  chainExplorerUrl,
  protocolUrl,
  launchpad,
  launchpadUrl,
  hasHook = false,
  hookTooltip,
  subContent,
  onCopyPoolId,
  className,
}) => {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const copyTokenCA = (e: React.MouseEvent, symbol: string, address?: string | null) => {
    e.stopPropagation();
    e.preventDefault();
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopiedToken(symbol);
    toast.success(`${symbol} CA copied`);
    setTimeout(() => setCopiedToken(null), 1500);
  };

  const chainName = getChainDisplayName(chainId);
  const chainSlug = resolveChainSlug(chainId);
  const resolvedChainExplorerUrl = chainExplorerUrl || (poolId ? getChainExplorerAddressUrl(poolId, chainId) : undefined);

  const protocolKey = protocol || 'uniswap';
  const protocolMeta = parseProtocol(protocolKey, protocolVersion);
  const resolvedProtocolUrl =
    protocolUrl ||
    (poolId ? getProtocolPoolUrl(protocolKey, poolId, chainId) : undefined) ||
    (poolId ? `https://dexscreener.com/${chainSlug}/${poolId}` : undefined);

  const launchpadMeta = getLaunchpadInfo(launchpad);
  const launchpadDisplayName = launchpad || launchpadMeta?.name || 'Launchpad';
  const resolvedLaunchpadUrl = launchpadUrl || launchpadMeta?.url || resolvedProtocolUrl;

  const handlePairAvatarClick = (e: React.MouseEvent) => {
    if (!poolId) return;
    e.stopPropagation();
    navigator.clipboard.writeText(poolId);
    toast.success('Pool address copied');
    onCopyPoolId?.(poolId);
  };

  return (
    <div className={cn('flex flex-col text-left min-w-0 flex-1 pt-0.5', className)}>
      {/* Row 1: Chain Avatar (on top, aligned with pair avatar) + Pair Avatar + Pair tokens + Launchpad + Hook */}
      <div className="flex items-center gap-1.5 leading-tight flex-nowrap min-w-0">
        {resolvedChainExplorerUrl ? (
          <a
            href={resolvedChainExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center shrink-0 w-[15px] opacity-90 hover:opacity-100 hover:scale-115 transition-all cursor-pointer select-none"
            title={`View pool on ${chainName} Explorer`}
            aria-label={`View pool on ${chainName} Explorer`}
          >
            <ChainAvatar chainId={chainId} size={15} />
          </a>
        ) : (
          <span className="inline-flex items-center justify-center shrink-0 w-[15px] select-none">
            <ChainAvatar chainId={chainId} size={15} />
          </span>
        )}

        {/* Pair Avatar */}
        <div
          onClick={poolId ? handlePairAvatarClick : undefined}
          className={cn('shrink-0 select-none', poolId && 'cursor-pointer hover:opacity-80 transition-opacity')}
          title={poolId ? 'Click to copy pool address' : undefined}
        >
          <PairAvatar
            baseSymbol={baseSymbol}
            quoteSymbol={quoteSymbol}
            baseAddress={baseAddress || undefined}
            quoteAddress={quoteAddress || undefined}
            baseImg={baseImg}
            quoteImg={quoteImg}
            size="xs"
          />
        </div>

        {/* Pair tokens (Base / Quote) */}
        <div className="flex items-center gap-1 leading-tight min-w-0 truncate">
          {baseAddress ? (
            <button
              type="button"
              onClick={(e) => copyTokenCA(e, baseSymbol, baseAddress)}
              className="font-bold text-sm text-foreground hover:text-primary transition-colors cursor-pointer inline-flex items-center gap-0.5 group/t0 shrink-0"
              title={`Click to copy ${baseSymbol} contract address`}
            >
              <span className="group-hover/t0:underline underline-offset-2">{baseSymbol}</span>
              {copiedToken === baseSymbol && <Check className="size-2.5 text-emerald-500" />}
            </button>
          ) : (
            <span className="font-bold text-sm text-foreground shrink-0">{baseSymbol}</span>
          )}

          <span className="text-xs text-muted-foreground font-normal shrink-0">/</span>

          {quoteAddress ? (
            <button
              type="button"
              onClick={(e) => copyTokenCA(e, quoteSymbol, quoteAddress)}
              className="text-xs text-muted-foreground font-normal hover:text-primary transition-colors cursor-pointer inline-flex items-center gap-0.5 group/t1 shrink-0"
              title={`Click to copy ${quoteSymbol} contract address`}
            >
              <span className="group-hover/t1:underline underline-offset-2">{quoteSymbol}</span>
              {copiedToken === quoteSymbol && <Check className="size-2.5 text-emerald-500" />}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground font-normal shrink-0">{quoteSymbol}</span>
          )}

          {/* Launchpad Icon (sized to match token avatar size-4 / 16px) */}
          {launchpadMeta && (
            resolvedLaunchpadUrl ? (
              <a
                href={resolvedLaunchpadUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center shrink-0 opacity-85 hover:opacity-100 hover:scale-115 transition-all cursor-pointer select-none ml-0.5"
                title={`Launchpad: ${launchpadDisplayName}`}
                aria-label={`Launchpad: ${launchpadDisplayName}`}
              >
                <LaunchpadAvatar launchpad={launchpadDisplayName} size={16} />
              </a>
            ) : (
              <span className="inline-flex items-center justify-center shrink-0 ml-0.5 select-none">
                <LaunchpadAvatar launchpad={launchpadDisplayName} size={16} />
              </span>
            )
          )}

          {/* Hook icon (Discover: icon only, neutral style with yellow border, sized to match token avatar size-4 / 16px) */}
          {hasHook && (
            hookTooltip ? (
              <MetricTooltip content={hookTooltip} side="top">
                <span
                  className="inline-flex items-center justify-center size-4 rounded-full bg-muted/30 text-muted-foreground hover:text-foreground border border-amber-400/80 hover:border-amber-300 transition-all shrink-0 cursor-default shadow-2xs ml-0.5"
                  aria-label="Uniswap v4 Hook Enabled"
                >
                  <FishingHook className="size-2.5 text-amber-400/90" />
                </span>
              </MetricTooltip>
            ) : (
              <span
                className="inline-flex items-center justify-center size-4 rounded-full bg-muted/30 text-muted-foreground hover:text-foreground border border-amber-400/80 hover:border-amber-300 transition-all shrink-0 cursor-default shadow-2xs ml-0.5"
                aria-label="Uniswap v4 Hook Enabled"
              >
                <FishingHook className="size-2.5 text-amber-400/90" />
              </span>
            )
          )}
        </div>
      </div>

      {/* Row 2: Protocol Icon (under chain avatar) + Subcontent */}
      <div className="flex items-center gap-1.5 text-[11px] font-mono mt-1 leading-tight">
        {resolvedProtocolUrl ? (
          <a
            href={resolvedProtocolUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center shrink-0 w-[15px] opacity-85 hover:opacity-100 hover:scale-115 transition-all cursor-pointer select-none mb-0.5"
            title={`View on ${protocolMeta.name}`}
            aria-label={`View on ${protocolMeta.name}`}
          >
            <ProtocolAvatar protocol={protocolKey} size={14} />
          </a>
        ) : (
          <span className="inline-flex items-center justify-center shrink-0 w-[15px] select-none mb-0.5">
            <ProtocolAvatar protocol={protocolKey} size={14} />
          </span>
        )}

        {subContent}
      </div>
    </div>
  );
};

export interface PoolIdentityCellProps {
  pool: DiscoveredPool;
  onCopyPoolId?: (id: string) => void;
  isCopied?: boolean;
  rank?: number;
  movement?: unknown;
}

export const PoolIdentityCell: React.FC<PoolIdentityCellProps> = ({
  pool,
  onCopyPoolId,
}) => {
  const { poolIdentity } = pool;

  const chainId = pool.raw?.chainId || 4663;
  const chainExplorerUrl = getChainExplorerAddressUrl(pool.id, chainId);

  const protocolKey = poolIdentity.protocol || poolIdentity.dexId || 'uniswap';
  const chainSlug = resolveChainSlug(chainId);
  const protocolUrl =
    getProtocolPoolUrl(protocolKey, pool.id, chainId) ||
    `https://dexscreener.com/${chainSlug}/${pool.id}`;

  const launchpadMeta = getLaunchpadInfo(poolIdentity.launchpad);
  const launchpadUrl = launchpadMeta?.url || protocolUrl;

  const hookAddress = poolIdentity.hooks || pool.raw?.hooks || null;
  const hasHook = Boolean(
    poolIdentity.hasHook ?? (hookAddress && !/^0x0{40}$/i.test(hookAddress)),
  );

  const isDynamicFee =
    Boolean(poolIdentity.isDynamicFee) ||
    poolIdentity.feeTier === 0x800000 ||
    poolIdentity.feeTierFormatted === 'dyn' ||
    pool.raw?.fee === 0x800000 ||
    pool.raw?.effectiveFee === 0x800000 ||
    Boolean(pool.raw?.warnings?.includes('DYNAMIC_FEE')) ||
    Boolean(pool.raw?.labels?.includes('DYNAMIC_FEE')) ||
    (hasHook && (poolIdentity.feeTier === 0 || pool.raw?.fee === 0));

  const isRwa = Boolean(
    poolIdentity.launchpad?.toUpperCase() === 'RWA' ||
    poolIdentity.launchpad?.toUpperCase() === 'PAIR RWA' ||
    poolIdentity.tokenOrigin === 'rwa' ||
    pool.raw?.tokenOrigin === 'rwa' ||
    pool.raw?.launchpad?.toUpperCase() === 'RWA' ||
    pool.raw?.launchpad?.toUpperCase() === 'PAIR RWA' ||
    pool.raw?.launchpad === 'PAIR RWA' ||
    pool.raw?.labels?.includes('rwa') ||
    pool.raw?.labels?.includes('RWA') ||
    pool.raw?.token?.name?.includes('Robinhood Token') ||
    pool.raw?.token?.name?.includes('Trust • Robinhood') ||
    poolIdentity.token0.name?.includes('Robinhood Token') ||
    poolIdentity.token0.symbol?.toUpperCase().includes('RWA') ||
    poolIdentity.token1.symbol?.toUpperCase().includes('RWA'),
  );

  const protocolVersion = (
    poolIdentity.protocolVersion ||
    (pool.raw as any)?.protocolVersion ||
    (pool.raw as any)?.version ||
    ''
  ).toUpperCase();

  const tooltipContent = (
    <div className="space-y-1.5 min-w-[170px]">
      {protocolVersion && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary/70" /> Protocol Version
          </span>
          <span className="tabular font-medium font-mono text-foreground uppercase">
            {protocolVersion}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-muted-foreground/60" /> Fee Tier
        </span>
        <span className="tabular font-medium font-mono text-foreground">
          {poolIdentity.feeTierFormatted}
        </span>
      </div>
      {poolIdentity.tickSpacing !== null && poolIdentity.tickSpacing !== undefined && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/60" /> Tick Spacing
          </span>
          <span className="tabular font-medium font-mono text-foreground">
            {poolIdentity.tickSpacing}
          </span>
        </div>
      )}
      {poolIdentity.binStepPct !== undefined && poolIdentity.binStepPct !== null && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/60" /> Bin Step
          </span>
          <span className="tabular font-medium font-mono text-foreground">
            ±{poolIdentity.binStepPct.toFixed(2)}%
          </span>
        </div>
      )}
      {poolIdentity.currentTick !== null && poolIdentity.currentTick !== undefined && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary/70" /> Current Tick
          </span>
          <span className="tabular font-medium font-mono text-foreground">
            #{poolIdentity.currentTick}
          </span>
        </div>
      )}
      {isRwa && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-cyan-400/70" /> Asset Class
          </span>
          <span className="tabular font-medium font-mono text-cyan-400">
            Real World Asset (RWA)
          </span>
        </div>
      )}
    </div>
  );

  const spacingText =
    poolIdentity.tickSpacing !== null && poolIdentity.tickSpacing !== undefined
      ? String(poolIdentity.tickSpacing)
      : poolIdentity.binStepPct
        ? `±${poolIdentity.binStepPct.toFixed(2)}%`
        : '—';

  return (
    <StandardPairIdentity
      chainId={chainId}
      baseSymbol={poolIdentity.token0.symbol}
      quoteSymbol={poolIdentity.token1.symbol}
      baseAddress={poolIdentity.token0.address}
      quoteAddress={poolIdentity.token1.address}
      baseImg={poolIdentity.token0.logoUrl}
      quoteImg={poolIdentity.token1.logoUrl}
      protocol={protocolKey}
      protocolVersion={protocolVersion}
      poolId={pool.id}
      chainExplorerUrl={chainExplorerUrl}
      protocolUrl={protocolUrl}
      launchpad={poolIdentity.launchpad}
      launchpadUrl={launchpadUrl}
      hasHook={hasHook}
      hookTooltip={
        <div className="space-y-1 min-w-[175px] text-xs">
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <FishingHook className="size-3.5 text-amber-400 shrink-0" />
            <span>Uniswap v4 Hook Enabled</span>
          </div>
          {poolIdentity.launchpad && (
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <span>Launchpad:</span>
              <span className="font-mono text-foreground font-medium">{poolIdentity.launchpad}</span>
            </div>
          )}
          {hookAddress && (
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <span>Contract:</span>
              <span className="font-mono text-foreground font-medium">
                {`${hookAddress.slice(0, 6)}...${hookAddress.slice(-4)}`}
              </span>
            </div>
          )}
          {isDynamicFee && (
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <span>Fee:</span>
              <span className="text-foreground font-medium">Dynamic (0.00%)</span>
            </div>
          )}
        </div>
      }
      onCopyPoolId={onCopyPoolId}
      subContent={
        <MetricTooltip content={tooltipContent} side="right">
          <div className="flex items-center gap-1.5 hover:text-foreground/90 transition-colors">
            {/* Fee % */}
            <span className="font-semibold text-foreground tabular">
              {isDynamicFee ? '0.00%' : poolIdentity.feeTierFormatted}
            </span>

            {/* Bins / Tick spacing */}
            <span className="text-foreground/35">·</span>
            <span className="text-foreground/75">
              {spacingText}
            </span>

            {/* Protocol Version */}
            {protocolVersion && (
              <CellBadge>{protocolVersion}</CellBadge>
            )}

            {/* Dynamic label after protocol version */}
            {isDynamicFee && (
              <CellBadge>Dynamic</CellBadge>
            )}

            {/* RWA */}
            {isRwa && (
              <CellBadge>RWA</CellBadge>
            )}
          </div>
        </MetricTooltip>
      }
    />
  );
};

// -------------------------------------------------------------
// 2. POOL PRICE CELL (USD Price + Timeframe Change)
// -------------------------------------------------------------

export interface PriceCellProps {
  pool: DiscoveredPool;
}

export const PriceCell: React.FC<PriceCellProps> = ({ pool }) => {
  const { market } = pool;
  const hasUsd = market.priceUsd !== null && market.priceUsd !== undefined;
  const priceRaw = hasUsd ? market.priceUsd : (market.priceQuote ?? null);

  const ticker = useNumberTicker(
    priceRaw,
    (v) => {
      if (v === null || v === undefined) return '—';
      return hasUsd
        ? formatPriceUsd(v, market.priceQuote, market.quoteSymbol)
        : formatPriceUsd(null, v, market.quoteSymbol);
    },
    450
  );

  const pct = market.priceChangePct;
  const secondaryDisplay = pct !== null && pct !== undefined ? formatPctChange(pct) : '—';
  const secondaryTone = pct === null || pct === undefined || Math.abs(pct) < 0.005 ? 'neutral' : pct > 0 ? 'positive' : 'negative';

  const tooltipContent =
    market.priceQuote !== null && market.quoteSymbol ? (
      <div className="flex items-center justify-between gap-3 min-w-[150px] text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary/70" /> Quote Price
        </span>
        <span className="tabular font-medium font-mono text-foreground">
          {formatSubscriptPrice(market.priceQuote)} {market.quoteSymbol}
        </span>
      </div>
    ) : null;

  return (
    <MetricTooltip content={tooltipContent}>
      <PrimarySecondaryMetric
        primary={ticker.displayValue}
        secondary={secondaryDisplay}
        secondaryTone={secondaryTone}
        align="right"
        indicator={
          ticker.showIndicator && ticker.direction !== 'none'
            ? { direction: ticker.direction, key: ticker.indicatorKey }
            : null
        }
      />
    </MetricTooltip>
  );
};

// -------------------------------------------------------------
// 3. AGE CELL (Pool Age Top, Token Age Bottom)
// -------------------------------------------------------------

export interface AgeCellProps {
  pool: DiscoveredPool;
}

export const AgeCell: React.FC<AgeCellProps> = ({ pool }) => {
  const { market } = pool;
  const poolAge = formatCompactAge(market.poolAgeMs);
  const tokenAge = market.tokenAgeMs ? formatCompactAge(market.tokenAgeMs) : null;

  const hasDates = Boolean(market.poolAgeMs || market.tokenAgeMs);
  const tooltipContent = hasDates ? (
    <div className="space-y-1.5 min-w-[175px]">
      {market.poolAgeMs && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary/70" /> Pool Created
          </span>
          <span className="tabular font-medium font-mono text-foreground">
            {new Date(market.poolAgeMs).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      )}
      {market.tokenAgeMs && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/60" /> Token Created
          </span>
          <span className="tabular font-medium font-mono text-foreground">
            {new Date(market.tokenAgeMs).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <MetricTooltip content={tooltipContent}>
      <PrimarySecondaryMetric
        primary={poolAge}
        secondary={tokenAge ?? '—'}
        secondaryTone="muted"
        align="right"
      />
    </MetricTooltip>
  );
};

export const PoolAgeCell = AgeCell;

// -------------------------------------------------------------
// -------------------------------------------------------------
// 4. MARKET CAP CELL (MC)
// -------------------------------------------------------------

export interface MarketCapCellProps {
  pool: DiscoveredPool;
}

export const MarketCapCell: React.FC<MarketCapCellProps> = ({ pool }) => {
  const { market } = pool;
  const mcap = market.marketCap && market.marketCap > 0 ? market.marketCap : null;
  const fdv = market.fdv && market.fdv > 0 ? market.fdv : null;
  // Strict financial truth: column is Market Cap (circulating supply * price); never substitute FDV as market cap
  const rawMcap = mcap !== null ? mcap : null;

  const ticker = useNumberTicker(
    rawMcap,
    (v) =>
      v !== null && v !== undefined && v > 0
        ? compactUsd(v)
        : v === 0
          ? '$0'
          : '—',
    450
  );

  const pct = market.priceChangePct;
  const secondaryDisplay = pct !== null && pct !== undefined ? formatPctChange(pct) : '—';
  const secondaryTone = pct === null || pct === undefined || Math.abs(pct) < 0.005 ? 'neutral' : pct > 0 ? 'positive' : 'negative';

  const tooltipContent = (
    <div className="space-y-1 text-xs min-w-[150px]">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" /> Circ. MCap
        </span>
        <span className="tabular font-medium font-mono text-foreground">
          {mcap ? usd(mcap) : '— (Unknown)'}
        </span>
      </div>
      {fdv && (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary/70" /> FDV
          </span>
          <span className="tabular font-medium font-mono text-foreground">
            {usd(fdv)}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <MetricTooltip content={tooltipContent}>
      <PrimarySecondaryMetric
        primary={ticker.displayValue}
        secondary={secondaryDisplay}
        secondaryTone={secondaryTone}
        align="right"
        indicator={
          ticker.showIndicator && ticker.direction !== 'none'
            ? { direction: ticker.direction, key: ticker.indicatorKey }
            : null
        }
      />
    </MetricTooltip>
  );
};

// -------------------------------------------------------------
// 5. LIQUIDITY CELL (TVL + % Change)
// -------------------------------------------------------------

export interface LiquidityCellProps {
  pool: DiscoveredPool;
}

export const LiquidityCell: React.FC<LiquidityCellProps> = ({ pool }) => {
  const { liquidity } = pool;
  const rawTvl = liquidity.tvlUsd;

  const ticker = useNumberTicker(
    rawTvl,
    (v) =>
      v !== null && v !== undefined && v > 0
        ? compactUsd(v)
        : v === 0
          ? '$0'
          : '—',
    450
  );

  const pct = liquidity.tvlChangePct;
  const secondaryDisplay = pct !== null && pct !== undefined ? formatPctChange(pct) : '—';
  const secondaryTone = pct === null || pct === undefined || Math.abs(pct) < 0.005 ? 'neutral' : pct > 0 ? 'positive' : 'negative';

  const sourceLabel =
    liquidity.liquiditySource === 'coingecko'
      ? 'GeckoTerminal'
      : liquidity.liquiditySource === 'dexscreener'
        ? 'DexScreener'
        : liquidity.liquiditySource === 'onchain'
          ? 'On-chain RPC'
          : null;

  const hasTooltip = Boolean(sourceLabel || liquidity.activeLiquidityPercentage !== null || liquidity.activeTvlUsd !== null);
  const tooltipContent = hasTooltip ? (
    <div className="space-y-1.5 min-w-[165px]">
      {sourceLabel && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-blue-500" /> Source
          </span>
          <span className="tabular font-medium font-mono text-foreground">
            {sourceLabel}
          </span>
        </div>
      )}
      {liquidity.activeLiquidityPercentage !== null && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" /> In-Range Liq
          </span>
          <span className="tabular font-medium font-mono text-emerald-500">
            {liquidity.activeLiquidityPercentage.toFixed(1)}%
          </span>
        </div>
      )}
      {liquidity.activeTvlUsd !== null && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary/70" /> In-Range TVL
          </span>
          <span className="tabular font-medium font-mono text-foreground">
            {usd(liquidity.activeTvlUsd)}
          </span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <MetricTooltip content={tooltipContent}>
      <PrimarySecondaryMetric
        primary={ticker.displayValue}
        secondary={secondaryDisplay}
        secondaryTone={secondaryTone}
        align="right"
        indicator={
          ticker.showIndicator && ticker.direction !== 'none'
            ? { direction: ticker.direction, key: ticker.indicatorKey }
            : null
        }
      />
    </MetricTooltip>
  );
};

// -------------------------------------------------------------
// 6. VOLUME CELL (Volume + % Change Momentum)
// -------------------------------------------------------------

export interface VolumeCellProps {
  pool: DiscoveredPool;
}

export const VolumeCell: React.FC<VolumeCellProps> = ({ pool }) => {
  const { activity } = pool;
  const rawVol = activity.volumeUsd;

  const ticker = useNumberTicker(
    rawVol,
    (v) =>
      v !== null && v !== undefined && v > 0
        ? compactUsd(v)
        : v === 0
          ? '$0'
          : '—',
    450
  );

  const pct = activity.volumeChangePct;
  const secondaryDisplay = pct !== null && pct !== undefined ? formatPctChange(pct) : '—';
  const secondaryTone = pct === null || pct === undefined || Math.abs(pct) < 0.005 ? 'neutral' : pct > 0 ? 'positive' : 'negative';

  const hasExtraActivity = activity.volumeToTvl !== null || activity.swapsCount !== null;
  const tooltipContent = hasExtraActivity ? (
    <div className="space-y-1.5 min-w-[165px]">
      {activity.volumeToTvl !== null && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary/70" /> Turnover
          </span>
          <span className="tabular font-medium font-mono text-foreground">
            {formatTurnoverRatio(activity.volumeToTvl)}
          </span>
        </div>
      )}
      {activity.swapsCount !== null && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/60" /> Trades
          </span>
          <span className="tabular font-medium font-mono text-foreground">
            <span className="text-emerald-500 font-semibold">{activity.buysCount ?? 0}B</span>
            <span className="text-muted-foreground/40 mx-1">·</span>
            <span className="text-rose-500 font-semibold">{activity.sellsCount ?? 0}S</span>
          </span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <MetricTooltip content={tooltipContent}>
      <PrimarySecondaryMetric
        primary={ticker.displayValue}
        secondary={secondaryDisplay}
        secondaryTone={secondaryTone}
        align="right"
        indicator={
          ticker.showIndicator && ticker.direction !== 'none'
            ? { direction: ticker.direction, key: ticker.indicatorKey }
            : null
        }
      />
    </MetricTooltip>
  );
};

// -------------------------------------------------------------
// 7. FEES CELL (Fee Revenue + Estimated Annualized APR)
// -------------------------------------------------------------

export interface FeesCellProps {
  pool: DiscoveredPool;
}

export const FeesCell: React.FC<FeesCellProps> = ({ pool }) => {
  const { yield: poolYield, market } = pool;
  const rawFees = poolYield.feeRevenueUsd;

  const ticker = useNumberTicker(
    rawFees,
    (v) =>
      v !== null && v !== undefined && v > 0
        ? compactUsd(v)
        : v === 0
          ? '$0'
          : '—',
    450
  );

  const apr = poolYield.estimatedApr;
  const secondaryDisplay = formatApr(apr);

  // Subtle restrained green for positive APR - avoids neon or overly celebratory styling
  const secondaryTone = apr !== null && apr > 0 ? 'positive' : 'neutral';

  const tooltipContent = (
    <div className="flex items-center gap-2 text-xs text-muted-foreground leading-snug max-w-[220px]">
      <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
      <span>Gross pool fee revenue annualized from {market.timeframe} volume relative to TVL. Excludes dynamic hook logic, distributor splits, and LP concentration.</span>
    </div>
  );

  return (
    <MetricTooltip content={tooltipContent}>
      <PrimarySecondaryMetric
        primary={ticker.displayValue}
        secondary={secondaryDisplay}
        secondaryTone={secondaryTone}
        secondaryClassName="text-up/90 font-normal"
        align="right"
        indicator={
          ticker.showIndicator && ticker.direction !== 'none'
            ? { direction: ticker.direction, key: ticker.indicatorKey }
            : null
        }
      />
    </MetricTooltip>
  );
};

// -------------------------------------------------------------
// 8. ACTION CELL (Deposit Button Only)
// -------------------------------------------------------------

export interface ActionCellProps {
  pool: DiscoveredPool;
}

export const ActionCell: React.FC<ActionCellProps> = ({ pool }) => {
  const p = pool.raw;
  const href = poolWorkstationHref(p);

  return (
    <div className="flex items-center justify-end">
      <Button
        size="sm"
        asChild
        className="h-8 px-3 text-xs shadow-xs font-semibold cursor-pointer"
        onMouseEnter={() => {
          cachePoolForWorkstation(p);
          prewarmPoolHistory(p, '5m');
        }}
      >
        <Link
          href={href}
          onClick={() => {
            cachePoolForWorkstation(p);
            prewarmPoolHistory(p, '5m');
          }}
          prefetch={false}
        >
          Deposit
        </Link>
      </Button>
    </div>
  );
};

// -------------------------------------------------------------
// OPTIONAL COLUMNS (For Configurable Column Selector)
// -------------------------------------------------------------

export const SpacingTickCell: React.FC<{ pool: DiscoveredPool }> = ({ pool }) => {
  const { poolIdentity } = pool;
  const spacingDisplay = poolIdentity.tickSpacing
    ? `${poolIdentity.tickSpacing} ticks`
    : poolIdentity.binStepPct
      ? `±${poolIdentity.binStepPct.toFixed(2)}%`
      : '—';
  const tickDisplay = poolIdentity.currentTick !== null ? `#${poolIdentity.currentTick}` : '—';

  return (
    <PrimarySecondaryMetric
      primary={spacingDisplay}
      secondary={tickDisplay}
      secondaryTone="neutral"
      align="right"
    />
  );
};

export const ProtocolCell: React.FC<{ pool: DiscoveredPool }> = ({ pool }) => {
  const { poolIdentity } = pool;
  return (
    <div className="flex items-center justify-end gap-1.5 text-xs font-mono">
      <ProtocolAvatar protocol={poolIdentity.protocol} size={14} />
      <span className="capitalize text-foreground font-medium">{poolIdentity.protocol}</span>
      <Badge variant="outline" className="text-[10px] px-1 py-0 uppercase">
        {poolIdentity.protocolVersion}
      </Badge>
    </div>
  );
};

export const QuotePriceCell: React.FC<{ pool: DiscoveredPool }> = ({ pool }) => {
  const { market } = pool;
  const rawPrice = market.priceUsd ?? market.priceQuote;
  const ticker = useNumberTicker(
    rawPrice,
    (v) =>
      v !== null && v !== undefined
        ? `$${formatSubscriptPrice(v)}`
        : '—',
    450
  );

  return (
    <PrimarySecondaryMetric
      primary={ticker.displayValue}
      secondary={
        market.priceQuote !== null && market.quoteSymbol && market.priceQuote !== market.priceUsd
          ? `${formatSubscriptPrice(market.priceQuote)} ${market.quoteSymbol}`
          : undefined
      }
      secondaryTone="muted"
      align="right"
      indicator={
        ticker.showIndicator && ticker.direction !== 'none'
          ? { direction: ticker.direction, key: ticker.indicatorKey }
          : null
      }
    />
  );
};
