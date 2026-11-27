'use client';

// Every write carries the CSRF token /api/session hands out, plus an
// idempotency key so a retry after a timeout cannot spend money twice.

let csrf = '';
let authToken = '';

export const setCsrf = (token: string): void => {
  csrf = token;
};

export const setAuthToken = (token: string): void => {
  authToken = token;
  try {
    if (typeof window !== 'undefined') {
      if (token) {
        sessionStorage.setItem('invictus_auth_token', token);
      } else {
        sessionStorage.removeItem('invictus_auth_token');
      }
    }
  } catch {}
};

export const getAuthToken = (): string => {
  if (authToken) return authToken;
  try {
    if (typeof window !== 'undefined') {
      authToken = sessionStorage.getItem('invictus_auth_token') || '';
      return authToken;
    }
  } catch {}
  return '';
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const parse = async (res: Response): Promise<unknown> => {
  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text.slice(0, 120) };
    }
  }
  if (!res.ok) {
    const message =
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error: unknown }).error)
        : `request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return body;
};

const isMutationPath = (path: string): boolean => {
  const mutating = [
    '/api/open',
    '/api/close',
    '/api/close-all',
    '/api/collect',
    '/api/collect-all',
    '/api/add',
    '/api/withdraw',
    '/api/wallets/create',
    '/api/wallets/import',
  ];
  return mutating.some((m) => path.startsWith(m));
};

const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });

export const get = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;

  let res = await fetch(path, {
    credentials: 'same-origin',
    signal,
    headers: Object.keys(headers).length ? headers : undefined,
  });
  if (res.status === 429 && !signal?.aborted) {
    const retryHeader = res.headers.get('retry-after');
    const waitMs = Math.min(Math.max(Number(retryHeader) * 1000 || 800, 500), 2500);
    try {
      await delay(waitMs, signal);
      res = await fetch(path, {
        credentials: 'same-origin',
        signal,
        headers: Object.keys(headers).length ? headers : undefined,
      });
    } catch {}
  }
  return (await parse(res)) as T;
};

export const post = async <T>(
  path: string,
  body: unknown = {},
  idempotencyKey?: string,
  signal?: AbortSignal,
): Promise<T> => {
  const token = getAuthToken();
  const doFetch = () =>
    fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-csrf': csrf,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });

  let res = await doFetch();
  if (res.status === 429 && !isMutationPath(path) && !signal?.aborted) {
    const retryHeader = res.headers.get('retry-after');
    const waitMs = Math.min(Math.max(Number(retryHeader) * 1000 || 800, 500), 2500);
    try {
      await delay(waitMs, signal);
      res = await doFetch();
    } catch {}
  }
  return (await parse(res)) as T;
};

export const newIdempotencyKey = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export interface Me {
  userId: number;
  isAdmin: boolean;
  username?: string | null;
  firstName?: string | null;
  photoUrl?: string | null;
  customRpcEnabled?: boolean;
}

import { formatExplorerUrl, setServerDefaultExplorerUrl } from './explorer';

/** The chain's active block explorer: supports paths like /token/0x..., /address/0x..., /tx/0x..., or raw addresses/hashes */
export const explorerUrl = (target: string): string => formatExplorerUrl(target);

/**
 * Inside Telegram the identity arrives in the URL hash, already signed with the
 * bot token. Everywhere else the cookie is expected to exist already, from the
 * one-time link the bot sends.
 */
interface TgUser {
  id?: number;
  username?: string;
  first_name?: string;
  photo_url?: string;
}

export const signIn = async (signal?: AbortSignal): Promise<Me | null> => {
  let tgUser: TgUser | null = null;
  const hash =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.hash.replace(/^#/, ''))
      : new URLSearchParams();
  let initData = hash.get('tgWebAppData') || '';

  let tgApp =
    typeof window !== 'undefined'
      ? (
          window as unknown as {
            Telegram?: {
              WebApp?: {
                initData?: string;
                initDataUnsafe?: { user?: TgUser | null };
                ready?: () => void;
                expand?: () => void;
              };
            };
          }
        )?.Telegram?.WebApp
      : undefined;

  // If inside Telegram but telegram-web-app.js is still loading asynchronously, wait briefly
  if (typeof window !== 'undefined' && !initData && !tgApp) {
    for (let i = 0; i < 6 && !(window as any)?.Telegram?.WebApp; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    tgApp = (
      window as unknown as {
        Telegram?: {
          WebApp?: {
            initData?: string;
            initDataUnsafe?: { user?: TgUser | null };
            ready?: () => void;
            expand?: () => void;
          };
        };
      }
    )?.Telegram?.WebApp;
  }

  if (tgApp) {
    try {
      tgApp.ready?.();
      tgApp.expand?.();
    } catch {}
    if (!initData && tgApp.initData) {
      initData = tgApp.initData;
    }
    if (tgApp.initDataUnsafe?.user) {
      const u = tgApp.initDataUnsafe.user;
      tgUser = { ...(tgUser || {}), ...(u || {}) };
      try {
        sessionStorage.setItem('invictus_tg_user', JSON.stringify(tgUser));
      } catch {}
    }
  } else if (!tgUser && typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem('invictus_tg_user');
      if (stored) tgUser = JSON.parse(stored);
    } catch {}
  }

  if (initData) {
    try {
      const parsed = new URLSearchParams(initData);
      const rawUser = parsed.get('user');
      if (rawUser) {
        const u = JSON.parse(rawUser) as TgUser;
        tgUser = { ...(tgUser || {}), ...(u || {}) };
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem('invictus_tg_user', rawUser);
          } catch {}
        }
      }
      const authRes = await post<{ ok: boolean; csrf: string; token?: string }>(
        '/api/auth/telegram',
        { initData },
        undefined,
        signal,
      );
      setCsrf(authRes.csrf);
      if (authRes.token) setAuthToken(authRes.token);

      if (typeof window !== 'undefined') {
        try {
          window.history.replaceState(window.history.state, '', window.location.pathname);
        } catch {}
      }
    } catch {
      // An expired initData is not a dead end if a session cookie already exists.
    }
  }

  try {
    const sessionController = new AbortController();
    const timeoutId = setTimeout(() => sessionController.abort(), 4000);
    const combinedSignal = signal
      ? (AbortSignal.any ? AbortSignal.any([signal, sessionController.signal]) : signal)
      : sessionController.signal;

    try {
      const s = await get<Me & { csrf: string; explorer?: string }>('/api/session', combinedSignal);
      clearTimeout(timeoutId);
      setCsrf(s.csrf);
      if (s.explorer) {
        setServerDefaultExplorerUrl(s.explorer);
      }
      return {
        userId: s.userId,
        isAdmin: s.isAdmin,
        username: s.username ?? tgUser?.username ?? null,
        firstName: s.firstName ?? tgUser?.first_name ?? null,
        photoUrl: tgUser?.photo_url ?? s.photoUrl ?? '/api/avatar',
        customRpcEnabled: s.customRpcEnabled === true,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return null;
  }
};
