import { describe, expect, it } from 'vitest';

import { mapWithConcurrency } from '../../src/main/vault/concurrency';

describe('vault filesystem concurrency', () => {
  it('bounds active work and preserves input order', async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([5, 4, 3, 2, 1], 2, async (value) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setTimeout(resolve, value));
      active--;
      return value * 2;
    });
    expect(peak).toBe(2);
    expect(results).toEqual([10, 8, 6, 4, 2]);
  });

  it('rejects invalid limits', async () => {
    await expect(mapWithConcurrency([1], 0, async (value) => value)).rejects.toThrow(RangeError);
  });
});
