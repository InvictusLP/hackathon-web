'use client';

export const TELEGRAM_BOT_USERNAME = 'lpinvictus_bot';
export const TELEGRAM_LOGIN_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}?text=%2Fweb`;

const TelegramLogo = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z" />
  </svg>
);

/**
 * Official Telegram-styled sign-in button linking to @lpinvictus_bot with
 * `/web` pre-filled so the user can request a one-time web login link.
 */
export const TelegramSignInButton = () => (
  <a
    href={TELEGRAM_LOGIN_URL}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#54A9EB] px-5 text-sm font-medium text-white transition-colors hover:bg-[#429CE3] active:bg-[#368FD6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54A9EB] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  >
    <TelegramLogo className="size-4.5 shrink-0" />
    <span>Sign in with Telegram</span>
  </a>
);
