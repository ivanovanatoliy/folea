import { describe, expect, it, vi } from 'vitest';

import { clearApplicationCache, type CacheSession } from '../../src/main/cache';

describe('application cache service', () => {
  it('clears Chromium data cache before generated code cache', async () => {
    const order: string[] = [];
    const targetSession: CacheSession = {
      clearData: vi.fn(async (options) => {
        expect(options).toEqual({ dataTypes: ['cache'] });
        order.push('data');
      }),
      clearCodeCaches: vi.fn(async (options) => {
        expect(options).toEqual({});
        order.push('code');
      })
    };

    await clearApplicationCache(targetSession);

    expect(order).toEqual(['data', 'code']);
    expect(targetSession.clearData).toHaveBeenCalledOnce();
    expect(targetSession.clearCodeCaches).toHaveBeenCalledOnce();
  });
});
