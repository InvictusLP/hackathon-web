'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { signIn, type Me } from '@/lib/api';

interface SessionState {
  me: Me | null;
  ready: boolean;
}

const SESSION_CACHE_KEY = 'invictus:session';

const Ctx = createContext<SessionState>({ me: null, ready: false });

export const useSession = (): SessionState => useContext(Ctx);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<SessionState>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem(SESSION_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed.id === 'number') {
            return { me: parsed, ready: true };
          }
        }
      } catch {}
    }
    return { me: null, ready: false };
  });

  // Strip ?n= from URL history so Back button doesn't revisit a spent nonce
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('n')) {
        url.searchParams.delete('n');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash || '/');
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    signIn(controller.signal)
      .then((me) => {
        if (mounted) {
          setState({ me, ready: true });
          if (me) {
            try {
              sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(me));
            } catch {}
          } else {
            try {
              sessionStorage.removeItem(SESSION_CACHE_KEY);
            } catch {}
          }
        }
      })
      .catch((err) => {
        console.error('Session initialization error:', err);
        if (mounted) {
          setState((prev) => (prev.me ? prev : { me: null, ready: true }));
        }
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
};
