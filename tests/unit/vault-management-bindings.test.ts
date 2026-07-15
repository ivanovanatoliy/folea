import { describe, expect, it } from 'vitest';

import { GLOBAL_KEYMAP, TEMPLATES_KEYMAP, TREE_KEYMAP } from '../../src/renderer/input/bindings';

describe('vault management bindings', () => {
  it('uses the netrw-like default chords', () => {
    expect(TREE_KEYMAP.get('%')).toBe('tree.createNote');
    expect(TREE_KEYMAP.get('d')).toBe('tree.createDirectory');
    expect(TREE_KEYMAP.get('R')).toBe('tree.rename');
    expect(TREE_KEYMAP.get('mf')).toBe('tree.toggleMark');
    expect(TREE_KEYMAP.get('mu')).toBe('tree.clearMarks');
    expect(TREE_KEYMAP.get('mm')).toBe('tree.moveMarks');
    expect(TREE_KEYMAP.get('D')).toBe('tree.delete');
    expect(TREE_KEYMAP.get('zM')).toBe('tree.collapseAll');
    expect(TREE_KEYMAP.get('zR')).toBe('tree.expandAll');
    expect(GLOBAL_KEYMAP.get('<C-n>')).toBe('tree.createNoteAtCurrent');
    expect(TEMPLATES_KEYMAP.get('R')).toBe('templates.rename');
    expect(TEMPLATES_KEYMAP.get('D')).toBe('templates.delete');
  });
});
