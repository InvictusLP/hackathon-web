'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { getCachedPoolForWorkstation, parseWorkstationPath } from '@/lib/pool-cache';

export const ROUTE_PAGE_NAMES: Record<string, string> = {
  '/': 'Overview',
  '/portfolio': 'Portfolio',
  '/liquidity': 'Liquidity',
  '/discover': 'Discover',
  '/pools': 'Discover',
  '/referral': 'Referral',
  '/settings': 'Settings',
  '/admin': 'Admin',
};

export function getActivePageName(pathname: string): string {
  if (!pathname) return 'Discover';
  const normalized = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');

  if (
    normalized === '/open' ||
    normalized.startsWith('/pool/') ||
    normalized.startsWith('/pools/') ||
    normalized.startsWith('/discover/')
  ) {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const sym = sp.get('symbol');
      const q = sp.get('quote') || '';
      if (sym) return q ? `${sym} / ${q}` : sym;
    }

    const pathInfo = parseWorkstationPath(normalized);
    if (pathInfo.poolId) {
      const cached = getCachedPoolForWorkstation(pathInfo.poolId, pathInfo.chain);
      const tokenSym = cached?.token?.symbol;
      const quoteSym = cached?.quote?.symbol;
      if (tokenSym && quoteSym) return `${tokenSym} / ${quoteSym}`;
      if (tokenSym) return tokenSym;
    }
    return '';
  }

  if (ROUTE_PAGE_NAMES[normalized]) {
    return ROUTE_PAGE_NAMES[normalized];
  }

  if (normalized.startsWith('/admin')) {
    return 'Admin Console';
  }

  if (normalized.startsWith('/portfolio')) {
    return 'Portfolio';
  }

  if (normalized.startsWith('/liquidity') || normalized.startsWith('/positions')) {
    return 'Liquidity';
  }

  if (normalized.startsWith('/discover') || normalized.startsWith('/pools')) {
    return 'Discover';
  }

  const clean = normalized.replace(/^\/+|\/+$/g, '');
  if (!clean) return 'Discover';
  const first = clean.split('/')[0];
  if (!first) return 'Discover';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/**
 * Isolated leaf component that synchronizes document.title with route changes
 * and pool metadata events without triggering re-renders in parent or sibling components.
 */
export function PageTitleSync() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const defaultName = getActivePageName(pathname);
    if (defaultName) {
      document.title = `${defaultName} | Invictus`;
    }
  }, [pathname]);

  useEffect(() => {
    const handleMeta = (e: Event) => {
      const detail = (e as CustomEvent<{ symbol: string; quote: string }>).detail;
      if (detail?.symbol && typeof document !== 'undefined') {
        const quote = detail.quote || '';
        document.title = quote
          ? `${detail.symbol} / ${quote} | Invictus`
          : `${detail.symbol} | Invictus`;
      }
    };
    window.addEventListener('invictus:pool-meta', handleMeta);
    return () => window.removeEventListener('invictus:pool-meta', handleMeta);
  }, []);

  return null;
}

/**
 * Lightweight provider that renders PageTitleSync without wrapping state around children.
 */
export function PageTitleProvider({ children }: { children?: ReactNode }) {
  return (
    <>
      <PageTitleSync />
      {children}
    </>
  );
}

export function usePageTitle(overrideTitle?: string) {
  const pathname = usePathname();

  useEffect(() => {
    if (overrideTitle && typeof document !== 'undefined') {
      document.title = `${overrideTitle} | Invictus`;
    }
  }, [overrideTitle]);

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        const defaultName = getActivePageName(pathname);
        if (defaultName) {
          document.title = `${defaultName} | Invictus`;
        }
      }
    };
  }, [pathname]);

  return overrideTitle || getActivePageName(pathname);
}
