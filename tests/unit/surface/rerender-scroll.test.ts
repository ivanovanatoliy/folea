import { describe, expect, it } from 'vitest';

import {
  getRestoredRerenderScrollTop,
  getScrollTopForChangedTarget
} from '../../../src/renderer/surface';

describe('rerender changed-target reveal', () => {
  it('restores the previous proportional scroll before changed-target visibility checks', () => {
    expect(
      getRestoredRerenderScrollTop({
        previousScrollTop: 1200,
        previousScrollHeight: 3000,
        nextScrollHeight: 3300
      })
    ).toBe(1320);
  });

  it('does not restore scroll without measurable old and new document heights', () => {
    expect(
      getRestoredRerenderScrollTop({
        previousScrollTop: 1200,
        previousScrollHeight: 0,
        nextScrollHeight: 3300
      })
    ).toBeNull();
  });

  it('does not move scroll when the changed target is already visible', () => {
    expect(
      getScrollTopForChangedTarget({
        viewportTop: 100,
        viewportHeight: 500,
        currentScrollTop: 1200,
        targetTop: 560,
        targetBottom: 584
      })
    ).toBeNull();
  });

  it('reveals a changed target below the viewport with surrounding context', () => {
    expect(
      getScrollTopForChangedTarget({
        viewportTop: 100,
        viewportHeight: 500,
        currentScrollTop: 1200,
        targetTop: 720,
        targetBottom: 744
      })
    ).toBe(1620);
  });

  it('reveals a changed target above the viewport without negative scroll', () => {
    expect(
      getScrollTopForChangedTarget({
        viewportTop: 100,
        viewportHeight: 500,
        currentScrollTop: 140,
        targetTop: 20,
        targetBottom: 44
      })
    ).toBe(0);
  });
});
