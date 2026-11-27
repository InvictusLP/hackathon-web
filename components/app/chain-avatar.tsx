'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export interface ChainAvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  chainId?: number | string | null;
  size?: number;
  className?: string;
}

interface ChainInfo {
  name: string;
  icon: string;
  slug?: string;
}

const CHAIN_SLUGS: Record<string, ChainInfo> = {
  '4663': { name: 'Robinhood Chain', icon: '/chains/robinhood.png', slug: 'robinhood' },
  'robinhood': { name: 'Robinhood Chain', icon: '/chains/robinhood.png', slug: 'robinhood' },
  '5042': { name: 'Arc Network', icon: '/chains/arc.png', slug: 'arc' },
  'arc': { name: 'Arc Network', icon: '/chains/arc.png', slug: 'arc' },
  '1': { name: 'Ethereum', icon: '/chains/ethereum.png', slug: 'ethereum' },
  'ethereum': { name: 'Ethereum', icon: '/chains/ethereum.png', slug: 'ethereum' },
  'solana': { name: 'Solana', icon: '/chains/solana.png', slug: 'solana' },
  '42161': { name: 'Arbitrum', icon: '/chains/arbitrum.png', slug: 'arbitrum' },
  'arbitrum': { name: 'Arbitrum', icon: '/chains/arbitrum.png', slug: 'arbitrum' },
  '8453': { name: 'Base', icon: '/chains/base.png', slug: 'base' },
  'base': { name: 'Base', icon: '/chains/base.png', slug: 'base' },
  '56': { name: 'BNB Chain', icon: '/chains/bsc.png', slug: 'bsc' },
  'bsc': { name: 'BNB Chain', icon: '/chains/bsc.png', slug: 'bsc' },
  'bnb': { name: 'BNB Chain', icon: '/chains/bsc.png', slug: 'bnb' },
  '137': { name: 'Polygon', icon: '/chains/polygon.png', slug: 'polygon' },
  'polygon': { name: 'Polygon', icon: '/chains/polygon.png', slug: 'polygon' },
  '10': { name: 'Optimism', icon: '/chains/optimism.png', slug: 'optimism' },
  'optimism': { name: 'Optimism', icon: '/chains/optimism.png', slug: 'optimism' },
  '43114': { name: 'Avalanche', icon: '/chains/avalanche.png', slug: 'avalanche' },
  'avalanche': { name: 'Avalanche', icon: '/chains/avalanche.png', slug: 'avalanche' },
};

/** Display name for a chain id or slug, or null when it is unknown or missing. */
export const chainNameOf = (id?: number | string | null): string | null =>
  id === null || id === undefined || id === '' ? null : (CHAIN_SLUGS[String(id).toLowerCase()]?.name ?? null);

export const ChainAvatar: React.FC<ChainAvatarProps> = ({
  chainId = 4663,
  size = 14,
  className,
  ...props
}) => {
  const [failed, setFailed] = useState(false);
  const key = String(chainId || '4663').toLowerCase();
  const info: ChainInfo = CHAIN_SLUGS[key] || { name: 'Chain', icon: `/chains/${key}.png`, slug: key };

  React.useEffect(() => {
    setFailed(false);
  }, [chainId]);

  // Use only local public/chains/*.png (fallback to /images/unknown.png on error)
  const currentSrc = info.icon;

  if (!failed && currentSrc) {
    return (
      <span
        className={cn('inline-flex items-center justify-center shrink-0 overflow-hidden rounded-full', className)}
        style={{ width: size, height: size }}
        {...props}
      >
        <img
          src={currentSrc}
          alt={info.name}
          width={size}
          height={size}
          onError={() => setFailed(true)}
          className="size-full object-contain rounded-full"
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden select-none',
        className,
      )}
      style={{ width: size, height: size }}
      {...props}
    >
      <img
        src="/images/unknown.png"
        alt={info.name || 'Unknown Chain'}
        width={size}
        height={size}
        className="size-full object-contain rounded-full select-none shrink-0 pointer-events-none"
        aria-hidden="true"
      />
    </span>
  );
};
