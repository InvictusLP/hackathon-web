import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const StatCard = ({
  icon: Icon,
  label,
  value,
  sub,
  delta,
  deltaLabel,
  valueClass,
}: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  sub?: string;
  /** Signed percentage. Renders a badge with an arrow, never colour alone. */
  delta?: number | null;
  deltaLabel?: string;
  valueClass?: string;
}) => (
  <Card className="rounded-xl border border-border/70 bg-card/50 shadow-xs ring-0 flex flex-col justify-between h-full min-h-[104px] sm:min-h-[112px] p-3.5 sm:p-4">
    <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0 p-0">
      <CardDescription className="text-xs font-medium text-muted-foreground">{label}</CardDescription>
      {Icon && (
        <CardAction className="p-0">
          <Icon className="size-3.5 text-muted-foreground/80" />
        </CardAction>
      )}
    </CardHeader>
    <CardContent className="flex flex-1 flex-col justify-between gap-1 p-0 pt-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <div className={cn('font-mono font-bold text-lg sm:text-xl tabular-nums leading-tight tracking-tight', valueClass)}>
          {value}
        </div>
        {delta !== null && delta !== undefined && Math.abs(delta) > 0.0001 && (
          <Badge
            variant="outline"
            className={cn(
              'tabular flex items-center gap-1 text-[11px] font-medium py-0.5 px-1.5 font-mono',
              delta > 0
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-destructive/30 bg-destructive/10 text-destructive',
            )}
          >
            {delta > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {deltaLabel ?? `${delta > 0 ? '+' : ''}${delta.toFixed(2)}%`}
          </Badge>
        )}
      </div>

      {sub && (
        <p className="text-muted-foreground text-xs font-mono truncate mt-0.5">
          {sub}
        </p>
      )}
    </CardContent>
  </Card>
);

