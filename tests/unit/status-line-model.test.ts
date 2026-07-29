import { describe, expect, it } from 'vitest';

import { getZoomStatusLabel } from '../../src/renderer/app/status-line-model';

describe('status line zoom label', () => {
  it.each([
    ['fitWidth', 'fit-w'],
    ['fitContentWidth', 'fit-c'],
    ['fitPage', 'fit-p']
  ] as const)('labels %s mode as %s', (mode, label) => {
    expect(getZoomStatusLabel({ level: 1.25, mode })).toBe(label);
  });

  it('hides the manual fixed zoom level', () => {
    expect(getZoomStatusLabel({ level: 1.54, mode: 'fixed' })).toBeNull();
  });
});
