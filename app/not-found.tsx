'use client';

import { usePathname } from 'next/navigation';
import WorkstationView from '@/components/app/workstation-view';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const pathname = usePathname() || (typeof window !== 'undefined' ? window.location.pathname : '');

  // Seamless fallback for clean pool workstation URLs: /pool/<chain>/<pool>
  if (pathname.startsWith('/pool/') || pathname.startsWith('/pools/')) {
    return <WorkstationView />;
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-center select-none py-16 space-y-3">
      <p className="text-sm text-muted-foreground">Page not found (404)</p>
      <div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-7 text-xs cursor-pointer"
        >
          <Link href="/discover">Discover pools</Link>
        </Button>
      </div>
    </div>
  );
}
