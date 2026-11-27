'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  SlidersHorizontal,
  Wallet,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TokenAvatar } from '@/components/app/token-avatar';

const ETH_CA = '0x0000000000000000000000000000000000000000';
const WETH_CA = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';
const USDG_CA = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';

import { post } from '@/lib/api';
import { BLOCK_EXPLORERS, useBlockExplorer } from '@/lib/explorer';
import { num, shortAddr, usd } from '@/lib/format';
import { walletChanged, useFetch } from '@/lib/use-live';
import { fetchStore } from '@/lib/fetch-store';
import { cn } from '@/lib/utils';
import type { SettingsPayload, Snapshot, WalletRow } from '@/lib/types';

const openWalletTab = () => {
  try {
    sessionStorage.setItem('invictus:subnav:portfolio:tab', 'wallet');
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('invictus:portfolio:tab', { detail: 'wallet' }));
  }
};

/** Composite Wallet Pill & Dropdown (Clean, Modern DeFi style) */
export const DefiWalletPill = ({
  address,
  snap,
}: {
  address: string | null;
  snap: Snapshot | null;
}) => {
  const router = useRouter();
  const { data } = useFetch<{ wallets: WalletRow[] }>('/api/wallets');
  const [switching, setSwitching] = useState(false);
  const { formatUrl } = useBlockExplorer();
  const wallets = data?.wallets ?? [];
  const effectiveAddress = address || wallets.find((w) => w.isActive)?.address || wallets[0]?.address || null;

  const handleOpenWallets = () => {
    openWalletTab();
    if (typeof window !== 'undefined' && window.location.pathname !== '/portfolio') {
      router.push('/portfolio');
    }
  };

  if (!effectiveAddress) {
    return (
      <Button
        variant="outline"
        size="xs"
        className="h-8 gap-1.5 rounded-lg border border-input/40 bg-card/60 px-2.5 text-xs font-medium text-foreground ring-1 ring-foreground/5 shadow-2xs hover:border-input/80 hover:bg-accent/60 transition-all cursor-pointer"
        onClick={handleOpenWallets}
      >
        <Wallet className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Wallet</span>
      </Button>
    );
  }

  const active = wallets.find((w) => w.address.toLowerCase() === effectiveAddress.toLowerCase());
  const totalNetWorth = snap?.totals?.netWorthUsd ?? 0;
  const liquid = snap?.wallet?.liquidUsd ?? 0;
  const activeLp = Math.max(0, totalNetWorth - liquid);
  const totalBalance = totalNetWorth > 0 ? totalNetWorth : liquid;
  const w = snap?.wallet;

  const switchTo = async (to: string): Promise<void> => {
    if (to.toLowerCase() === effectiveAddress.toLowerCase()) return;
    setSwitching(true);
    try {
      await post('/api/wallets/switch', { address: to });
      walletChanged();
      toast.success(`Switched to ${shortAddr(to)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'could not switch');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex h-8 items-center gap-1.5 rounded-lg border border-input/40 bg-card/60 px-2.5 text-xs font-medium text-foreground ring-1 ring-foreground/5 shadow-2xs hover:border-input/80 hover:bg-accent/60 hover:text-accent-foreground transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Active Wallet"
        >
          <Wallet className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
          <span className="font-semibold tabular text-foreground tracking-tight text-xs">
            {usd(totalBalance)}
          </span>
          <ChevronDown className="size-3 text-muted-foreground/80 shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={6} className="w-76 p-2 shadow-xl ring-1 ring-foreground/10 space-y-2">
        {/* Wallet Balance Hero Header */}
        <div className="rounded-lg bg-muted/30 p-2.5 border border-border/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground tracking-tight">
              {active?.label ?? 'Active Wallet'}
            </span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-muted-foreground">
                {shortAddr(effectiveAddress)}
              </span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                title="Copy Address"
                onClick={(e) => {
                  e.stopPropagation();
                  void navigator.clipboard.writeText(effectiveAddress);
                  toast.success('Address copied');
                }}
              >
                <Copy className="size-3" />
              </button>
              <a
                href={formatUrl(`/address/${effectiveAddress}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                title="View on explorer"
                aria-label="View on explorer"
              >
                <ExternalLink className="size-3" />
              </a>
            </div>
          </div>

          <div className="pt-0.5">
            <div className="text-xl font-bold tabular tracking-tight text-foreground">
              {usd(totalBalance)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-border/30 text-xs">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Balance</span>
              <span className="font-medium tabular text-foreground">{usd(liquid)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Position</span>
              <span className="font-medium tabular text-foreground">{usd(activeLp)}</span>
            </div>
          </div>
        </div>

        {/* Token Holding Chips */}
        {w && (
          <div className="grid grid-cols-3 gap-1 px-0.5 text-center text-[10px] tabular">
            <div className="rounded-md border border-border/30 bg-card/40 py-1.5 px-1.5 flex items-center justify-center gap-1.5 min-w-0" title="ETH">
              <TokenAvatar symbol="ETH" address={ETH_CA} size="xs" />
              <span className="font-semibold text-foreground text-[11px] truncate">{num(w.eth, 3)}</span>
            </div>
            <div className="rounded-md border border-border/30 bg-card/40 py-1.5 px-1.5 flex items-center justify-center gap-1.5 min-w-0" title="WETH">
              <TokenAvatar symbol="WETH" address={WETH_CA} size="xs" />
              <span className="font-semibold text-foreground text-[11px] truncate">{num(w.weth, 3)}</span>
            </div>
            <div className="rounded-md border border-border/30 bg-card/40 py-1.5 px-1.5 flex items-center justify-center gap-1.5 min-w-0" title="USDG">
              <TokenAvatar symbol="USDG" address={USDG_CA} size="xs" />
              <span className="font-semibold text-foreground text-[11px] truncate">{num(w.usdg, 1)}</span>
            </div>
          </div>
        )}

        <DropdownMenuSeparator className="my-1" />

        {/* Switch Wallet List */}
        {wallets.length > 1 && (
          <>
            <DropdownMenuLabel className="px-1 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Wallets ({wallets.length})
            </DropdownMenuLabel>
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {wallets.map((item) => (
                <DropdownMenuItem
                  key={item.address}
                  disabled={item.isActive || switching}
                  onSelect={() => void switchTo(item.address)}
                  className={cn(
                    'flex items-center justify-between rounded-md px-2 py-1.5 text-xs cursor-pointer',
                    item.isActive && 'bg-primary/5 font-semibold text-primary',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-foreground text-xs font-medium">
                      {item.label ?? 'Wallet'}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate">
                      {shortAddr(item.address)}
                    </div>
                  </div>
                  {item.isActive && <Check className="size-3.5 text-primary ml-2 shrink-0" />}
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator className="my-1" />
          </>
        )}

        {/* Manage Wallets Link */}
        <DropdownMenuItem
          onSelect={handleOpenWallets}
          className="cursor-pointer inline-flex items-center justify-center h-7 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground text-center"
        >
          <Wallet className="size-3.5 mr-1.5 text-muted-foreground" />
          All Wallets
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** Quick DeFi Trading Settings Popover (Clean, Minimalist & Intuitive) */
export const QuickTradingSettings = () => {
  const { data } = useFetch<SettingsPayload>('/api/settings');
  const [busy, setBusy] = useState(false);
  const { explorerId, setExplorerId, options: explorerOptions } = useBlockExplorer();

  const priorityFeePct = Number(data?.values.priorityFeePct ?? 150);
  const slippageBps = Number(data?.values.slippageBps ?? 100);

  const save = async (patch: Record<string, number | boolean | string | null>): Promise<void> => {
    setBusy(true);
    try {
      const values = await post<SettingsPayload['values']>('/api/settings', patch);
      if (data) fetchStore.set('/api/settings', { ...data, values });
      fetchStore.invalidate((path) => path === '/api/gas', false);
      toast.success('Settings updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'could not save setting');
    } finally {
      setBusy(false);
    }
  };

  const SLIPPAGES = [
    { label: '0.5%', val: 50 },
    { label: '1.0%', val: 100 },
    { label: '2.0%', val: 200 },
  ];

  const SPEEDS = [
    { name: 'Normal', pct: 100 },
    { name: 'Fast', pct: 150 },
    { name: 'Turbo', pct: 300 },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-lg border-input/40 bg-card/60 text-muted-foreground hover:border-input/80 hover:bg-accent/60 hover:text-foreground shadow-2xs transition-all cursor-pointer"
          aria-label="Quick Trading Settings"
        >
          <SlidersHorizontal className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-80 p-3 space-y-3 shadow-xl ring-1 ring-foreground/10">
        <PopoverHeader className="pb-1 border-b border-border/40">
          <div className="flex items-center justify-between">
            <PopoverTitle className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Zap className="size-3.5 text-primary" />
              Quick Settings
            </PopoverTitle>
            <Link
              href="/settings"
              className="text-[11px] text-muted-foreground hover:text-foreground font-medium underline underline-offset-2"
            >
              Settings
            </Link>
          </div>
        </PopoverHeader>

        {/* Slippage tolerance */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground text-[11px] font-medium">Slippage</span>
            <span className="tabular font-semibold text-foreground text-xs">{(slippageBps / 100).toFixed(1)}%</span>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/30 p-1">
            {SLIPPAGES.map((s) => (
              <button
                key={s.val}
                type="button"
                disabled={busy}
                onClick={() => void save({ slippageBps: s.val })}
                className={cn(
                  'h-6 rounded-md text-xs font-medium transition-all cursor-pointer',
                  slippageBps === s.val
                    ? 'bg-background text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Priority gas fee speed */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground text-[11px] font-medium">Speed</span>
            <span className="font-semibold text-foreground text-xs">
              {priorityFeePct === 100 ? 'Normal' : priorityFeePct === 150 ? 'Fast' : 'Turbo'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/30 p-1">
            {SPEEDS.map((sp) => (
              <button
                key={sp.pct}
                type="button"
                disabled={busy}
                onClick={() => void save({ priorityFeePct: sp.pct })}
                className={cn(
                  'h-6 rounded-md text-xs font-medium transition-all cursor-pointer',
                  priorityFeePct === sp.pct
                    ? 'bg-background text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                {sp.name}
              </button>
            ))}
          </div>
        </div>

        {/* Block Explorer preference */}
        <div className="space-y-1.5 pt-1.5 border-t border-border/30">
          <span className="text-muted-foreground text-[11px] font-medium">Explorer</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-2.5 h-8 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors outline-none cursor-pointer"
              >
                <span>{BLOCK_EXPLORERS[explorerId]?.name}</span>
                <ChevronDown className="size-3.5 text-muted-foreground opacity-70 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" className="w-[var(--radix-dropdown-menu-trigger-width)]">
              {explorerOptions
                .filter((opt) => opt.id !== explorerId)
                .map((opt) => (
                  <DropdownMenuItem
                    key={opt.id}
                    onClick={() => {
                      setExplorerId(opt.id);
                      toast.success(`Explorer → ${opt.name}`);
                    }}
                    className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
                  >
                    <span className="text-xs font-medium leading-none">{opt.name}</span>
                    <a
                      href={opt.baseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-muted-foreground hover:text-primary font-mono transition-colors leading-none"
                    >
                      {opt.domain}
                    </a>
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PopoverContent>
    </Popover>
  );
};
