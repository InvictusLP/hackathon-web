'use client';

import { startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PortfolioActionContext } from '@/components/app/portfolio-action-context';
import { cn } from '@/lib/utils';
import { OverviewTab } from '@/components/app/tabs/overview-tab';
import { WalletTab } from '@/components/app/tabs/wallet-tab';
import { PnlTab } from '@/components/app/tabs/pnl-tab';
import { CalendarTab } from '@/components/app/tabs/calendar-tab';

export type PortfolioTab = 'overview' | 'pnl' | 'calendar' | 'wallet';

export const TAB_CONFIG: { value: PortfolioTab; label: string }[] = [
  { value: 'overview', label: 'Summary' },
  { value: 'pnl', label: 'Performance' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'wallet', label: 'Wallets' },
];

export function PortfolioShell({
  children,
  defaultTab = 'overview',
}: {
  children?: ReactNode;
  defaultTab?: PortfolioTab;
}) {
  const [currentTab, setCurrentTab] = useState<PortfolioTab>(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const tabParam = sp.get('tab') as PortfolioTab | null;
      if (tabParam && ['overview', 'pnl', 'calendar', 'wallet'].includes(tabParam)) {
        return tabParam;
      }
      try {
        const saved = sessionStorage.getItem('invictus:subnav:portfolio:tab') as PortfolioTab | null;
        if (saved && ['overview', 'pnl', 'calendar', 'wallet'].includes(saved)) {
          return saved;
        }
      } catch {}
    }
    return defaultTab;
  });
  const [visitedTabs, setVisitedTabs] = useState<Set<PortfolioTab>>(() => new Set([currentTab]));
  const [action, setAction] = useState<ReactNode>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem('invictus:subnav:portfolio:tab', currentTab);
    } catch {}
    setVisitedTabs((prev) => (prev.has(currentTab) ? prev : new Set(prev).add(currentTab)));

    // Clean up any ?tab= from URL to keep /portfolio clean
    if (typeof window !== 'undefined' && window.location.pathname === '/portfolio' && window.location.search.includes('tab=')) {
      const sp = new URLSearchParams(window.location.search);
      sp.delete('tab');
      const qs = sp.toString();
      const targetUrl = qs ? `/portfolio?${qs}` : '/portfolio';
      window.history.replaceState(null, '', targetUrl);
    }
  }, [currentTab]);

  // Sync tab only when defaultTab prop explicitly changes across route transitions
  const lastDefaultTabRef = useRef(defaultTab);
  useEffect(() => {
    if (lastDefaultTabRef.current !== defaultTab) {
      lastDefaultTabRef.current = defaultTab;
      if (defaultTab && ['overview', 'pnl', 'calendar', 'wallet'].includes(defaultTab)) {
        startTransition(() => {
          setCurrentTab(defaultTab);
        });
      }
    }
  }, [defaultTab]);

  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === '/portfolio') {
        try {
          const saved = sessionStorage.getItem('invictus:subnav:portfolio:tab') as PortfolioTab | null;
          if (saved && ['overview', 'pnl', 'calendar', 'wallet'].includes(saved)) {
            startTransition(() => setCurrentTab(saved));
            return;
          }
        } catch {}
        startTransition(() => setCurrentTab(defaultTab));
      }
    };
    const handleCustomTab = (e: Event) => {
      const customTab = (e as CustomEvent<PortfolioTab>)?.detail;
      if (customTab && ['overview', 'pnl', 'calendar', 'wallet'].includes(customTab)) {
        startTransition(() => {
          setCurrentTab(customTab);
        });
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('invictus:portfolio:tab', handleCustomTab);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('invictus:portfolio:tab', handleCustomTab);
    };
  }, [defaultTab]);

  const actionContextValue = useMemo(
    () => ({
      action,
      setAction,
      onRefresh: null,
      setOnRefresh: () => {},
      refreshing: false,
      setRefreshing: () => {},
    }),
    [action],
  );

  const handleTabChange = (nextTab: PortfolioTab) => {
    if (nextTab === currentTab) return;
    setAction(null);
    setCurrentTab(nextTab);
    try {
      sessionStorage.setItem('invictus:subnav:portfolio:tab', nextTab);
    } catch {}
    if (typeof window !== 'undefined' && window.location.pathname === '/portfolio') {
      if (window.location.search.includes('tab=')) {
        const sp = new URLSearchParams(window.location.search);
        sp.delete('tab');
        const qs = sp.toString();
        const targetUrl = qs ? `/portfolio?${qs}` : '/portfolio';
        window.history.replaceState(null, '', targetUrl);
      }
    }
  };

  return (
    <PortfolioActionContext.Provider value={actionContextValue}>
      <div className="flex flex-col gap-5 w-full flex-1 min-h-full">
        {/* Curated Tabs & Sub Nav Actions (Right side below profile) */}
        <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-1 shrink-0 min-h-[36px]">
          <Tabs
            value={currentTab}
            onValueChange={(v) => handleTabChange(v as PortfolioTab)}
            className="w-auto"
          >
            <TabsList variant="line" className="h-8 gap-0.5">
              {TAB_CONFIG.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="text-xs sm:text-[13px] font-medium px-2.5 sm:px-3 py-1 data-[state=active]:font-semibold cursor-pointer"
                >
                  <span>{t.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Right Side: Action (Share Button etc.) */}
          {action && (currentTab === 'pnl' || currentTab === 'calendar') && (
            <div className="ml-auto flex items-center gap-2 shrink-0">
              {action}
            </div>
          )}
        </div>

        {/* Tab / Child Page Content */}
        <div className="w-full flex-1 flex flex-col min-h-0">
          {children ? (
            children
          ) : (
            <>
              {visitedTabs.has('overview') && (
                <div className={cn('w-full flex-1 flex flex-col min-h-0', currentTab !== 'overview' && 'hidden')}>
                  <OverviewTab />
                </div>
              )}
              {visitedTabs.has('pnl') && (
                <div className={cn('w-full flex-1 flex flex-col min-h-0', currentTab !== 'pnl' && 'hidden')}>
                  <PnlTab />
                </div>
              )}
              {visitedTabs.has('calendar') && (
                <div className={cn('w-full flex-1 flex flex-col min-h-0', currentTab !== 'calendar' && 'hidden')}>
                  <CalendarTab />
                </div>
              )}
              {visitedTabs.has('wallet') && (
                <div className={cn('w-full flex-1 flex flex-col min-h-0', currentTab !== 'wallet' && 'hidden')}>
                  <WalletTab isActive={currentTab === 'wallet'} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PortfolioActionContext.Provider>
  );
}
