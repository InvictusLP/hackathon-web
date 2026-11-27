import { Suspense } from 'react';
import WorkstationView from '@/components/app/workstation-view';
import { TerminalSkeleton } from '@/components/app/terminal-skeleton';

export default function PoolPage() {
  return (
    <Suspense fallback={<TerminalSkeleton />}>
      <WorkstationView />
    </Suspense>
  );
}


