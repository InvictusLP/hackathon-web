'use client';

import { useSnapshot } from '@/components/app/live';
import { fiat } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface FiatProps {
  usd: number | null | undefined;
  className?: string;
  signed?: boolean;
}

export const Fiat = ({ usd, className, signed = false }: FiatProps) => {
  const snap = useSnapshot();
  const fx = snap?.fx;
  if (!fx || usd === null || usd === undefined || !Number.isFinite(usd)) {
    return null;
  }
  return (
    <span className={cn('text-muted-foreground font-normal', className)}>
      {fiat(usd, fx, signed)}
    </span>
  );
};
