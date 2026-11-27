'use client';

import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import type { ReactNode } from 'react';
import { SessionProvider, useSession } from './session';
import { Shell } from './shell';
import { useGas, useLive } from '@/lib/use-live';
import { LiveProvider } from './live';
import { NetworkProvider } from '@/lib/network';

import { PageTitleSync } from './page-title';
import { TelegramSignInButton } from './telegram-sign-in-button';

const Gate = ({ children }: { children: ReactNode }) => {
  const { me, ready } = useSession();
  // The streams stay closed until there is a session, so a signed-out tab does
  // not sit there reconnecting to an endpoint that will keep refusing it.
  const live = useLive(Boolean(me));
  const gas = useGas(Boolean(me));

  if (!ready) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="font-mono text-xs tracking-wider uppercase text-muted-foreground/80">Connecting...</span>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <TelegramSignInButton />
      </div>
    );
  }

  return (
    <LiveProvider value={live} gas={gas}>
      <NetworkProvider>
        <Shell gas={gas} connected={live.connected} snap={live.snap}>
          {children}
        </Shell>
      </NetworkProvider>
    </LiveProvider>
  );
};

export const Providers = ({ children, nonce }: { children: ReactNode; nonce?: string }) => (
  <ThemeProvider nonce={nonce} attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false} disableTransitionOnChange>
    <TooltipProvider delayDuration={200}>
      <SessionProvider>
        <Gate>{children}</Gate>
      </SessionProvider>
      <PageTitleSync />
      <Toaster position="top-center" offset="8px" />
    </TooltipProvider>
  </ThemeProvider>
);
