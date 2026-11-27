'use client';

import { Check, ChevronDown, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { ChainAvatar } from '@/components/app/chain-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNetwork } from '@/lib/network';
import { cn } from '@/lib/utils';

/**
 * The network dropdown beside the wallet pill. Hidden with one chain enabled:
 * a Robinhood-only deployment has nothing to switch.
 */
export const NetworkSwitcher = () => {
  const { selected, chains, select } = useNetwork();
  if (chains.length < 2) return null;

  const current = chains.find((c) => c.id === selected) ?? null;
  const choose = (id: number | null) => {
    if (id === selected) return;
    select(id).catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not switch network'));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex h-8 items-center gap-1.5 rounded-lg border border-input/40 bg-card/60 px-2.5 text-xs font-medium text-foreground ring-1 ring-foreground/5 shadow-2xs hover:border-input/80 hover:bg-accent/60 hover:text-accent-foreground transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Network: ${current?.name ?? 'All networks'}`}
        >
          {current ? (
            <ChainAvatar chainId={current.id} size={14} />
          ) : (
            <Globe className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
          )}
          <span className="hidden sm:inline font-semibold tracking-tight">{current?.name ?? 'All networks'}</span>
          <ChevronDown className="size-3 text-muted-foreground/80 shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={6} className="w-56 p-1.5 shadow-xl ring-1 ring-foreground/10">
        <DropdownMenuLabel className="px-1.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Network
        </DropdownMenuLabel>
        <NetworkItem active={selected === null} onSelect={() => choose(null)}>
          <Globe className="size-3.5 text-muted-foreground shrink-0" />
          <span>All networks</span>
        </NetworkItem>
        <DropdownMenuSeparator className="my-1" />
        {chains.map((c) => (
          <NetworkItem key={c.id} active={selected === c.id} onSelect={() => choose(c.id)}>
            <ChainAvatar chainId={c.id} size={14} />
            <span className="truncate">{c.name}</span>
            {c.beta && (
              <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/40 leading-none">
                beta
              </span>
            )}
          </NetworkItem>
        ))}
        <p className="px-1.5 pt-1.5 pb-0.5 text-[10px] leading-snug text-muted-foreground/80">
          Filters pools, positions and wallet. Same wallet on every network; Telegram follows this choice.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const NetworkItem = ({
  active,
  onSelect,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) => (
  <DropdownMenuItem
    onSelect={onSelect}
    className={cn('flex items-center gap-2 px-1.5 py-1.5 text-xs cursor-pointer', active && 'font-semibold')}
  >
    {children}
    {active && <Check className="ml-auto size-3.5 text-primary shrink-0" />}
  </DropdownMenuItem>
);
