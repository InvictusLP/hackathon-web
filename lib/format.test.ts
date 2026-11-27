import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { compactUsd, usd } from './format';

describe('format.ts precision & trailing zero truncation', () => {
  test('compactUsd: 2 decimal places precision, omitting trailing .00', () => {
    assert.equal(compactUsd(102_020_000), '$102.02M');
    assert.equal(compactUsd(54_300), '$54.30k');
    assert.equal(compactUsd(100_000_000), '$100M');
    assert.equal(compactUsd(1_000_000_000), '$1B');
    assert.equal(compactUsd(1_000_000_000_000), '$1T');
    assert.equal(compactUsd(1_250_000_000_000), '$1.25T');
    assert.equal(compactUsd(999_999), '$1M');
    assert.equal(compactUsd(0), '-');
    assert.equal(compactUsd(-10), '-');
    assert.equal(compactUsd(null), '-');
    assert.equal(compactUsd(undefined), '-');
  });

  test('usd: 2 decimal places precision, omitting .00 when >= 1', () => {
    assert.equal(usd(12.5), '$12.50');
    assert.equal(usd(12.0), '$12');
    assert.equal(usd(1.0), '$1');
    assert.equal(usd(1.05), '$1.05');
    assert.equal(usd(100_000_000), '$100M');
    assert.equal(usd(1_000_000_000), '$1B');
    assert.equal(usd(0), '$0');
    assert.equal(usd(null), '-');
    assert.equal(usd(undefined), '-');
    assert.equal(usd(0.5), '$0.50');
    assert.equal(usd(0.05), '$0.0500');
  });
});
