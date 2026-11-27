'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  Clock,
  Coins,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { get } from '@/lib/api';
import { ago, usd } from '@/lib/format';
import { useActionSeq, useSnapshot } from './live';
import type { PendingAction } from '@/lib/types';

export const NotificationMenu = () => {
  const seq = useActionSeq();
  const snap = useSnapshot();
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async (): Promise<void> => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const out = await get<{ actions: PendingAction[] }>('/api/pending');
        if (live) setActions(out.actions);
      } catch {
        // Fallback silently on transient network hiccup
      }
    };
    void load();
    const timer = setInterval(() => void load(), 20_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [seq]);

  const unreadCount = actions.length;
  const uncollectedFees = snap?.totals?.feesUsd ?? 0;
  const hasNotifications = unreadCount > 0 || uncollectedFees > 0.5;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative size-8 rounded-lg border-input/40 bg-card/60 text-muted-foreground hover:border-input/80 hover:bg-accent/60 hover:text-foreground shadow-2xs transition-all"
          aria-label="Notifications"
        >
          <Bell className="size-3.5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-amber-500 ring-2 ring-background" />
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-80 rounded-xl p-0 shadow-xl ring-1 ring-foreground/10 bg-popover overflow-hidden"
      >
        {/* Clean Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-tight text-foreground">
              Notifications
            </span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tabular text-amber-600 dark:text-amber-400">
                {unreadCount}
              </span>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="max-h-76 overflow-y-auto">
          {hasNotifications ? (
            <div className="p-1.5 space-y-1.5">
              {/* Pending Telegram 2FA Actions */}
              {actions.map((act) => (
                <div
                  key={act.id}
                  className="flex items-start gap-2.5 rounded-lg p-2.5 text-xs transition-colors hover:bg-muted/50 bg-muted/20 border border-border/40"
                >
                  <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <ShieldAlert className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-medium text-foreground text-xs leading-snug">
                      {act.summary}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="size-2.5 text-muted-foreground/70" />
                        {ago(act.createdAt)}
                      </span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        Telegram 2FA →
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Uncollected LP Fees */}
              {uncollectedFees > 0.5 && (
                <Link
                  href="/liquidity"
                  onClick={() => setOpen(false)}
                  className="group flex items-center justify-between rounded-lg p-2.5 text-xs transition-colors hover:bg-muted/50 bg-muted/20 border border-border/40"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Coins className="size-3.5" />
                    </div>
                    <div className="font-semibold text-foreground text-xs">
                      +{usd(uncollectedFees)} Fees Ready
                    </div>
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                    Collect →
                  </span>
                </Link>
              )}
            </div>
          ) : (
            /* Clean Minimal Empty State */
            <div className="py-8 text-center select-none">
              <p className="text-xs text-muted-foreground">No notifications</p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
