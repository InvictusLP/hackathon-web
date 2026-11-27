import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  BLOCK_EXPLORERS,
  DEFAULT_EXPLORER_ID,
  EXPLORER_OPTIONS,
  formatExplorerUrl,
} from './explorer';

test('block explorer configuration and preference order', () => {
  assert.equal(DEFAULT_EXPLORER_ID, 'rh-scan');
  assert.equal(EXPLORER_OPTIONS.length, 3);
  assert.equal(EXPLORER_OPTIONS[0]?.id, 'rh-scan');
  assert.equal(EXPLORER_OPTIONS[1]?.id, 'robinscan');
  assert.equal(EXPLORER_OPTIONS[2]?.id, 'blockscout');

  assert.equal(BLOCK_EXPLORERS['rh-scan'].baseUrl, 'https://rh-scan.com');
  assert.equal(BLOCK_EXPLORERS['robinscan'].baseUrl, 'https://robinscan.io');
  assert.equal(BLOCK_EXPLORERS['blockscout'].baseUrl, 'https://robinhoodchain.blockscout.com');
});

test('formatExplorerUrl generates correct paths for rh-scan', () => {
  const addr = '0x1234567890123456789012345678901234567890';
  const tx = '0x' + 'a'.repeat(64);

  assert.equal(formatExplorerUrl(`/address/${addr}`, 'rh-scan'), `https://rh-scan.com/address/${addr}`);
  assert.equal(formatExplorerUrl(`/token/${addr}`, 'rh-scan'), `https://rh-scan.com/token/${addr}`);
  assert.equal(formatExplorerUrl(`/token/${addr}?a=42`, 'rh-scan'), `https://rh-scan.com/token/${addr}?a=42`);
  assert.equal(formatExplorerUrl(`/tx/${tx}`, 'rh-scan'), `https://rh-scan.com/tx/${tx}`);
  assert.equal(formatExplorerUrl('/block/64033282', 'rh-scan'), 'https://rh-scan.com/block/64033282');

  // Auto-detection
  assert.equal(formatExplorerUrl(addr, 'rh-scan'), `https://rh-scan.com/token/${addr}`);
  assert.equal(formatExplorerUrl(tx, 'rh-scan'), `https://rh-scan.com/tx/${tx}`);
});

test('formatExplorerUrl generates correct paths for robinscan', () => {
  const addr = '0x1234567890123456789012345678901234567890';
  const tx = '0x' + 'b'.repeat(64);

  assert.equal(formatExplorerUrl(`/address/${addr}`, 'robinscan'), `https://robinscan.io/address/${addr}`);
  assert.equal(formatExplorerUrl(`/token/${addr}`, 'robinscan'), `https://robinscan.io/token/${addr}`);
  assert.equal(formatExplorerUrl(`/token/${addr}?a=99`, 'robinscan'), `https://robinscan.io/token/${addr}?a=99`);
  assert.equal(formatExplorerUrl(`/tx/${tx}`, 'robinscan'), `https://robinscan.io/tx/${tx}`);
  assert.equal(formatExplorerUrl('/block/64033282', 'robinscan'), 'https://robinscan.io/block/64033282');
});

test('formatExplorerUrl generates correct paths for blockscout', () => {
  const addr = '0x1234567890123456789012345678901234567890';
  const tx = '0x' + 'c'.repeat(64);

  assert.equal(formatExplorerUrl(`/address/${addr}`, 'blockscout'), `https://robinhoodchain.blockscout.com/address/${addr}`);
  assert.equal(formatExplorerUrl(`/token/${addr}`, 'blockscout'), `https://robinhoodchain.blockscout.com/token/${addr}`);
  assert.equal(formatExplorerUrl(`/token/${addr}?a=77`, 'blockscout'), `https://robinhoodchain.blockscout.com/token/${addr}?a=77`);
  assert.equal(formatExplorerUrl(`/tx/${tx}`, 'blockscout'), `https://robinhoodchain.blockscout.com/tx/${tx}`);
  assert.equal(formatExplorerUrl('/block/64033282', 'blockscout'), 'https://robinhoodchain.blockscout.com/block/64033282');
});

test('formatExplorerUrl handles absolute URLs and edge cases gracefully', () => {
  assert.equal(formatExplorerUrl('https://custom.link/foo', 'rh-scan'), 'https://custom.link/foo');
  assert.equal(formatExplorerUrl('', 'rh-scan'), 'https://rh-scan.com');
});
