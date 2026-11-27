import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { FetchStore } from './fetch-store';
test('default transport calls native fetch with its global receiver', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(function (this: unknown, ..._args) {
    assert.equal(this, globalThis);
    return Promise.resolve(new Response(JSON.stringify({ ok: true })));
  });
  try {
    const store = new FetchStore();
    await store.read('/api/pnl');
    assert.equal(store.snapshot('/api/pnl').error, null);
    assert.deepEqual(store.snapshot('/api/pnl').data, { ok: true });
  } finally {
    fetchSpy.mockRestore();
  }
});
const deferred = () => {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const response = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

test('concurrent readers share one request and fresh navigation reuses the result', async () => {
  let calls = 0;
  const pending = deferred();
  const store = new FetchStore((() => {
    calls++;
    return pending.promise;
  }) as typeof fetch);
  const a = store.read('/api/pnl');
  const b = store.read('/api/pnl');
  assert.equal(a, b);
  pending.resolve(response({ wallet: 'A' }));
  await a;
  await store.read('/api/pnl');
  assert.equal(calls, 1);
  assert.deepEqual(store.snapshot('/api/pnl').data, { wallet: 'A' });
});

test('wallet invalidation clears data and rejects obsolete completion even when fetch ignores abort', async () => {
  const pending = [deferred(), deferred()];
  const signals: AbortSignal[] = [];
  let calls = 0;
  const store = new FetchStore(((_path, init) => {
    signals.push(init!.signal as AbortSignal);
    return pending[calls++]!.promise;
  }) as typeof fetch);
  const unsubscribe = store.subscribe('/api/pnl', () => {});
  const old = store.read('/api/pnl');
  store.invalidate();
  assert.equal(store.snapshot('/api/pnl').data, null);
  assert.equal(signals[0]!.aborted, true);
  const current = store.read('/api/pnl');
  pending[1]!.resolve(response({ wallet: 'B' }));
  await current;
  pending[0]!.resolve(response({ wallet: 'A' }));
  await old;
  assert.deepEqual(store.snapshot('/api/pnl').data, { wallet: 'B' });
  unsubscribe();
});

test('inactive cache retention stays bounded across many paginated reads', async () => {
  const store = new FetchStore((async () => response({ rows: [] })) as typeof fetch, 3);
  for (let i = 0; i < 20; i++) await store.read(`/api/pnl/trades?offset=${i}`);
  assert.ok(store.size <= 3);
});

test('failed reads can retry', async () => {
  let calls = 0;
  const store = new FetchStore((async () => {
    calls++;
    return calls === 1 ? new Response('{"error":"unavailable"}', { status: 503 }) : response({ ok: true });
  }) as typeof fetch);
  const unsubscribe = store.subscribe('/api/settings', () => {});
  await store.read('/api/settings');
  assert.equal(store.snapshot('/api/settings').error, 'unavailable');
  await store.read('/api/settings');
  assert.deepEqual(store.snapshot('/api/settings').data, { ok: true });
  unsubscribe();
});

test('unmount aborts only when the last subscriber leaves', async () => {
  const pending = deferred();
  let signal: AbortSignal | undefined;
  const store = new FetchStore(((_path, init) => {
    signal = init!.signal as AbortSignal;
    return pending.promise;
  }) as typeof fetch);
  const first = store.subscribe('/api/wallet', () => {});
  const second = store.subscribe('/api/wallet', () => {});
  first();
  await Promise.resolve();
  assert.equal(signal?.aborted, false);
  second();
  await Promise.resolve();
  assert.equal(signal?.aborted, true);
  pending.resolve(response({ old: true }));
  await Promise.resolve();
  assert.equal(store.snapshot('/api/wallet').data, null);
});

test('path snapshots never expose another resource and selective invalidation preserves unrelated reads', async () => {
  const store = new FetchStore((async (path) => response({ path })) as typeof fetch);
  await store.read('/api/pnl');
  await store.read('/api/settings');
  store.invalidate((path) => path === '/api/pnl');
  assert.equal(store.snapshot('/api/pnl').data, null);
  assert.deepEqual(store.snapshot('/api/settings').data, { path: '/api/settings' });
  assert.equal(store.snapshot('/api/wallet').data, null);
});

test('mutation response replaces one cached resource without a refetch or stale overwrite', async () => {
  const pending = deferred();
  let calls = 0;
  const store = new FetchStore((() => { calls++; return pending.promise; }) as typeof fetch);
  const old = store.read('/api/settings');
  store.set('/api/settings', { values: { slippageBps: 125 } });
  pending.resolve(response({ values: { slippageBps: 100 } }));
  await old;
  await store.read('/api/settings');
  assert.equal(calls, 1);
  assert.deepEqual(store.snapshot('/api/settings').data, { values: { slippageBps: 125 } });
});

test('rapid unsubscribe and re-read allows new fetch to proceed cleanly', async () => {
  let call = 0;
  const store = new FetchStore((async () => {
    call++;
    return response({ call });
  }) as typeof fetch, 10, 0);
  const unsub = store.subscribe('/api/rapid', () => {});
  await store.read('/api/rapid');
  assert.deepEqual(store.snapshot('/api/rapid').data, { call: 1 });
  unsub();
  await Promise.resolve();
  const unsub2 = store.subscribe('/api/rapid', () => {});
  await store.read('/api/rapid');
  assert.deepEqual(store.snapshot('/api/rapid').data, { call: 2 });
  unsub2();
});
