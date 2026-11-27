import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton matching the PageHeader component layout.
 * Used inside `loading.tsx` files for instant route transition feedback.
 */
export const PageHeaderSkeleton = ({
  titleWidth = 'w-36',
  descriptionWidth = 'w-64',
  showAction = false,
  actionWidth = 'w-28',
}: {
  titleWidth?: string;
  descriptionWidth?: string;
  showAction?: boolean;
  actionWidth?: string;
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-border/40 mb-2">
    <div className="flex flex-col gap-1.5">
      <Skeleton className={`h-7 ${titleWidth} rounded-lg`} />
      <Skeleton className={`h-4 ${descriptionWidth} rounded`} />
    </div>
    {showAction && <Skeleton className={`h-9 ${actionWidth} rounded-xl`} />}
  </div>
);

