/** Shared reads, with bounded inactive retention and generation-safe invalidation. */
export interface ReadState {
  data: unknown;
  error: string | null;
  loading: boolean;
  validating: boolean;
}
interface Entry {
  state: ReadState;
  at: number;
  generation: number;
  listeners: Set<() => void>;
  controller?: AbortController;
  pending?: Promise<void>;
}
export const EMPTY_READ: ReadState = { data: null, error: null, loading: false, validating: false };
export class FetchStore {
  private entries = new Map<string, Entry>();
  private visibilityBound = false;
  constructor(
    private readonly request: typeof fetch = (input, init) => globalThis.fetch(input, init),
    private readonly capacity = 100,
    private readonly ttl = 15_000,
  ) {
    this.bindVisibility();
  }
  private bindVisibility(): void {
    if (this.visibilityBound || typeof document === 'undefined') return;
    this.visibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      for (const [path, e] of this.entries) {
        if (e.listeners.size > 0 && (!e.at || now - e.at >= this.ttl)) {
          void this.read(path);
        }
      }
    });
  }
  get size(): number {
    return this.entries.size;
  }
  private entry(path: string): Entry {
    let e = this.entries.get(path);
    if (!e) {
      e = { state: { data: null, error: null, loading: true, validating: true }, at: 0, generation: 0, listeners: new Set() };
      this.entries.set(path, e);
      this.trim(path);
    }
    return e;
  }
  private trim(protectedPath?: string): void {
    for (const [path, e] of this.entries) {
      if (this.entries.size <= this.capacity) break;
      if (path === protectedPath || e.listeners.size || e.pending) continue;
      this.entries.delete(path);
    }
  }
  snapshot(path: string): ReadState {
    return this.entry(path).state;
  }
  subscribe(path: string, listener: () => void): () => void {
    const e = this.entry(path);
    void this.read(path);
    e.listeners.add(listener);
    return () => {
      e.listeners.delete(listener);
      // Strict Mode may subscribe again in the same turn. A shared request
      // belongs to the remaining readers, never to one component's lifetime.
      queueMicrotask(() => {
        if (!e.listeners.size && e.pending) {
          e.generation++;
          e.controller?.abort();
          e.controller = undefined;
          e.pending = undefined;
          e.state = { ...e.state, loading: false, validating: false };
        }
        this.trim();
      });
    };
  }
  private publish(e: Entry, state: ReadState): void {
    e.state = state;
    e.listeners.forEach((notify) => notify());
  }
  read(path: string): Promise<void> {
    const e = this.entry(path);
    if (e.pending) return e.pending;
    if (e.at && Date.now() - e.at < this.ttl) return Promise.resolve();
    const generation = e.generation;
    const controller = new AbortController();
    e.controller = controller;
    const hasData = e.state.data !== null;
    this.publish(e, {
      ...e.state,
      loading: !hasData && !e.state.error,
      validating: true,
      error: null,
    });
    const valid = () =>
      !controller.signal.aborted && e.generation === generation && this.entries.get(path) === e;
    e.pending = (async () => {
      try {
        const response = await this.request(path, { credentials: 'same-origin', signal: controller.signal });
        const body: unknown = await response.json();
        if (!valid()) return;
        if (!response.ok) throw new Error(String((body as { error?: string }).error ?? response.status));
        e.at = Date.now();
        this.publish(e, { data: body, error: null, loading: false, validating: false });
      } catch (error) {
        if (valid())
          this.publish(e, {
            ...e.state,
            error: error instanceof Error ? error.message : String(error),
            loading: false,
            validating: false,
          });
      } finally {
        if (this.entries.get(path) === e && e.generation === generation) {
          e.pending = undefined;
          e.controller = undefined;
        }
        this.trim();
      }
    })();
    return e.pending;
  }
  set(path: string, data: unknown): void {
    const e = this.entry(path);
    e.generation++;
    e.controller?.abort();
    e.controller = undefined;
    e.pending = undefined;
    e.at = Date.now();
    this.publish(e, { data, error: null, loading: false, validating: false });
  }
  invalidate(filter: (path: string) => boolean = () => true, clearData = true): void {
    const active: string[] = [];
    for (const [path, e] of this.entries) {
      if (!filter(path)) continue;
      e.generation++;
      e.controller?.abort();
      e.controller = undefined;
      e.pending = undefined;
      e.at = 0;
      this.publish(e, {
        data: clearData ? null : e.state.data,
        error: null,
        loading: clearData || e.state.data === null,
        validating: true,
      });
      if (e.listeners.size) active.push(path);
      else this.entries.delete(path);
    }
    active.forEach((path) => void this.read(path));
  }
}
export const fetchStore = new FetchStore();
