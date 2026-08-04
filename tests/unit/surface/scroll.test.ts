import { describe, expect, it } from 'vitest';

import { calculatePageStatus } from '../../../src/renderer/surface/surface-scroll';

describe('surface page status', () => {
  it('reports empty, first, middle, and final pages deterministically', () => {
    expect(calculatePageStatus(0, 0, 0, 0)).toEqual({ current: 0, total: 0 });
    expect(calculatePageStatus(0, 0, 0, 3)).toEqual({ current: 1, total: 3 });
    expect(calculatePageStatus(500, 1_500, 0, 3)).toEqual({ current: 1, total: 3 });
    expect(calculatePageStatus(500, 1_500, 500, 3)).toEqual({ current: 2, total: 3 });
    expect(calculatePageStatus(500, 1_500, 1_000, 3)).toEqual({ current: 3, total: 3 });
  });

  it('keeps Typst physical page count independent of viewport and zoom', () => {
    expect(calculatePageStatus(800, 2_000, 0, 2)).toEqual({ current: 1, total: 2 });
    expect(calculatePageStatus(800, 4_000, 0, 2)).toEqual({ current: 1, total: 2 });
  });
});
