'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError =
    error?.name === 'ChunkLoadError' ||
    Boolean(error?.message && /failed to load chunk|loading chunk/i.test(error.message));

  const errorCode = error?.digest || (isChunkError ? 'ERR_CHUNK' : error?.name || '500');

  useEffect(() => {
    console.error('Invictus Client Error Boundary caught error:', error);
    if (typeof window !== 'undefined') {
      const isPoolNav = window.location.pathname.startsWith('/pool/');
      if (isChunkError || isPoolNav) {
        const storageKey = isChunkError ? 'invictus:chunk_reload' : 'invictus:pool_nav_retry';
        const lastReload = sessionStorage.getItem(storageKey);
        const now = Date.now();
        if (!lastReload || now - Number(lastReload) > 8_000) {
          sessionStorage.setItem(storageKey, String(now));
          window.location.reload();
        }
      }
    }
  }, [error, isChunkError]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-center select-none py-16 space-y-3">
      <p className="text-sm text-muted-foreground">
        {isChunkError ? 'Application update available' : `Failed to load page (${errorCode})`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (isChunkError && typeof window !== 'undefined') {
              window.location.reload();
            } else {
              reset();
            }
          }}
          className="h-7 text-xs cursor-pointer"
        >
          {isChunkError ? 'Reload' : 'Retry'}
        </Button>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <Link href="/discover">Discover</Link>
        </Button>
      </div>
    </div>
  );
}
