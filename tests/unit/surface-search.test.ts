import { describe, expect, it } from 'vitest';

import { findSearchTargetIndex } from '../../src/renderer/surface/surface-search';

describe('surface search target selection', () => {
  it('prefers the selected result preview over the first query match', () => {
    expect(
      findSearchTargetIndex(['Detail line 1.', 'Detail line 2.', 'Detail line 30.'], {
        query: 'Detail line',
        preview: 'Detail line 30.'
      })
    ).toBe(2);
  });

  it('uses the preview occurrence for identical rendered lines', () => {
    expect(
      findSearchTargetIndex(['Repeated text', 'Between', 'Repeated text'], {
        query: 'Repeated',
        preview: 'Repeated text',
        previewOccurrence: 1
      })
    ).toBe(2);
  });

  it('falls back to the selected query occurrence when preview markup does not render', () => {
    expect(
      findSearchTargetIndex(['Result one', 'Result two', 'Result three'], {
        query: 'Result',
        preview: '#box[Result three]',
        queryOccurrence: 2
      })
    ).toBe(2);
  });
});
