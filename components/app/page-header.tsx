import type { ReactNode } from 'react';

export const PageHeader = ({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-border/40 mb-2">
    <div className="flex flex-col gap-0.5">
      <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      {description && <p className="text-muted-foreground text-xs">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">{actions}</div>}
  </div>
);
