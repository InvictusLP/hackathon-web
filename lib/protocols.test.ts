import assert from 'node:assert/strict';
import { test } from 'vitest';
import { BOT_CHAIN_IDS, getChainFundingOptions, getProtocolPoolUrl, parseProtocol, resolveChainId, resolveChainSlug } from './protocols';

test('parseProtocol extracts id, version and display names correctly', () => {
  const v4 = parseProtocol('uniswap_v4');
  assert.equal(v4.id, 'uniswap');
  assert.equal(v4.name, 'Uniswap');
  assert.equal(v4.version, 'v4');
  assert.equal(v4.displayName, 'Uniswap V4');

  const v3 = parseProtocol('uniswap_v3');
  assert.equal(v3.id, 'uniswap');
  assert.equal(v3.version, 'v3');
  assert.equal(v3.displayName, 'Uniswap V3');

  const ramses = parseProtocol('ramses_v3');
  assert.equal(ramses.id, 'ramses');
  assert.equal(ramses.name, 'Ramses');
  assert.equal(ramses.displayName, 'Ramses V3');

  const pancake = parseProtocol('pancake_v3');
  assert.equal(pancake.id, 'pancakeswap');
  assert.equal(pancake.name, 'PancakeSwap');

  const sushi = parseProtocol('sushi_v3');
  assert.equal(sushi.id, 'sushiswap');
  assert.equal(sushi.name, 'SushiSwap');

  const fallback = parseProtocol('', 'v4');
  assert.equal(fallback.id, 'uniswap');
  assert.equal(fallback.version, 'v4');
});

test('resolveChainSlug converts chain IDs and slugs accurately', () => {
  assert.equal(resolveChainSlug(4663), 'robinhood');
  assert.equal(resolveChainSlug('4663'), 'robinhood');
  assert.equal(resolveChainSlug(1), 'ethereum');
  assert.equal(resolveChainSlug(8453), 'base');
  assert.equal(resolveChainSlug(42161), 'arbitrum');
  assert.equal(resolveChainSlug(10), 'optimism');
  assert.equal(resolveChainSlug(137), 'polygon');
  assert.equal(resolveChainSlug(56), 'bnb');
  assert.equal(resolveChainSlug(undefined), 'robinhood');
  assert.equal(resolveChainSlug(null), 'robinhood');
  assert.equal(resolveChainSlug(''), 'robinhood');
  assert.equal(resolveChainSlug('arbitrum'), 'arbitrum');
});

test('getProtocolPoolUrl formats Uniswap v4 (66-char poolId) and v3 (42-char address) URLs on Robinhood chain', () => {
  // Uniswap v4 bytes32 poolId example
  const v4PoolId = '0x4be9657ec9002e528f4f17a5c43edc525a07f888f7b180c2afbf75e096c4f38a';
  assert.equal(
    getProtocolPoolUrl('uniswap_v4', v4PoolId),
    'https://app.uniswap.org/explore/pools/robinhood/0x4be9657ec9002e528f4f17a5c43edc525a07f888f7b180c2afbf75e096c4f38a',
  );

  // Uniswap v3 42-character pool address example
  const v3PoolId = '0x10cc6bd38112cac182db90b6a71d8bb5939526ba';
  assert.equal(
    getProtocolPoolUrl('uniswap_v3', v3PoolId),
    'https://app.uniswap.org/explore/pools/robinhood/0x10cc6bd38112cac182db90b6a71d8bb5939526ba',
  );

  // Passing numeric chain ID 4663
  assert.equal(
    getProtocolPoolUrl('uniswap_v4', v4PoolId, 4663),
    'https://app.uniswap.org/explore/pools/robinhood/0x4be9657ec9002e528f4f17a5c43edc525a07f888f7b180c2afbf75e096c4f38a',
  );

  // Passing Base chain ID 8453
  assert.equal(
    getProtocolPoolUrl('uniswap_v3', v3PoolId, 8453),
    'https://app.uniswap.org/explore/pools/base/0x10cc6bd38112cac182db90b6a71d8bb5939526ba',
  );

  // Case normalization
  assert.equal(
    getProtocolPoolUrl('uniswap', '0x10CC6BD38112CAC182DB90B6A71D8BB5939526BA'),
    'https://app.uniswap.org/explore/pools/robinhood/0x10cc6bd38112cac182db90b6a71d8bb5939526ba',
  );
});

test('getProtocolPoolUrl formats other protocol platforms dynamically', () => {
  const addr = '0x10cc6bd38112cac182db90b6a71d8bb5939526ba';

  // Ramses
  assert.equal(
    getProtocolPoolUrl('ramses', addr),
    `https://app.ramses.exchange/liquidity/${addr}`,
  );

  // Camelot
  assert.equal(
    getProtocolPoolUrl('camelot', addr),
    `https://app.camelot.exchange/liquidity/${addr}`,
  );

  // SushiSwap
  assert.equal(
    getProtocolPoolUrl('sushiswap', addr, 42161),
    `https://www.sushi.com/pool/arbitrum:${addr}`,
  );

  // PancakeSwap
  assert.equal(
    getProtocolPoolUrl('pancakeswap', addr, 56),
    `https://pancakeswap.finance/info/v3/bsc/pairs/${addr}`,
  );
});

test('getProtocolPoolUrl handles empty or invalid inputs gracefully', () => {
  assert.equal(getProtocolPoolUrl('uniswap', ''), '');
  assert.equal(getProtocolPoolUrl('uniswap', null), '');
  assert.equal(getProtocolPoolUrl('uniswap', undefined), '');
});

test('getChainFundingOptions resolves correct single-asset funding options per chain', () => {
  // Robinhood Chain default
  const rh = getChainFundingOptions(4663);
  assert.equal(rh.length, 2);
  assert.equal(rh[0]?.id, 'eth');
  assert.equal(rh[1]?.id, 'usdg');

  // Arc (chain 5042)
  const arc = getChainFundingOptions(5042);
  assert.equal(arc.length, 1);
  assert.equal(arc[0]?.id, 'usdc');

  // Solana
  const sol = getChainFundingOptions('solana');
  assert.equal(sol.length, 2);
  assert.equal(sol[0]?.id, 'sol');
  assert.equal(sol[1]?.id, 'usdc');

  // Arbitrum / Base
  const arb = getChainFundingOptions(42161);
  assert.equal(arb.length, 2);
  assert.equal(arb[0]?.id, 'eth');
  assert.equal(arb[1]?.id, 'usdc');

  // Fallback
  const fallback = getChainFundingOptions();
  assert.equal(fallback.length, 2);
  assert.equal(fallback[0]?.id, 'eth');
  assert.equal(fallback[1]?.id, 'usdg');
});


test('BNB Chain slugs resolve to chain 56 and back', () => {
  for (const slug of ['bnb', 'bsc', 'BNB', '56']) assert.equal(resolveChainId(slug), 56);
  assert.equal(resolveChainSlug(56), 'bnb');
  assert.equal(resolveChainId(resolveChainSlug(56)), 56);
  // Robinhood and Arc are unchanged, and an unknown slug still falls back to Robinhood.
  assert.equal(resolveChainId('robinhood'), 4663);
  assert.equal(resolveChainId('arc'), 5042);
  assert.equal(resolveChainId('nope'), 4663);
  assert.deepEqual([...BOT_CHAIN_IDS].sort(), [56, 4663, 5042].sort());
  const bnb = getChainFundingOptions(56);
  assert.deepEqual(bnb.map((o) => o.symbol), ['BNB', 'USDT']);
  // The native option keeps the id the deposit panel treats as "pay in the gas token".
  assert.equal(bnb[0]?.id, 'eth');
});
