import { NextResponse, type NextRequest } from 'next/server';

const dev = process.env.NODE_ENV === 'development';

export const proxy = (request: NextRequest): NextResponse => {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob:",
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    "font-src 'self'",
    'frame-src https://dexscreener.com',
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    'frame-ancestors https://web.telegram.org https://*.telegram.org https://telegram.org',
  ].join('; ');

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
};

export const config = {
  matcher: [
    {
      source: '/((?!api/|_next/static|_next/image|favicon|apple-touch-icon|site.webmanifest|denied.css|healthz).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
