import type { NextConfig } from 'next';

/**
 * Standalone server (`next start`). The browser only ever talks to this origin:
 * `/api/*` and the login exchange are proxied to the backend, so the session
 * cookie and CSRF stay same-origin and the backend needs no CORS.
 *
 * Rewrites are baked in at build time, so BACKEND_ORIGIN has to be set for
 * `next build`, not only for `next start`.
 */
const dev = process.env.NODE_ENV === 'development';
const API = (process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');

// Old URLs the bot and earlier builds link to.
const ALIASES: Record<string, string> = {
  '/webapp': '/',
  '/tg': '/',
  '/activity': '/portfolio',
  '/calendar': '/portfolio',
  '/wallet': '/portfolio',
  '/pnl': '/portfolio',
  '/pnl/calendar': '/portfolio',
  '/portfolio/calendar': '/portfolio',
  '/portfolio/wallet': '/portfolio',
  '/portfolio/pnl': '/portfolio',
  '/positions': '/liquidity',
  '/portfolio/positions': '/liquidity',
};

const nextConfig: NextConfig = {
  trailingSlash: false,
  images: { unoptimized: true },
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  compiler: {
    removeConsole: !dev ? { exclude: ['error', 'warn'] } : false,
  },
  experimental: {
    // Proxied requests die after 30s of silence by default; a mint or close waits on the chain longer than that.
    proxyTimeout: 300_000,
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'radix-ui',
      '@radix-ui/react-dialog',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
    ],
  },
  rewrites: async () => ({
    beforeFiles: [
      // The Telegram login link: the backend spends the nonce, sets the cookie, redirects to `/`.
      { source: '/', has: [{ type: 'query', key: 'n' }], destination: `${API}/` },
      { source: '/api/:path*', destination: `${API}/api/:path*` },
      { source: '/denied.css', destination: `${API}/denied.css` },
      { source: '/healthz', destination: `${API}/healthz` },
    ],
    afterFiles: Object.entries(ALIASES).map(([source, destination]) => ({ source, destination })),
    fallback: [],
  }),
  // The session cookie is bound to 127.0.0.1 in dev, so dev is browsed there too.
  ...(dev ? { allowedDevOrigins: ['127.0.0.1', 'localhost'] } : {}),
};

export default nextConfig;
