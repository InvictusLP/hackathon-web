'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export interface LaunchpadInfo {
  name: string;
  iconUrl: string;
  url?: string;
}

export const CANONICAL_LAUNCHPADS: Record<string, LaunchpadInfo> = {
  pons: { name: 'Pons', iconUrl: '/launchpads/pons.png', url: 'https://ponsfamily.com' },
  pair: { name: 'PAIR RWA', iconUrl: '/launchpads/pair.png', url: 'https://pair.fund' },
  'pools.trade': { name: 'pools.trade', iconUrl: '/launchpads/poolstrade.png', url: 'https://pools.trade' },
  'pools.fun': { name: 'pools.fun', iconUrl: '/launchpads/poolsfun.png', url: 'https://pools.fun' },
  flap: { name: 'Flap', iconUrl: '/launchpads/flap.png', url: 'https://flap.sh' },
  o1: { name: 'o1', iconUrl: '/launchpads/o1.ico', url: 'https://o1.exchange' },
  virtuals: { name: 'Virtuals', iconUrl: '/launchpads/virtuals.webp', url: 'https://virtuals.io' },
  clanker: { name: 'Clanker', iconUrl: '/launchpads/clanker.webp', url: 'https://clanker.world' },
  hoodit: { name: 'Hoodit', iconUrl: '/launchpads/hoodit.ico', url: 'https://hoodit.xyz' },
  mintclub: { name: 'Mint Club', iconUrl: '/launchpads/mintclub.webp', url: 'https://mint.club' },
  pumpswap: { name: 'PumpSwap', iconUrl: '/dexes/pumpswap.png', url: 'https://pump.fun' },
};

const LAUNCHPAD_ALIASES: Record<string, string> = {
  'pons v1': 'pons',
  'pons v2': 'pons',
  rwa: 'pair',
  'pair rwa': 'pair',
  poolstrade: 'pools.trade',
  poolsfun: 'pools.fun',
  flapsh: 'flap',
};

export const LAUNCHPAD_MAP: Record<string, LaunchpadInfo> = {
  ...CANONICAL_LAUNCHPADS,
  ...Object.fromEntries(
    Object.entries(LAUNCHPAD_ALIASES).map(([alias, canonical]) => [alias, CANONICAL_LAUNCHPADS[canonical]!]),
  ),
};

export function getLaunchpadDomain(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

export function getLaunchpadInfo(rawLaunchpad?: string | null): LaunchpadInfo | null {
  if (!rawLaunchpad) return null;
  const rawTrimmed = rawLaunchpad.trim();
  const key = rawTrimmed.toLowerCase();
  const matched = LAUNCHPAD_MAP[key];
  if (matched) {
    return {
      ...matched,
      name: rawTrimmed.toUpperCase() === 'PAIR RWA' ? rawTrimmed : (rawTrimmed.toUpperCase() === 'RWA' ? rawTrimmed : matched.name),
    };
  }
  return {
    name: rawTrimmed,
    iconUrl: '/images/unknown.png',
    url: undefined,
  };
}

export interface LaunchpadAvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  launchpad?: string | null;
  size?: number;
  className?: string;
}

export const LaunchpadAvatar: React.FC<LaunchpadAvatarProps> = ({
  launchpad,
  size = 16,
  className,
  ...props
}) => {
  const [tier, setTier] = useState<number>(0);
  const [failed, setFailed] = useState(false);
  const info = getLaunchpadInfo(launchpad);

  React.useEffect(() => {
    setTier(0);
    setFailed(false);
  }, [launchpad]);

  if (!info) return null;

  const domain = getLaunchpadDomain(info.url);

  // Tier 0: Local static asset from info.iconUrl (if not /images/unknown.png)
  // Tier 1: Google Favicon CDN (64px) derived from project canonical domain
  // Tier 2: DuckDuckGo Favicon CDN backup
  // Fallback: /images/unknown.png
  const candidateUrls: string[] = [];
  if (info.iconUrl && info.iconUrl !== '/images/unknown.png') {
    candidateUrls.push(info.iconUrl);
  }
  if (domain) {
    candidateUrls.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`);
    candidateUrls.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
  }

  const currentSrc = candidateUrls[tier];

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
          onError={() => {
            if (tier < candidateUrls.length - 1) {
              setTier((t) => t + 1);
            } else {
              setFailed(true);
            }
          }}
          className="size-full object-contain rounded-full"
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center shrink-0 overflow-hidden rounded-full select-none',
        className,
      )}
      style={{ width: size, height: size }}
      {...props}
    >
      <img
        src="/images/unknown.png"
        alt={info.name || 'Unknown Launchpad'}
        width={size}
        height={size}
        className="size-full object-contain rounded-full select-none shrink-0 pointer-events-none"
        aria-hidden="true"
      />
    </span>
  );
};
