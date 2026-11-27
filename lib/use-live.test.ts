import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';

// No DOM renderer dependency: execute the real effect with React's state/effect
// boundary replaced; browser transport/events are controlled explicitly.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cleanups: [] as (() => void)[] }));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = hooks.values.push(initial) - 1;
    return [initial, (next: unknown) => {
      hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next;
    }];
  },
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) hooks.cleanups.push(cleanup);
  },
  useMemo: (value: () => unknown) => value(),
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock('./pool-directory', () => ({
  applyExecutionOverlay: vi.fn(), handleLeaderboardUpdate: vi.fn(), onDirectoryRevision: vi.fn(),
}));
import { isSyncMutationPath, mutateFetch, useFetch, useLive } from './use-live';

class Stream extends EventTarget {
  static all: Stream[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { super(); Stream.all.push(this); }
  close() { this.closed = true; }
  send(type: string, value: unknown) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(value) }));
  }
}
let visibility: EventTarget & { hidden: boolean; visibilityState: string };
// @ts-expect-error -- utility kept for future visibility tests
const _visible = (value: boolean) => {
  visibility.hidden = !value;
  visibility.visibilityState = value ? 'visible' : 'hidden';
  visibility.dispatchEvent(new Event('visibilitychange'));
};
beforeEach(() => {
  hooks.values = []; hooks.cleanups = []; Stream.all = [];
  visibility = Object.assign(new EventTarget(), { hidden: false, visibilityState: 'visible' });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', visibility);
  vi.stubGlobal('EventSource', Stream);
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
});
afterEach(() => {
  hooks.cleanups.forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

test('resource reloads do not refresh unrelated portfolio state', () => {
  useLive(true);
  useFetch('/api/settings').reload();
  useFetch('/api/referral').reload();
  assert.equal(vi.mocked(fetch).mock.calls.length, 0, 'targeted reload must not GET /api/state');
  mutateFetch((path) => path === '/api/state');
  assert.equal(vi.mocked(fetch).mock.calls.length, 1);
  assert.equal(vi.mocked(fetch).mock.calls[0]![0], '/api/state');
  mutateFetch();
  assert.equal(vi.mocked(fetch).mock.calls.length, 2, 'unfiltered mutation still refreshes state');
});

test('isSyncMutationPath matches core UI sync paths', () => {
  assert.equal(isSyncMutationPath('/api/state'), true);
  assert.equal(isSyncMutationPath('/api/wallet'), true);
  assert.equal(isSyncMutationPath('/api/positions'), true);
  assert.equal(isSyncMutationPath('/api/pnl'), true);
  assert.equal(isSyncMutationPath('/api/pnl?range=30d'), true);
  assert.equal(isSyncMutationPath('/api/calendar'), true);
  assert.equal(isSyncMutationPath('/api/pending'), true);
  assert.equal(isSyncMutationPath('/api/settings'), false);
  assert.equal(isSyncMutationPath('/api/referral'), false);
});

test('job completion (step.done) triggers unified invalidation and state refresh', () => {
  const mutateEvents: any[] = [];
  window.addEventListener('invictus:mutate', (e) => mutateEvents.push(e));

  useLive(true);
  assert.equal(Stream.all.length, 1);
  const stream = Stream.all[0]!;

  const initialFetchCalls = vi.mocked(fetch).mock.calls.length;

  // Simulate job step in progress (not done)
  stream.send('job', { jobId: 'job-1', kind: 'mint', label: 'Minting', done: false });
  assert.equal(vi.mocked(fetch).mock.calls.length, initialFetchCalls, 'non-done job must not trigger refresh');
  assert.equal(mutateEvents.length, 0, 'non-done job must not dispatch mutate event');

  // Simulate job done
  stream.send('job', { jobId: 'job-1', kind: 'mint', label: 'Done', done: true });
  assert.equal(mutateEvents.length, 1, 'step.done must dispatch invictus:mutate');
  const filter = (mutateEvents[0] as CustomEvent).detail.filter;
  assert.equal(filter('/api/state'), true);
  assert.equal(filter('/api/wallet'), true);
  assert.equal(filter('/api/positions'), true);
  assert.equal(filter('/api/pnl'), true);
  assert(vi.mocked(fetch).mock.calls.length > initialFetchCalls, 'step.done must trigger refresh() on state');
});

test('useLive with poolId and topic builds scoped query URL', () => {
  useLive(true, '0xpoolA');
  assert.equal(Stream.all[0]!.url, '/api/stream?poolId=0xpoolA');

  useLive(true, { topic: 'pool:0xpoolB' });
  assert.equal(Stream.all[1]!.url, '/api/stream?topic=pool%3A0xpoolB');

  useLive(true, { poolId: '0xpoolC', topic: 'swap:0xpoolC' });
  assert.equal(Stream.all[2]!.url, '/api/stream?poolId=0xpoolC&topic=swap%3A0xpoolC');
});
