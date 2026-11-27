'use client';

import { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  getCachedTokenLogo,
  useTokenLogo,
  getCoinMarketCapLogoUrl,
  getDexScreenerLogoUrl,
  findTokenFromList,
} from '@/lib/tokens';

export interface TokenAvatarProps {
  symbol?: string;
  address?: string | null;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  bordered?: boolean;
  className?: string;
}

/**
 * Canonical Unknown Token fallback icon using public/images/unknown.png.
 */
export const UnknownTokenIcon = ({ className }: { className?: string }) => (
  <img
    src="/images/unknown.png"
    alt="Unknown token"
    className={cn('size-full object-contain rounded-full select-none shrink-0 pointer-events-none', className)}
    aria-hidden="true"
  />
);

export const TokenAvatar = ({
  symbol,
  address,
  src,
  size = 'md',
  bordered = false,
  className,
}: TokenAvatarProps) => {
  const cleanSymbol = (symbol?.includes('/') ? symbol.split('/')[0] : symbol)?.trim();
  const cached = getCachedTokenLogo(address, cleanSymbol);
  const hookLogo = useTokenLogo(address, cleanSymbol);
  const cmcLogo = getCoinMarketCapLogoUrl(address) || (cleanSymbol ? getCoinMarketCapLogoUrl(cleanSymbol) : null);
  const dsLogo = getDexScreenerLogoUrl(address);

  // Strict Resolution Hierarchy:
  // 1. Explicit prop src (if provided and valid)
  // 2. CoinGecko (curated tokenlist logoURI / local static)
  // 3. CoinMarketCap (authentic CDN)
  // 4. DexScreener (dynamic hook logo or dd.dexscreener.com)
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (src && src !== '/images/unknown.png') list.push(src);
    if (cached && cached !== '/images/unknown.png' && !list.includes(cached)) list.push(cached);
    if (cmcLogo && !list.includes(cmcLogo)) list.push(cmcLogo);
    if (hookLogo && hookLogo !== '/images/unknown.png' && !list.includes(hookLogo)) list.push(hookLogo);
    if (dsLogo && !list.includes(dsLogo)) list.push(dsLogo);
    return list;
  }, [src, cached, cmcLogo, hookLogo, dsLogo]);

  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [address, cleanSymbol, src, hookLogo]);

  const currentSrc = candidates[candidateIndex] || null;

  const sizeClasses = {
    xs: 'size-4',
    sm: 'size-5',
    md: 'size-6',
    lg: 'size-8',
  }[size];

  return (
    <div
      className={cn(
        'relative shrink-0 rounded-full overflow-hidden flex items-center justify-center select-none bg-muted/30',
        bordered && 'border border-border/40 shadow-2xs',
        sizeClasses,
        className,
      )}
    >
      {currentSrc && candidateIndex < candidates.length ? (
        <img
          src={currentSrc}
          alt={cleanSymbol ?? 'Token'}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-full object-cover rounded-full select-none pointer-events-none"
          onError={() => {
            if (candidateIndex < candidates.length - 1) {
              setCandidateIndex((i) => i + 1);
            } else {
              setCandidateIndex(candidates.length);
            }
          }}
        />
      ) : (
        <UnknownTokenIcon />
      )}
    </div>
  );
};

export interface PairAvatarProps {
  baseSymbol: string;
  quoteSymbol: string;
  baseAddress?: string | null;
  quoteAddress?: string | null;
  baseImg?: string | null;
  quoteImg?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  overlap?: 'none' | 'subtle' | 'compact';
  className?: string;
}

export const PairAvatar = ({
  baseSymbol,
  quoteSymbol,
  baseAddress,
  quoteAddress,
  baseImg,
  quoteImg,
  size = 'md',
  overlap = 'subtle',
  className,
}: PairAvatarProps) => {
  const cleanBase = (baseSymbol?.includes('/') ? baseSymbol.split('/')[0] : baseSymbol)?.trim();
  const cleanQuote = (quoteSymbol?.includes('/') ? quoteSymbol.split('/')[1] || quoteSymbol : quoteSymbol)?.trim();

  const resolvedBaseAddress =
    baseAddress || (cleanBase ? findTokenFromList(cleanBase)?.address : undefined);

  const resolvedQuoteAddress =
    quoteAddress || (cleanQuote ? findTokenFromList(cleanQuote)?.address : undefined);

  const overlapClasses =
    overlap === 'none'
      ? 'ml-1'
      : overlap === 'compact'
      ? {
          xs: '-ml-1.5',
          sm: '-ml-2',
          md: '-ml-2.5',
          lg: '-ml-3',
        }[size]
      : {
          xs: '-ml-1',
          sm: '-ml-1',
          md: '-ml-1.5',
          lg: '-ml-2',
        }[size];

  return (
    <div className={cn('flex items-center shrink-0 select-none', className)}>
      <TokenAvatar
        key={`base-${cleanBase}-${resolvedBaseAddress}-${baseImg}`}
        symbol={cleanBase}
        address={resolvedBaseAddress}
        src={baseImg}
        size={size}
        bordered={false}
        className="relative z-10 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.22)]"
      />
      <TokenAvatar
        key={`quote-${cleanQuote}-${resolvedQuoteAddress}-${quoteImg}`}
        symbol={cleanQuote}
        address={resolvedQuoteAddress}
        src={quoteImg}
        size={size}
        bordered={false}
        className={cn('relative z-0 shrink-0', overlapClasses)}
      />
    </div>
  );
};
