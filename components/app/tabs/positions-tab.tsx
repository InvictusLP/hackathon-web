'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  MinusCircle,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useAction } from '@/components/app/action';
import { ActionDialog } from '@/components/app/action-dialog';
import { useSnapshot } from '@/components/app/live';
import { useNetwork } from '@/lib/network';
import { PositionRow } from '@/components/app/position-row';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePersistentTab } from '@/lib/use-persistent-tab';
import { LiquiditySkeleton as PositionsSkeleton } from '@/app/liquidity/skeleton';
import { post } from '@/lib/api';
import { usd } from '@/lib/format';
import { mutateFetch } from '@/lib/use-live';
import { executeBatchClose, waitForJobConfirmation } from '@/lib/batch-actions';
import { cn } from '@/lib/utils';
import type { WebPosition } from '@/lib/types';

const Page = () => {
  const snap = useSnapshot();
  const [filter, setFilter] = usePersistentTab<'all' | 'in' | 'out'>({
    key: 'invictus:subnav:liquidity:filter',
    defaultValue: 'all',
    validValues: ['all', 'in', 'out'] as const,
    urlParam: 'filter',
  });
  const action = useAction();
  const [actionTitle, setActionTitle] = useState('Bulk Liquidity');
  const [actionDesc, setActionDesc] = useState('Managing positions on-chain…');

  const { inNetwork } = useNetwork();
  // Only the selected network's positions; every network lists them all.
  const positions = useMemo(() => (snap?.positions ?? []).filter((p) => inNetwork(p.chainId)), [snap?.positions, inNetwork]);
  const inRangeCount = positions.filter((p) => p.inRange).length;
  const outPositions = useMemo(() => positions.filter((p) => !p.inRange && (p.valueUsd > 0 || p.exists)), [positions]);
  const outRangeCount = outPositions.length;
  const outTotalUsd = useMemo(
    () => outPositions.reduce((acc, p) => acc + (p.valueUsd || 0), 0),
    [outPositions],
  );

  // Position performance categorisation for multi-position execution
  const profitPositions = useMemo(
    () => positions.filter((p) => p.hasBasis && ((p.pnlUsd || 0) > 0.01 || (p.pnlPct || 0) > 0.01)),
    [positions],
  );
  const profitTotalUsd = useMemo(
    () => profitPositions.reduce((acc, p) => acc + (p.pnlUsd || 0), 0),
    [profitPositions],
  );

  const lossPositions = useMemo(
    () => positions.filter((p) => p.hasBasis && ((p.pnlUsd || 0) < -0.01 || (p.pnlPct || 0) < -0.01)),
    [positions],
  );
  const lossTotalUsd = useMemo(
    () => lossPositions.reduce((acc, p) => acc + (p.pnlUsd || 0), 0),
    [lossPositions],
  );

  const totalFeesUsd = useMemo(
    () => positions.reduce((acc, p) => acc + (p.feesUsd || 0), 0),
    [positions],
  );
  const hasFees = totalFeesUsd > 0.001 || positions.some((p) => (p.feesQuote || 0) > 0 || (p.feesToken || 0) > 0);

  const running = action.steps.length > 0 || action.awaiting !== null;

  const address = snap?.wallet?.address;
  const autoScannedRef = useRef<string | null>(null);

  // Track position keys baseline to identify freshly created positions (POSITION_CREATED event)
  const initialLoadedKeysRef = useRef<Set<string> | null>(null);
  const [newlyCreatedKeys, setNewlyCreatedKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!snap?.positions) return;
    const currentKeys = new Set(snap.positions.map((p) => p.key));

    // Initial mount: record all current keys as baseline. Never animate initial page load!
    if (initialLoadedKeysRef.current === null) {
      initialLoadedKeysRef.current = currentKeys;
      return;
    }

    // Identify newly minted position keys that were absent in baseline
    const addedKeys: string[] = [];
    for (const key of currentKeys) {
      if (!initialLoadedKeysRef.current.has(key)) {
        addedKeys.push(key);
        initialLoadedKeysRef.current.add(key);
      }
    }

    if (addedKeys.length > 0) {
      setNewlyCreatedKeys((prev) => {
        const next = new Set(prev);
        addedKeys.forEach((k) => next.add(k));
        return next;
      });

      // Smooth decay of entrance emphasis back to default (1200ms)
      const timer = setTimeout(() => {
        setNewlyCreatedKeys((prev) => {
          const next = new Set(prev);
          addedKeys.forEach((k) => next.delete(k));
          return next;
        });
      }, 1200);

      return () => clearTimeout(timer);
    }
  }, [snap?.positions]);

  // Automatically trigger a silent background sync if the wallet currently has 0 positions loaded,
  // ensuring ranges opened externally are immediately retrieved without requiring manual button clicks.
  useEffect(() => {
    if (!address || positions.length > 0 || autoScannedRef.current === address) return;
    autoScannedRef.current = address;
    const timer = setTimeout(() => {
      void post('/api/rescan', {})
        .then(() => mutateFetch())
        .catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [address, positions.length]);

  const collectAll = async (swap = false): Promise<void> => {
    setActionTitle('Claim All Fees');
    setActionDesc(`Claiming fees across ${positions.length} position(s)…`);
    await action.run('/api/collect-all', { swap });
  };

  const closeAll = async (sell = false): Promise<void> => {
    setActionTitle('Close All');
    setActionDesc(`Closing all ${positions.length} position(s)…`);
    await action.run('/api/close-all', { sell, force: false });
  };

  const closeInProfit = async (sell = false): Promise<void> => {
    if (profitPositions.length === 0) return;
    await executeBatchClose(profitPositions, {
      sell,
      runClose: (key, sell) => action.run('/api/close', { key, sell }),
      onProgress: (i, total, p) => {
        setActionTitle('Close In-Profit');
        setActionDesc(`Closing position ${i + 1} of ${total}: ${p.symbol ?? 'Position'} #${p.tokenId ?? ''}…`);
      },
      waitForConfirmation: waitForJobConfirmation,
    });
  };

  const closeInLoss = async (sell = false): Promise<void> => {
    if (lossPositions.length === 0) return;
    await executeBatchClose(lossPositions, {
      sell,
      runClose: (key, sell) => action.run('/api/close', { key, sell }),
      onProgress: (i, total, p) => {
        setActionTitle('Close In-Loss');
        setActionDesc(`Closing position ${i + 1} of ${total}: ${p.symbol ?? 'Position'} #${p.tokenId ?? ''}…`);
      },
      waitForConfirmation: waitForJobConfirmation,
    });
  };

  const closeOutOfRange = async (sell = false): Promise<void> => {
    if (outPositions.length === 0) return;
    await executeBatchClose(outPositions, {
      sell,
      runClose: (key, sell) => action.run('/api/close', { key, sell }),
      onProgress: (i, total, p) => {
        setActionTitle('Close Out-of-Range');
        setActionDesc(`Closing position ${i + 1} of ${total}: ${p.symbol ?? 'Position'} #${p.tokenId ?? ''}…`);
      },
      waitForConfirmation: waitForJobConfirmation,
    });
  };

  // Filter Pipeline
  const filtered = useMemo(() => {
    let result = positions.filter((p) => {
      if (filter === 'in' && !p.inRange) return false;
      if (filter === 'out' && p.inRange) return false;
      return true;
    });

    result = [...result].sort((a: WebPosition, b: WebPosition) => {
      return (b.valueUsd || 0) - (a.valueUsd || 0);
    });

    return result;
  }, [positions, filter]);

  if (!snap) {
    return <PositionsSkeleton />;
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-3.5 w-full flex-1 h-full min-h-0 overflow-hidden">
      {/* On-Chain Transaction Progress Dialog */}
      <ActionDialog
        action={action}
        title={actionTitle}
        description={actionDesc}
      />

      {/* Sub-Nav Tabs (All, In Range, Out of Range) & Bulk Actions (Claim, Close) */}
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-border/50 pb-1">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'in' | 'out')} className="w-auto">
          <TabsList variant="line" className="h-8 gap-0.5">
            <TabsTrigger
              value="all"
              className="text-xs sm:text-[13px] font-medium px-2.5 sm:px-3 py-1 data-[state=active]:font-semibold cursor-pointer gap-1.5 transition-all duration-150 active:scale-[0.98]"
            >
              <span>All</span>
              <span className="text-[10px] font-mono px-1 py-0 rounded bg-muted text-muted-foreground transition-colors">
                {positions.length}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="in"
              className="text-xs sm:text-[13px] font-medium px-2.5 sm:px-3 py-1 data-[state=active]:font-semibold cursor-pointer gap-1.5 transition-all duration-150 active:scale-[0.98]"
            >
              <span>In Range</span>
              <span className="text-[10px] font-mono px-1 py-0 rounded bg-muted text-muted-foreground transition-colors">
                {inRangeCount}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="out"
              className="text-xs sm:text-[13px] font-medium px-2.5 sm:px-3 py-1 data-[state=active]:font-semibold cursor-pointer gap-1.5 transition-all duration-150 active:scale-[0.98]"
            >
              <span>Out of Range</span>
              <span className="text-[10px] font-mono px-1 py-0 rounded bg-muted text-muted-foreground transition-colors">
                {outRangeCount}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Bulk Claim & Close Dropdowns matching Row design */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Bulk Claim Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasFees || running || action.busy}
                className={cn(
                  'group/claim h-7.5 px-2.5 sm:px-3 text-xs font-medium gap-1.5 shadow-2xs cursor-pointer text-white hover:text-white border-border/60 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all duration-150 active:scale-[0.98] data-[state=open]:bg-emerald-500/15 data-[state=open]:border-emerald-500/40',
                  !hasFees && 'opacity-40 cursor-not-allowed hover:bg-transparent hover:text-white active:scale-100',
                )}
                title={hasFees ? `Claim all accrued fees (${usd(totalFeesUsd)})` : 'No fees to claim'}
              >
                <ArrowDownToLine className="size-3.5 text-white shrink-0" />
                <span className="text-white">Claim</span>
                {hasFees && (
                  <span className="font-mono text-[10px] font-bold text-emerald-400 hidden sm:inline ml-0.5">
                    +{usd(totalFeesUsd)}
                  </span>
                )}
                <ChevronDown className="size-2.5 opacity-70 text-white transition-transform duration-200 group-data-[state=open]/claim:rotate-180 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 p-1 space-y-0.5">
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Harvest Fees
              </div>
              <DropdownMenuItem
                onClick={() => void collectAll(false)}
                className="flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-md hover:bg-muted/80 transition-colors"
              >
                <ArrowDownToLine className="size-4 text-emerald-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-xs text-foreground">To Wallet</span>
                  <span className="text-[10px] text-muted-foreground">Collect all fees directly</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void collectAll(true)}
                className="flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-md hover:bg-muted/80 transition-colors"
              >
                <ArrowLeftRight className="size-4 text-primary shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-xs text-foreground">Swap to Quote</span>
                  <span className="text-[10px] text-muted-foreground">Auto-convert fees to quote</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Bulk Close Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={positions.length === 0 || running || action.busy}
                className={cn(
                  'group/close h-7.5 px-2.5 sm:px-3 text-xs font-medium gap-1.5 shadow-2xs cursor-pointer text-white hover:text-white border-rose-500/30 hover:bg-rose-500/10 hover:border-rose-500/50 transition-all duration-150 active:scale-[0.98] data-[state=open]:bg-rose-500/15 data-[state=open]:border-rose-500/60',
                  positions.length === 0 && 'opacity-40 cursor-not-allowed hover:bg-transparent hover:text-white active:scale-100',
                )}
                title="Close positions"
              >
                <ArrowUpRight className="size-3.5 text-white shrink-0" />
                <span className="text-white">Close</span>
                <ChevronDown className="size-2.5 opacity-70 text-white transition-transform duration-200 group-data-[state=open]/close:rotate-180 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 p-1 space-y-0.5">
              {/* Selective Exit Options */}
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Selective
              </div>

              <DropdownMenuItem
                disabled={profitPositions.length === 0}
                onClick={() => void closeInProfit(false)}
                className="flex items-center justify-between gap-2 cursor-pointer py-1.5 px-2 rounded-md hover:bg-muted/80 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <TrendingUp className="size-4 text-emerald-400 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-xs text-foreground">In Profit</span>
                    <span className="text-[10px] text-muted-foreground">
                      {profitPositions.length > 0
                        ? `${profitPositions.length} position${profitPositions.length > 1 ? 's' : ''}`
                        : '0 positions'}
                    </span>
                  </div>
                </div>
                {profitPositions.length > 0 && (
                  <span className="font-mono text-[11px] font-bold text-emerald-400 shrink-0">
                    +{usd(profitTotalUsd)}
                  </span>
                )}
              </DropdownMenuItem>

              <DropdownMenuItem
                disabled={lossPositions.length === 0}
                onClick={() => void closeInLoss(false)}
                className="flex items-center justify-between gap-2 cursor-pointer py-1.5 px-2 rounded-md hover:bg-muted/80 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <TrendingDown className="size-4 text-rose-400 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-xs text-foreground">In Loss</span>
                    <span className="text-[10px] text-muted-foreground">
                      {lossPositions.length > 0
                        ? `${lossPositions.length} position${lossPositions.length > 1 ? 's' : ''}`
                        : '0 positions'}
                    </span>
                  </div>
                </div>
                {lossPositions.length > 0 && (
                  <span className="font-mono text-[11px] font-bold text-rose-400 shrink-0">
                    -{usd(Math.abs(lossTotalUsd))}
                  </span>
                )}
              </DropdownMenuItem>

              <DropdownMenuItem
                disabled={outPositions.length === 0}
                onClick={() => void closeOutOfRange(false)}
                className="flex items-center justify-between gap-2 cursor-pointer py-1.5 px-2 rounded-md hover:bg-muted/80 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <MinusCircle className="size-4 text-amber-400 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-xs text-foreground">Out of Range</span>
                    <span className="text-[10px] text-muted-foreground">
                      {outPositions.length > 0
                        ? `${outPositions.length} inactive`
                        : 'All in range'}
                    </span>
                  </div>
                </div>
                {outPositions.length > 0 && (
                  <span className="font-mono text-[11px] font-medium text-amber-400/90 shrink-0">
                    {usd(outTotalUsd)}
                  </span>
                )}
              </DropdownMenuItem>

              <div className="h-px bg-border/40 my-1" />

              {/* Bulk Global Exit Section */}
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                All Positions ({positions.length})
              </div>

              <DropdownMenuItem
                disabled={positions.length === 0}
                onClick={() => void closeAll(false)}
                className="flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-md hover:bg-muted/80 transition-colors"
              >
                <MinusCircle className="size-4 text-muted-foreground shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-xs text-foreground">Withdraw Both</span>
                  <span className="text-[10px] text-muted-foreground">
                    Return pair tokens & fees
                  </span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem
                disabled={positions.length === 0}
                onClick={() => void closeAll(true)}
                className="flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-md hover:bg-muted/80 transition-colors"
              >
                <ArrowLeftRight className="size-4 text-primary shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-xs text-foreground">Swap to Quote</span>
                  <span className="text-[10px] text-muted-foreground">
                    Exit 100% to quote asset
                  </span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Positions Card — clean shell matching Discover with inner scrollbar */}
      <div className="w-full flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="rounded-xl border border-border/70 bg-card/50 shadow-xs overflow-hidden flex-1 flex flex-col min-h-0">
          {positions.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-center select-none">
              <p className="text-sm text-muted-foreground">No active liquidity positions</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-center select-none">
              <p className="text-sm text-muted-foreground">No positions match filter</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto app-scrollbar divide-y divide-border/40">
              {filtered.map((p) => {
                const isNewlyCreated = newlyCreatedKeys.has(p.key);
                return (
                  <PositionRow
                    key={p.chainId ? `${p.chainId}:${p.key}` : p.key}
                    position={p}
                    isNewlyCreated={isNewlyCreated}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const PositionsTab = () => <Page />;
