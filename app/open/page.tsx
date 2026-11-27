'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TerminalSkeleton } from '@/components/app/terminal-skeleton';

function OpenRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const rawPool = searchParams.get('pool') || searchParams.get('canonicalId') || searchParams.get('id');
    const rawToken = searchParams.get('token') || searchParams.get('ca') || searchParams.get('address');
    const chain = searchParams.get('chain') || searchParams.get('network') || 'robinhood';

    if (rawPool) {
      const cleanPool = rawPool.replace(/\.(txt|html|rsc|json)$/i, '');
      router.replace(`/pool/${chain}/${cleanPool}`);
    } else if (rawToken) {
      router.replace(`/pool/${chain}/default?token=${encodeURIComponent(rawToken)}`);
    } else {
      router.replace('/discover');
    }
  }, [router, searchParams]);

  return <TerminalSkeleton />;
}

export default function OpenPage() {
  return (
    <Suspense fallback={<TerminalSkeleton />}>
      <OpenRedirect />
    </Suspense>
  );
}
