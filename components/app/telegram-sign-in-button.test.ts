import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { TELEGRAM_BOT_USERNAME, TELEGRAM_LOGIN_URL } from './telegram-sign-in-button';

describe('telegram-sign-in-button', () => {
  test('points to @lpinvictus_bot with /web pre-filled', () => {
    assert.equal(TELEGRAM_BOT_USERNAME, 'lpinvictus_bot');
    const url = new URL(TELEGRAM_LOGIN_URL);
    assert.equal(url.origin, 'https://t.me');
    assert.equal(url.pathname, '/lpinvictus_bot');
    assert.equal(url.searchParams.get('text'), '/web');
  });
});
