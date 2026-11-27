'use client';

import * as React from 'react';
import Link from 'next/link';
import { LogOut, Settings2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { THEME_PRESETS, applyThemePreset, getSavedThemePreset, type ThemePreset } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useSession } from './session';

export function UserProfileMenu() {
  const { me } = useSession();
  const [preset, setPreset] = React.useState<ThemePreset>('default');

  React.useEffect(() => {
    const saved = getSavedThemePreset();
    setPreset(saved);
    applyThemePreset(saved);
  }, []);

  const selectPreset = (p: ThemePreset) => {
    setPreset(p);
    applyThemePreset(p);
    const label = THEME_PRESETS.find((item) => item.value === p)?.label ?? p;
    toast.success(`Theme set to ${label}`);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {
      // ignore network errors on signout
    }
    toast.success('Signed out successfully');
    window.location.href = '/discover';
  };

  const tgUsername = me?.username ? `@${me.username}` : null;
  const tgDisplayName = me?.firstName ?? tgUsername ?? (me ? `User #${me.userId}` : 'Account');
  const userInitials = me?.firstName
    ? me.firstName.slice(0, 2).toUpperCase()
    : me?.username
      ? me.username.slice(0, 2).toUpperCase()
      : me
        ? String(me.userId).slice(-2)
        : 'IN';
  const photoUrl = me?.photoUrl ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group relative flex size-9 items-center justify-center rounded-xl border border-input/60 overflow-hidden bg-card/80 p-0 text-foreground ring-1 ring-foreground/5 shadow-2xs hover:border-input/90 hover:ring-foreground/15 transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          aria-label="User Profile and Theme"
        >
          <Avatar className="size-full rounded-[inherit] after:hidden">
            {photoUrl && (
              <AvatarImage
                src={photoUrl}
                alt={tgDisplayName}
                className="size-full rounded-[inherit] object-cover"
              />
            )}
            <AvatarFallback className="size-full rounded-[inherit] bg-primary/10 text-xs font-bold text-primary flex items-center justify-center">
              {userInitials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-72 rounded-xl p-0 shadow-xl ring-1 ring-foreground/10 bg-popover overflow-hidden"
      >
        {/* User Identity Header */}
        <div className="flex items-center gap-3 p-3.5 border-b border-border/40 bg-muted/20">
          <Avatar className="size-9 rounded-xl after:hidden ring-1 ring-foreground/10 shrink-0 overflow-hidden">
            {photoUrl && (
              <AvatarImage
                src={photoUrl}
                alt={tgDisplayName}
                className="size-full rounded-xl object-cover"
              />
            )}
            <AvatarFallback className="size-full bg-primary/10 text-xs font-bold text-primary flex items-center justify-center">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="truncate font-semibold text-sm text-foreground">
                {tgDisplayName}
              </span>
              {me?.isAdmin && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  Admin
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {tgUsername ? (
                <span className="font-medium text-foreground/85">{tgUsername}</span>
              ) : (
                <span className="font-mono">User #{me?.userId ?? '—'}</span>
              )}
            </div>
          </div>
        </div>

        {/* Theme Selection (4 Themes, tanpa toggle dark mode) */}
        <div className="px-3.5 py-2.5 border-b border-border/40 bg-card/40 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Theme</span>
          <div className="flex items-center gap-2">
            {THEME_PRESETS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => selectPreset(item.value)}
                title={item.label}
                className={cn(
                  'size-4.5 rounded-full transition-all flex items-center justify-center border cursor-pointer',
                  preset === item.value
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background border-transparent scale-110'
                    : 'border-foreground/15 hover:scale-110 opacity-70 hover:opacity-100',
                )}
                style={{ backgroundColor: item.color }}
              />
            ))}
          </div>
        </div>

        {/* Navigation Actions: Settings, Admin (if role), and Logout */}
        <div className="p-1.5 space-y-0.5">
          <DropdownMenuItem asChild className="text-[13px] cursor-pointer rounded-lg px-3 py-2 focus:bg-accent focus:text-accent-foreground">
            <Link href="/settings" className="flex items-center gap-2.5 w-full">
              <Settings2 className="size-4 text-muted-foreground" />
              <span>Settings</span>
            </Link>
          </DropdownMenuItem>

          {me?.isAdmin && (
            <DropdownMenuItem asChild className="text-[13px] cursor-pointer rounded-lg px-3 py-2 text-amber-600 dark:text-amber-400 focus:bg-amber-500/10 focus:text-amber-500 font-medium">
              <Link href="/admin" className="flex items-center gap-2.5 w-full">
                <Shield className="size-4" />
                <span>Admin</span>
              </Link>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={() => void handleLogout()}
            className="text-[13px] cursor-pointer rounded-lg px-3 py-2 text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 focus:bg-rose-500/10 focus:text-rose-500 transition-colors"
          >
            <div className="flex items-center gap-2.5 w-full">
              <LogOut className="size-4" />
              <span>Log out</span>
            </div>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
