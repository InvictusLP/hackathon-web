'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import type { GasNow, Snapshot } from '@/lib/types';
import { useSession } from './session';
import { fetchStore } from '@/lib/fetch-store';
import { fetchDirectoryPage } from '@/lib/pool-directory';
import dynamic from 'next/dynamic';
import PoolsPage from '@/app/pools/page';
import { PositionsTab } from '@/components/app/tabs/positions-tab';
import { PortfolioShell } from '@/components/app/portfolio-shell';
import ReferralPage from '@/app/referral/page';

const SearchDialog = dynamic(
  () => import('./search-dialog').then((m) => m.SearchDialog),
  { ssr: false },
);
import { NotificationMenu } from './notification-menu';
import { UserProfileMenu } from './user-profile-menu';
import { BottomBar } from './bottom-bar';
import { DefiWalletPill, QuickTradingSettings } from './defi-topbar';
import { NetworkSwitcher } from './network-switcher';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useBlockExplorer } from '@/lib/explorer';
import { useRunningJobs } from './live';
import { cn } from '@/lib/utils';

interface NavLink {
  href: string;
  label: string;
}

const NAV_LINKS: NavLink[] = [
  { href: '/discover', label: 'Discover' },
  { href: '/liquidity', label: 'Liquidity' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/referral', label: 'Referral' },
];

const TopBarActiveTx = () => {
  const runningJobs = useRunningJobs();
  const { formatUrl } = useBlockExplorer();
  if (runningJobs.length === 0) return null;

  const count = runningJobs.length;
  const latest = runningJobs[0]?.latestStep;

  const handleClick = () => {
    if (latest?.hash) {
      window.open(formatUrl(`/tx/${latest.hash}`), '_blank', 'noopener,noreferrer');
    } else {
      toast.info(latest?.label || `${count} transaction${count > 1 ? 's' : ''} in progress…`, { id: 'active-tx-info' });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={latest?.hash ? `Tx: ${latest.hash} (click to view)` : `${count} pending transaction${count > 1 ? 's' : ''} (click to check)`}
      className="group flex h-8 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 text-xs font-medium text-primary ring-1 ring-foreground/5 shadow-2xs hover:bg-primary/20 hover:border-primary/60 transition-all outline-none select-none cursor-pointer"
    >
      <Loader2 className="size-3.5 animate-spin shrink-0 text-primary" />
      <span className="tabular font-mono text-[11px] hidden sm:inline">
        {count} {count > 1 ? 'txs' : 'tx'} pending
      </span>
      <span className="tabular font-mono text-[11px] sm:hidden">
        {count}
      </span>
    </button>
  );
};

type MainTab = 'discover' | 'liquidity' | 'portfolio' | 'referral';

const getMainTab = (path: string): MainTab | null => {
  if (path === '/' || path === '/discover' || path === '/pools' || (path.startsWith('/discover') && path !== '/open')) {
    return 'discover';
  }
  if (path === '/liquidity' || path.startsWith('/liquidity')) {
    return 'liquidity';
  }
  if (path === '/portfolio' || path.startsWith('/portfolio')) {
    return 'portfolio';
  }
  if (path === '/referral' || path.startsWith('/referral')) {
    return 'referral';
  }
  return null;
};

export const Shell = ({
  children,
  gas,
  connected,
  snap,
}: {
  children: ReactNode;
  gas: GasNow | null;
  connected: boolean;
  snap: Snapshot | null;
}) => {
  const { me } = useSession();
  const pathname = usePathname() || '/discover';
  const isWorkstation =
    pathname === '/open' ||
    pathname.startsWith('/open') ||
    pathname.startsWith('/pool/') ||
    pathname.startsWith('/pools/');

  const isDiscover =
    pathname === '/discover' ||
    pathname === '/pools' ||
    pathname === '/' ||
    (pathname.startsWith('/discover') && pathname !== '/open');

  const isLiquidity =
    pathname === '/liquidity' ||
    pathname.startsWith('/liquidity');

  const activeAddress = snap?.wallet?.address ?? null;

  const currentMainTab = getMainTab(pathname);
  const [activeTab, setActiveTab] = useState<MainTab | null>(currentMainTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<MainTab>>(() => {
    return currentMainTab ? new Set([currentMainTab]) : new Set();
  });

  // Keep state synced with router pathname changes (e.g. from /open or external links)
  useEffect(() => {
    const tab = getMainTab(pathname);
    setActiveTab(tab);
    if (tab) {
      setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
    }
  }, [pathname]);

  // Handle browser back/forward and custom in-app navigation
  useEffect(() => {
    const handlePopState = () => {
      const tab = getMainTab(window.location.pathname);
      setActiveTab(tab);
      if (tab) {
        setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
      }
    };
    const handleCustomNavigate = (e: Event) => {
      const target = (e as CustomEvent<string>)?.detail;
      if (target) {
        const tab = getMainTab(target);
        if (tab) {
          setActiveTab(tab);
          setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
          window.history.pushState(null, '', target);
          window.dispatchEvent(new Event('popstate'));
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('invictus:navigate', handleCustomNavigate);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('invictus:navigate', handleCustomNavigate);
    };
  }, []);

  useEffect(() => {
    if (!activeTab) return;
    const titles: Record<MainTab, string> = {
      discover: 'Discover | Invictus',
      liquidity: 'Liquidity | Invictus',
      portfolio: 'Portfolio | Invictus',
      referral: 'Referral | Invictus',
    };
    if (titles[activeTab]) {
      document.title = titles[activeTab];
    }
  }, [activeTab]);

  useEffect(() => {
    // Eagerly prewarm core data stores so navigation between Discover, Liquidity, Portfolio, and Referral is instant
    void fetchStore.read('/api/referral');
    void fetchStore.read('/api/settings');
    void fetchDirectoryPage({ q: undefined, limit: 25, page: undefined, tab: 'all' });
  }, []);

  const isLinkActive = useCallback(
    (href: string) => {
      if (activeTab) {
        const tab = getMainTab(href);
        return tab === activeTab;
      }
      if (href === '/discover' || href === '/pools') {
        return isDiscover;
      }
      if (href === '/liquidity') {
        return isLiquidity;
      }
      if (href === '/portfolio') {
        return (
          pathname === '/portfolio' ||
          pathname.startsWith('/portfolio')
        );
      }
      if (href === '/referral') {
        return pathname === '/referral' || pathname.startsWith('/referral');
      }
      if (href === '/admin') {
        return pathname === '/admin' || pathname.startsWith('/admin');
      }
      return pathname === href;
    },
    [activeTab, isDiscover, isLiquidity, pathname],
  );

  const handleNavClick = useCallback(
    (href: string, e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }
      const targetTab = getMainTab(href);
      if (targetTab) {
        e.preventDefault();
        if (activeTab === targetTab) return;
        setActiveTab(targetTab);
        setVisitedTabs((prev) => (prev.has(targetTab) ? prev : new Set(prev).add(targetTab)));
        window.history.pushState(null, '', href);
        return;
      }
    },
    [activeTab],
  );

  return (
    <div className="flex flex-col h-svh w-full overflow-hidden bg-background">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center border-b border-border/40 bg-background/80 backdrop-blur-md px-4 sm:px-6 lg:px-8">
        <div className="flex w-full items-center justify-between gap-3 sm:gap-4">
          {/* Left: Brand Logo + Horizontal Nav Links */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {/* Invictus Logo -> route awal web ke discover */}
            <Link
              href="/discover"
              prefetch={true}
              onClick={(e) => handleNavClick('/discover', e)}
              className="flex items-center hover:opacity-90 transition-opacity shrink-0 py-1 cursor-pointer bg-transparent border-0 p-0 outline-none"
            >
              <img
                src="/logo.png"
                alt="Invictus"
                draggable={false}
                className="h-5.5 sm:h-6 w-auto object-contain select-none pointer-events-none"
              />
            </Link>

            <Separator
              orientation="vertical"
              className="mx-0.5 hidden md:block data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
            />

            {/* Horizontal Nav Links */}
            <nav className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar">
              {NAV_LINKS.map((link) => {
                const isActive = isLinkActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch={true}
                    onClick={(e) => handleNavClick(link.href, e)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs sm:text-[13px] font-medium transition-all duration-150 whitespace-nowrap select-none cursor-pointer border-0 outline-none',
                      isActive
                        ? 'bg-muted text-foreground font-semibold shadow-2xs border border-border/50'
                        : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 active:scale-[0.98]',
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}

              {me?.isAdmin && (
                <Link
                  href="/admin"
                  prefetch={true}
                  onClick={(e) => handleNavClick('/admin', e)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs sm:text-[13px] font-medium transition-all duration-150 whitespace-nowrap select-none cursor-pointer outline-none',
                    pathname.startsWith('/admin')
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/30 shadow-2xs'
                      : 'bg-transparent text-amber-600/80 dark:text-amber-400/80 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/10 active:scale-[0.98] border-0',
                  )}
                >
                  Console
                </Link>
              )}
            </nav>
          </div>

          {/* Right: Utilities */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <TopBarActiveTx />
            <SearchDialog />
            <Separator
              orientation="vertical"
              className="hidden sm:block mx-0.5 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
            />
            <NetworkSwitcher />
            <DefiWalletPill address={activeAddress} snap={snap} />
            <QuickTradingSettings />
            <NotificationMenu />
            <Separator
              orientation="vertical"
              className="hidden sm:block mx-0.5 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
            />
            <UserProfileMenu />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div
        className={cn(
          'min-h-0 min-w-0 flex-1 flex flex-col',
          (activeTab === 'discover' || activeTab === 'liquidity') || isWorkstation || (!activeTab && (isDiscover || isLiquidity))
            ? 'overflow-hidden'
            : 'app-scrollbar overflow-x-hidden overflow-y-auto',
        )}
      >
        <div
          className={cn(
            'flex flex-col w-full flex-1',
            isWorkstation
              ? 'min-h-0 px-4 sm:px-6 lg:px-8 py-3 sm:py-4 xl:overflow-hidden overflow-y-auto app-scrollbar'
              : (activeTab === 'discover' || activeTab === 'liquidity') || (!activeTab && (isDiscover || isLiquidity))
                ? 'h-full min-h-0 px-4 sm:px-6 lg:px-8 py-3 sm:py-4 overflow-hidden'
                : 'min-h-full gap-5 px-4 sm:px-6 lg:px-8 pt-4 pb-5 sm:pt-4 sm:pb-5',
          )}
        >
          {activeTab ? (
            <>
              {visitedTabs.has('discover') && (
                <div className={cn('h-full min-h-0 w-full flex flex-col', activeTab !== 'discover' && 'hidden')}>
                  <PoolsPage />
                </div>
              )}
              {visitedTabs.has('liquidity') && (
                <div className={cn('h-full min-h-0 w-full flex flex-col', activeTab !== 'liquidity' && 'hidden')}>
                  <PositionsTab />
                </div>
              )}
              {visitedTabs.has('portfolio') && (
                <div className={cn('w-full flex-1 flex flex-col min-h-0', activeTab !== 'portfolio' && 'hidden')}>
                  <PortfolioShell />
                </div>
              )}
              {visitedTabs.has('referral') && (
                <div className={cn('w-full flex-1 flex flex-col min-h-0', activeTab !== 'referral' && 'hidden')}>
                  <ReferralPage />
                </div>
              )}
            </>
          ) : (
            children
          )}
        </div>
      </div>

      {/* Bottom Bar */}
      <BottomBar gas={gas} connected={connected} snap={snap} />
    </div>
  );
};

