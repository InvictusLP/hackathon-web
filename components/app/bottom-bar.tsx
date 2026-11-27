'use client';

import { Fuel } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { usd } from '@/lib/format';
import { usePing } from '@/lib/use-live';
import { cn } from '@/lib/utils';
import type { GasNow, Snapshot } from '@/lib/types';

export function EthereumIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 256 417"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid"
      fill="none"
      className={cn('inline-block shrink-0', className)}
      {...props}
    >
      <path
        d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z"
        fill="currentColor"
        fillOpacity="0.95"
      />
      <path
        d="M127.962 0L0 212.32l127.962 75.639V154.158z"
        fill="currentColor"
        fillOpacity="0.6"
      />
      <path
        d="M127.961 287.958l-1.744 2.128v112.941l1.744 5.079 128.038-180.32z"
        fill="currentColor"
        fillOpacity="0.95"
      />
      <path
        d="M127.962 408.106v-120.148L0 227.705z"
        fill="currentColor"
        fillOpacity="0.6"
      />
      <path
        d="M127.961 262.596l127.962-75.637-127.962-58.204z"
        fill="currentColor"
        fillOpacity="0.8"
      />
      <path
        d="M0 186.959l127.962 75.637V128.755z"
        fill="currentColor"
        fillOpacity="0.45"
      />
    </svg>
  );
}

interface PingVisual {
  level: number;
  textColor: string;
  dotColor: string;
  barColor: string;
  displayText: string;
  quality: string;
}

const getPingVisual = (ping: number | null, connected: boolean): PingVisual => {
  if (!connected) {
    return {
      level: 0,
      textColor: 'text-muted-foreground',
      dotColor: 'bg-muted-foreground/60',
      barColor: 'bg-muted-foreground/30',
      displayText: 'Disconnected',
      quality: 'Disconnected',
    };
  }

  if (ping === null) {
    return {
      level: 3,
      textColor: 'text-emerald-500',
      dotColor: 'bg-emerald-500',
      barColor: 'bg-emerald-500',
      displayText: 'Live',
      quality: 'Connected',
    };
  }

  // Jika lebih dari 500ms maka merah
  if (ping > 500) {
    return {
      level: 1,
      textColor: 'text-rose-500',
      dotColor: 'bg-rose-500',
      barColor: 'bg-rose-500',
      displayText: `${ping} ms`,
      quality: 'Critical Latency (>500ms)',
    };
  }

  // Saat ping besar (kuning) -> 201ms - 500ms
  if (ping > 200) {
    return {
      level: 2,
      textColor: 'text-amber-500',
      dotColor: 'bg-amber-500',
      barColor: 'bg-amber-500',
      displayText: `${ping} ms`,
      quality: 'High Latency',
    };
  }

  // Normal / optimal (hijau) -> <= 200ms
  if (ping > 100) {
    return {
      level: 3,
      textColor: 'text-emerald-500',
      dotColor: 'bg-emerald-500',
      barColor: 'bg-emerald-500',
      displayText: `${ping} ms`,
      quality: 'Good',
    };
  }

  return {
    level: 4,
    textColor: 'text-emerald-500',
    dotColor: 'bg-emerald-500',
    barColor: 'bg-emerald-500',
    displayText: `${ping} ms`,
    quality: 'Optimal',
  };
};

const ConnectionBars = ({
  level,
  barColor,
}: {
  level: number;
  barColor: string;
}) => (
  <div className="flex items-end gap-[1.5px] h-3 select-none" aria-hidden="true">
    <span
      className={cn('w-[2px] rounded-xs transition-colors duration-200', level >= 1 ? barColor : 'bg-muted-foreground/25')}
      style={{ height: '30%' }}
    />
    <span
      className={cn('w-[2px] rounded-xs transition-colors duration-200', level >= 2 ? barColor : 'bg-muted-foreground/25')}
      style={{ height: '52%' }}
    />
    <span
      className={cn('w-[2px] rounded-xs transition-colors duration-200', level >= 3 ? barColor : 'bg-muted-foreground/25')}
      style={{ height: '75%' }}
    />
    <span
      className={cn('w-[2px] rounded-xs transition-colors duration-200', level >= 4 ? barColor : 'bg-muted-foreground/25')}
      style={{ height: '100%' }}
    />
  </div>
);

export const BottomBar = ({
  gas,
  connected,
  snap,
}: {
  gas: GasNow | null;
  connected: boolean;
  snap: Snapshot | null;
}) => {
  const ping = usePing(connected);
  const ethUsd = snap?.ethUsd ?? 0;
  const visual = getPingVisual(ping, connected);

  return (
    <footer className="sticky bottom-0 z-40 flex h-8.5 shrink-0 items-center border-t border-border/40 bg-background/85 text-xs backdrop-blur-md transition-colors select-none rounded-b-[inherit] overflow-hidden text-muted-foreground px-4 sm:px-6 lg:px-8">
      <div className="flex w-full items-center justify-between">
        {/* Left Group: Native Token Price & Gwei Only */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 overflow-x-auto no-scrollbar">
          {/* ETH Price */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 cursor-default hover:text-foreground transition-colors shrink-0">
                <EthereumIcon className="size-3.5 text-foreground" />
                <span className="tabular font-medium font-mono text-foreground">
                  {ethUsd > 0 ? usd(ethUsd) : '—'}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="rounded-lg border border-border/70 bg-popover/95 text-popover-foreground p-2.5 text-xs shadow-xl backdrop-blur-md select-none"
            >
              <div className="space-y-1.5 min-w-[160px]">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-primary/70" /> Asset
                  </span>
                  <span className="tabular font-medium font-mono text-foreground">
                    ETH / USD
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-muted-foreground/60" /> Network
                  </span>
                  <span className="tabular font-medium font-mono text-foreground">
                    Robinhood Chain
                  </span>
                </div>
                {ethUsd > 0 && (
                  <div className="flex items-center justify-between gap-3 text-xs pt-1.5 border-t border-border/40">
                    <span className="text-muted-foreground">Spot Price</span>
                    <span className="tabular font-semibold font-mono text-foreground">
                      {usd(ethUsd)}
                    </span>
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-3 bg-border/60 shrink-0" />

          {/* Gas / Gwei Tracker */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 cursor-default hover:text-foreground transition-colors shrink-0">
                <Fuel className="size-3 text-foreground" />
                <span className="tabular font-medium font-mono text-foreground">
                  {gas
                    ? gas.baseGwei < 0.01
                      ? `${(gas.baseGwei * 1000).toFixed(0)} nG`
                      : `${gas.baseGwei.toFixed(3)} Gwei`
                    : '—'}
                </span>
                {gas && (
                  <span className="tabular text-muted-foreground/70 hidden sm:inline font-mono text-[11px]">
                    ({usd(gas.openUsd)})
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="rounded-lg border border-border/70 bg-popover/95 text-popover-foreground p-2.5 text-xs shadow-xl backdrop-blur-md select-none"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-primary/70" /> Base Fee
                  </span>
                  <span className="tabular font-medium font-mono text-foreground text-right">
                    {gas
                      ? gas.baseGwei < 0.01
                        ? `${(gas.baseGwei * 1000).toFixed(0)} nG`
                        : `${gas.baseGwei.toFixed(3)} Gwei`
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-muted-foreground/60" /> Priority
                  </span>
                  <span className="tabular font-medium font-mono text-foreground text-right">
                    {gas
                      ? gas.tipGwei < 0.01
                        ? `${(gas.tipGwei * 1000).toFixed(0)} nG`
                        : `${gas.tipGwei.toFixed(3)} Gwei`
                      : '—'}
                  </span>
                </div>
                {gas?.openUsd !== undefined && (
                  <div className="flex items-center justify-between gap-3 text-xs pt-1.5 border-t border-border/40">
                    <span className="text-muted-foreground">Est. Mint LP</span>
                    <span className="tabular font-semibold font-mono text-foreground text-right">
                      ~{usd(gas.openUsd)}
                    </span>
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Right Group: Connection Health Only */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 cursor-default hover:opacity-90 transition-opacity">
                <ConnectionBars level={visual.level} barColor={visual.barColor} />
                <span className={cn('tabular font-medium text-[11px] font-mono transition-colors', visual.textColor)}>
                  {visual.displayText}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="rounded-lg border border-border/70 bg-popover/95 text-popover-foreground p-2.5 text-xs shadow-xl backdrop-blur-md select-none"
            >
              <div className="space-y-1.5 min-w-[165px]">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className={cn('size-1.5 rounded-full', visual.dotColor)} /> Status
                  </span>
                  <span className={cn('tabular font-medium font-mono', visual.textColor)}>
                    {connected ? visual.quality : 'Disconnected'}
                  </span>
                </div>
                {connected && ping !== null && (
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-primary/70" /> Latency
                    </span>
                    <span className={cn('tabular font-medium font-mono', visual.textColor)}>
                      {ping} ms
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 text-xs pt-1.5 border-t border-border/40">
                  <span className="text-muted-foreground">Transport</span>
                  <span className="tabular font-mono text-foreground">WebSocket / SSE</span>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </footer>
  );
};
