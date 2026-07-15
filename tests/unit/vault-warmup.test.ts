import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWarmupQueue } from '../../src/renderer/vault-state';

class FakeWarmupWorker {
  readonly requests: unknown[] = [];
  terminated = false;
  private readonly messageListeners: Array<(event: MessageEvent<unknown>) => void> = [];

  addEventListener(type: string, listener: unknown): void {
    if (type === 'message') {
      this.messageListeners.push(listener as (event: MessageEvent<unknown>) => void);
    }
  }

  postMessage(value: unknown): void {
    this.requests.push(value);
    const request = value as { type: string; version: number; noteId?: string };
    const result =
      request.type === 'syncSnapshot'
        ? { type: 'snapshotSynced', version: request.version }
        : {
            type: 'rendered',
            noteId: request.noteId,
            version: request.version,
            cacheKey: `cache-${request.noteId}`,
            artifact: { svg: '<svg />', width: 10, height: 10 },
            textLayer: {
              version: 1,
              text: '',
              spans: [],
              pages: [{ page: 0, width: 10, height: 10 }]
            },
            outline: [],
            inputFiles: [{ path: request.noteId, sha256: 'hash' }],
            fromCache: false
          };
    queueMicrotask(() => {
      for (const listener of this.messageListeners) {
        listener({ data: result } as MessageEvent<unknown>);
      }
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('vault cache warmup', () => {
  it('sends one snapshot, compiles every miss without source payloads, and terminates', async () => {
    const worker = new FakeWarmupWorker();
    const writeRenderCache = vi.fn(async () => undefined);
    vi.stubGlobal('window', {
      folea: {
        vaultState: {
          readRenderCache: vi.fn(async () => ({ hit: false })),
          writeRenderCache
        }
      }
    });
    let complete!: () => void;
    const completed = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const queue = createWarmupQueue(vi.fn(), complete, vi.fn(), {
      createWorker: () => worker as unknown as Worker
    });
    const sourceFiles = new Map([
      ['a.typ', '= A'],
      ['b.typ', '= B']
    ]);

    queue.start(7, sourceFiles, ['a.typ', 'b.typ']);
    await completed;

    expect(worker.requests).toEqual([
      { type: 'syncSnapshot', version: 7, files: sourceFiles },
      { type: 'compile', noteId: 'a.typ', version: 7 },
      { type: 'compile', noteId: 'b.typ', version: 7 }
    ]);
    expect(writeRenderCache).toHaveBeenCalledTimes(2);
    expect(worker.terminated).toBe(true);
  });
});
