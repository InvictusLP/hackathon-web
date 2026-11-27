'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

const ROUTES: Record<string, { group: string; label: string }> = {
  '/': { group: 'Dashboard', label: 'Overview' },
  '/portfolio': { group: 'Portfolio', label: 'Overview' },
  '/discover': { group: 'Discover', label: 'Pools' },
  '/liquidity': { group: 'Liquidity', label: 'Overview' },
  '/open': { group: 'Discover', label: 'Deploy Position' },
  '/referral': { group: 'Account', label: 'Referral' },
  '/settings': { group: 'Account', label: 'Settings' },
  '/admin': { group: 'Operator', label: 'Console' },
};

function BreadcrumbContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [overrideSymbol, setOverrideSymbol] = useState<string | null>(null);
  const [overrideQuote, setOverrideQuote] = useState<string | null>(null);

  useEffect(() => {
    const handleMeta = (e: Event) => {
      const detail = (e as CustomEvent<{ symbol: string; quote: string }>).detail;
      if (detail?.symbol) {
        setOverrideSymbol(detail.symbol);
        if (detail.quote) setOverrideQuote(detail.quote);
      }
    };
    window.addEventListener('invictus:pool-meta', handleMeta);
    return () => window.removeEventListener('invictus:pool-meta', handleMeta);
  }, []);

  const isPoolRoute =
    pathname === '/open' ||
    pathname.startsWith('/pool') ||
    pathname.startsWith('/pools') ||
    pathname.startsWith('/discover');
  const poolSymbol = searchParams.get('symbol') || overrideSymbol || null;
  const poolQuote = searchParams.get('quote') || overrideQuote || null;

  if (isPoolRoute && poolSymbol) {
    return (
      <Breadcrumb className="hidden sm:flex">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/discover" className="text-[15px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                Discover
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/discover" className="text-[15px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                Pools
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-[15px] font-semibold text-foreground tracking-tight">
              {poolQuote ? `${poolSymbol} / ${poolQuote}` : poolSymbol}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  let current = ROUTES[pathname];
  if (!current) {
    if (pathname.startsWith('/pool/') || pathname.startsWith('/pools/') || pathname.startsWith('/discover/')) {
      current = { group: 'Discover', label: 'Deploy Position' };
    } else if (pathname.startsWith('/positions/') || pathname.startsWith('/liquidity/')) {
      current = { group: 'Manage', label: 'Position Detail' };
    } else if (pathname.startsWith('/admin/')) {
      current = { group: 'Operator', label: 'Admin Detail' };
    } else {
      current = { group: 'Dashboard', label: 'Overview' };
    }
  }

  return (
    <Breadcrumb className="hidden sm:flex">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/" className="text-[15px] font-medium text-muted-foreground hover:text-foreground transition-colors">
              {current.group}
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage className="text-[15px] font-medium text-foreground">
            {current.label}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function DynamicBreadcrumb() {
  return (
    <Suspense fallback={<div className="h-5 w-32" />}>
      <BreadcrumbContent />
    </Suspense>
  );
}
