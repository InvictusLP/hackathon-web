import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/components/app/providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Discover | Invictus',
    template: '%s | Invictus',
  },
  description: 'Concentrated liquidity on Robinhood Chain.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0b0d12',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const RootLayout = async ({ children }: { children: React.ReactNode }) => {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html
      lang="en"
      className="dark"
      style={{ colorScheme: 'dark', backgroundColor: '#0b0d12' }}
      suppressHydrationWarning
    >
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js" async nonce={nonce} />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen bg-background text-foreground bg-[#0b0d12] text-[#f8fafc]`}
      >
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
};

export default RootLayout;
