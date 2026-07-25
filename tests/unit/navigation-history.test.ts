import { describe, expect, it } from 'vitest';

import {
  createNavigationHistory,
  NAVIGATION_HISTORY_MAX,
  type NavigationLocation
} from '../../src/renderer/nav/navigation-history';

const location = (
  relPath: string,
  scrollTop: number,
  overrides: Partial<NavigationLocation> = {}
): NavigationLocation => ({
  relPath,
  scrollTop,
  scrollLeft: 0,
  viewportHeight: 800,
  contentHeight: 2400,
  scrollRatio: scrollTop / 1600,
  zoomMode: 'fitWidth',
  zoomLevel: 1,
  caretSpanIndex: null,
  updatedAt: '2026-07-25T00:00:00.000Z',
  ...overrides
});

describe('navigation history', () => {
  it('moves exact locations backward and forward', () => {
    const history = createNavigationHistory();
    const alpha = location('alpha.typ', 420, { zoomMode: 'fixed', zoomLevel: 1.4 });
    const beta = location('beta.typ', 80, { caretSpanIndex: 12 });

    history.record(alpha);
    expect(history.back(beta)).toEqual(alpha);
    expect(history.backCount).toBe(0);
    expect(history.forwardCount).toBe(1);

    expect(history.forward(alpha)).toEqual(beta);
    expect(history.backCount).toBe(1);
    expect(history.forwardCount).toBe(0);
  });

  it('clears the forward branch after a new navigation', () => {
    const history = createNavigationHistory();
    const alpha = location('alpha.typ', 0);
    const beta = location('beta.typ', 0);

    history.record(alpha);
    expect(history.back(beta)).toEqual(alpha);
    history.record(alpha);

    expect(history.forward(alpha)).toBeUndefined();
  });

  it('deduplicates consecutive locations and bounds each stack', () => {
    const history = createNavigationHistory();
    const first = location('first.typ', 0);
    history.record(first);
    history.record(first);
    expect(history.backCount).toBe(1);

    for (let index = 0; index < NAVIGATION_HISTORY_MAX + 20; index += 1) {
      history.record(location(`note-${index}.typ`, index));
    }
    expect(history.backCount).toBe(NAVIGATION_HISTORY_MAX);
  });

  it('remaps moved paths and prunes deleted notes', () => {
    const history = createNavigationHistory();
    history.record(location('old/a.typ', 10));
    history.record(location('old/b.typ', 20));
    history.remap([{ from: 'old', to: 'archive/old' }]);
    history.prune(new Set(['archive/old/a.typ']));

    expect(history.back(location('current.typ', 0))).toMatchObject({
      relPath: 'archive/old/a.typ',
      scrollTop: 10
    });
    expect(history.back(location('current.typ', 0))).toBeUndefined();
  });

  it('skips unavailable locations and clears with the vault session', () => {
    const history = createNavigationHistory();
    history.record(location('available.typ', 10));
    history.record(location('missing.typ', 20));

    expect(
      history.back(location('current.typ', 0), (path) => path === 'available.typ')
    ).toMatchObject({ relPath: 'available.typ' });

    history.record(location('available.typ', 30));
    history.clear();
    expect(history.backCount).toBe(0);
    expect(history.forwardCount).toBe(0);
  });
});
