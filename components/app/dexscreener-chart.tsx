'use client';

import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface DexscreenerPositionRange {
  low?: number;
  high?: number;
  priceLower: number;
  priceUpper: number;
  color?: string;
  label?: string;
  inRange?: boolean;
  tokenId?: number | string;
  valueUsd?: number;
}

export interface DexscreenerChartProps {
  poolId: string;
  chainSlug?: string;
  className?: string;
  /** Optional interactive range props preserved for backwards compatibility */
  rangeLow?: number;
  rangeHigh?: number;
  spotPrice?: number;
  quoteSymbol?: string;
  tokenSymbol?: string;
  owned?: DexscreenerPositionRange[] | null;
  onDragEdge?: (edge: 'min' | 'max', price: number) => void;
  onAdoptRange?: (low: number, high: number) => void;
  onPreset?: (preset: 'dip' | 'both' | 'profit' | 'full') => void;
}

export const DexscreenerChart = ({
  poolId,
  chainSlug = 'robinhood',
  className,
}: DexscreenerChartProps) => {
  const [loading, setLoading] = useState(true);

  const cleanPoolId = poolId?.trim().toLowerCase() || '';
  // DexScreener embed URL with left drawing toolbar enabled, timeframe toolbar enabled, and drawing persistence
  const embedUrl = cleanPoolId
    ? `https://dexscreener.com/${chainSlug}/${cleanPoolId}?embed=1&theme=dark&trades=0&info=0&chartLeftToolbar=1&chartTimeframesToolbar=1&chartSaveDrawings=1`
    : '';

  useEffect(() => {
    setLoading(true);
  }, [cleanPoolId, chainSlug]);

  if (!cleanPoolId) {
    return (
      <div className={cn('h-full w-full flex flex-col items-center justify-center p-6 text-center select-none', className)}>
        <p className="text-sm text-muted-foreground">No pool selected</p>
      </div>
    );
  }

  return (
    <div className={cn('relative w-full h-full min-h-0 bg-background overflow-hidden select-none', className)}>
      {/* Loading Skeleton */}
      {loading && (
        <div className="absolute inset-0 z-10 p-4 flex flex-col justify-between bg-card/80 backdrop-blur-xs animate-pulse select-none">
          <div className="flex justify-between items-center">
            <Skeleton className="h-5 w-32 rounded" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-12 rounded" />
              <Skeleton className="h-5 w-12 rounded" />
              <Skeleton className="h-5 w-12 rounded" />
            </div>
          </div>
          <div className="space-y-4 py-8">
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-px w-full" />
          </div>
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-4 w-20 rounded" />
          </div>
        </div>
      )}

      {/* 
        Native TradingView DexScreener Chart Iframe:
        Height extends by 42px inside an overflow-hidden wrapper so the "Tracked by DEX Screener"
        footer bar (height: 38px) is pushed outside and clipped away completely.
      */}
      <iframe
        src={embedUrl}
        title={`DexScreener TradingView Chart - ${cleanPoolId}`}
        className="absolute top-0 left-0 w-full h-[calc(100%+42px)] border-0"
        onLoad={() => setLoading(false)}
        allow="clipboard-write; fullscreen"
        allowFullScreen
      />
    </div>
  );
};
