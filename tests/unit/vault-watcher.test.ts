import { describe, expect, it, vi } from 'vitest';

import { observeWatcherTask } from '../../src/main/vault/watcher';

describe('vault watcher async errors', () => {
  it('reports rejected filesystem handlers instead of leaving an unhandled rejection', async () => {
    const error = new Error('stat failed');
    const report = vi.fn();

    observeWatcherTask(Promise.reject(error), report);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(error);
  });
});
