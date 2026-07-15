import { describe, expect, it, vi } from 'vitest';

import { createSurfaceWorkerClient } from '../../../src/renderer/surface/surface-worker-client';

class FakeWorker {
  readonly requests: unknown[] = [];
  terminated = false;
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  addEventListener(type: string, listener: unknown): void {
    const entries = this.listeners.get(type) ?? new Set();
    entries.add(listener as (event: unknown) => void);
    this.listeners.set(type, entries);
  }
  removeEventListener(type: string, listener: unknown): void {
    this.listeners.get(type)?.delete(listener as (event: unknown) => void);
  }
  postMessage(value: unknown): void {
    this.requests.push(value);
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

describe('surface worker client', () => {
  it('owns snapshot versions, delta acknowledgements, and stale-result filtering', async () => {
    const worker = new FakeWorker();
    const onResult = vi.fn();
    const client = createSurfaceWorkerClient({
      createWorker: () => worker as unknown as Worker,
      onResult,
      onError: vi.fn()
    });
    const files = new Map([['a.typ', '= A']]);
    const synced = client.syncSnapshot(3, files);
    expect(worker.requests).toEqual([{ type: 'syncSnapshot', version: 3, files }]);
    worker.emit('message', { data: { type: 'snapshotSynced', version: 3 } });
    await synced;

    const updated = client.updateFiles(4, new Map([['a.typ', '= Updated']]), []);
    worker.emit('message', {
      data: { type: 'filesUpdated', version: 4, affectedNoteIds: ['a.typ'] }
    });
    await expect(updated).resolves.toEqual(['a.typ']);

    worker.emit('message', {
      data: {
        type: 'prefetched',
        noteId: 'a.typ',
        version: 3,
        cacheKey: 'old',
        fromCache: false
      }
    });
    expect(onResult).not.toHaveBeenCalled();
    client.prefetch('a.typ');
    expect(worker.requests.at(-1)).toEqual({
      type: 'prefetch',
      noteId: 'a.typ',
      version: 4
    });
    client.dispose();
    expect(worker.terminated).toBe(true);
  });

  it('rejects pending control requests when the worker fails', async () => {
    const worker = new FakeWorker();
    const onError = vi.fn();
    const client = createSurfaceWorkerClient({
      createWorker: () => worker as unknown as Worker,
      onResult: vi.fn(),
      onError
    });
    const pending = client.syncSnapshot(1, new Map());
    worker.emit('error', { error: new Error('crashed'), message: 'crashed' });
    await expect(pending).rejects.toThrow('crashed');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'crashed' }));
    client.dispose();
  });
});
