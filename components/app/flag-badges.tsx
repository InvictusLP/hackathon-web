'use client';

import { AlertTriangle, FishingHook, Info, OctagonAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { flagInfo, loudFlags, type Severity } from '@/lib/flags';
import { cn } from '@/lib/utils';

/**
 * Pool flags, each one explainable.
 *
 * A badge nobody can decode is just decoration, and the ones here decide whether
 * money is safe. Tapping any of them says what was measured and what it costs.
 */

const TONE: Record<Severity, string> = {
  blocking: 'text-destructive border-destructive/40',
  warning: 'text-amber-500 border-amber-500/30',
  info: 'text-muted-foreground border-border',
};

const ICON = { blocking: OctagonAlert, warning: AlertTriangle, info: Info };

const FLAG_ICONS: Record<string, typeof FishingHook> = {
  HOOK: FishingHook,
};

const FLAG_TONES: Record<string, string> = {
  HOOK: 'text-muted-foreground border-amber-400/80 bg-muted/25',
};

export const FlagBadges = ({ flags }: { flags: string[] }) => {
  const shown = loudFlags(flags);
  if (!shown.length) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((flag) => {
        const info = flagInfo(flag);
        const toneClass = FLAG_TONES[flag] ?? TONE[info.severity];
        const Icon = FLAG_ICONS[flag] ?? (info.emoji ? null : ICON[info.severity]);
        const DialogIcon = FLAG_ICONS[flag] ?? ICON[info.severity];
        const isHook = flag === 'HOOK';
        return (
          <Dialog key={flag}>
            <DialogTrigger asChild>
              {isHook ? (
                <button
                  type="button"
                  aria-label={`What ${info.label} means`}
                  className="inline-flex items-center gap-1 h-5 px-2 rounded-4xl bg-muted/25 text-muted-foreground hover:text-foreground border border-amber-400/80 hover:border-amber-300 font-mono text-xs transition-all cursor-pointer shadow-2xs"
                >
                  <FishingHook className="size-3 text-amber-400/90 shrink-0" />
                  <span>Hook</span>
                </button>
              ) : (
                <button type="button" aria-label={`What ${info.label} means`}>
                  <Badge variant="outline" className={cn('cursor-pointer gap-1', toneClass)}>
                    {Icon ? <Icon className="size-3" /> : info.emoji ? <span aria-hidden>{info.emoji}</span> : null}
                    {info.label}
                  </Badge>
                </button>
              )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DialogIcon className={cn('size-4', isHook ? 'text-amber-400/90' : toneClass.split(' ')[0])} />
                  {info.label}
                </DialogTitle>
                <DialogDescription>{info.what}</DialogDescription>
              </DialogHeader>
              {info.why && <p className="text-sm leading-relaxed">{info.why}</p>}
              <p className="text-muted-foreground text-xs">
                {info.severity === 'blocking'
                  ? 'Opening here is refused unless you turn on "Allow risky pools" in Settings.'
                  : 'This does not stop you opening a position.'}
              </p>
            </DialogContent>
          </Dialog>
        );
      })}
    </div>
  );
};
