import { describe, expect, it } from 'vitest';

import { findLocalSearchHits } from '../../src/renderer/search';

describe('local search', () => {
  it('finds case-insensitive matches in the current source only', () => {
    expect(findLocalSearchHits('= Alpha\n\nBeta beta\nGamma', 'alpha.typ', 'beta')).toEqual([
      { relPath: 'alpha.typ', line: 3, column: 1, preview: 'Beta beta' },
      { relPath: 'alpha.typ', line: 3, column: 6, preview: 'Beta beta' }
    ]);
  });

  it('returns no hits for an empty query', () => {
    expect(findLocalSearchHits('= Alpha\n', 'alpha.typ', '   ')).toEqual([]);
  });
});
