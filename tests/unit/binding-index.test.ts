import { describe, expect, it } from 'vitest';
import { buildBindingIndex } from '../../src/renderer/input/binding-index';
import type { Keymap } from '../../src/renderer/input/keymap';
import {
  DOCUMENT_KEYMAP,
  CARET_KEYMAP,
  GLOBAL_KEYMAP,
  QUICK_OPEN_KEYMAP,
  TREE_KEYMAP
} from '../../src/renderer/input/bindings';

describe('buildBindingIndex', () => {
  it('maps command to its first chord', () => {
    const keymap: Keymap = new Map([
      ['j', 'document.scrollLineDown'],
      ['<C-d>', 'document.scrollHalfDown']
    ]);
    const index = buildBindingIndex([keymap]);
    expect(index.get('document.scrollLineDown')).toBe('j');
    expect(index.get('document.scrollHalfDown')).toBe('C-d');
  });

  it('first binding wins when a command appears in multiple keymaps', () => {
    const first: Keymap = new Map([['a', 'cmd.foo']]);
    const second: Keymap = new Map([['b', 'cmd.foo']]);
    const index = buildBindingIndex([first, second]);
    expect(index.get('cmd.foo')).toBe('a');
  });

  it('skips wildcard chords like m*', () => {
    const keymap: Keymap = new Map([['m*', 'caret.setMark']]);
    const index = buildBindingIndex([keymap]);
    expect(index.has('caret.setMark')).toBe(false);
  });

  it('formats special keys with labels', () => {
    const keymap: Keymap = new Map([['Escape', 'palette.close']]);
    const index = buildBindingIndex([keymap]);
    expect(index.get('palette.close')).toBe('Esc');
  });

  it('returns empty map for no keymaps', () => {
    expect(buildBindingIndex([])).toEqual(new Map());
  });

  it('document.quickOpen is bound (<C-p> → quick open in GLOBAL_KEYMAP)', () => {
    const index = buildBindingIndex([DOCUMENT_KEYMAP, CARET_KEYMAP, GLOBAL_KEYMAP]);
    expect(index.get('document.quickOpen')).toBeTruthy();
  });

  it('editor.open is bound to <C-e> in DOCUMENT_KEYMAP', () => {
    const index = buildBindingIndex([DOCUMENT_KEYMAP]);
    expect(index.get('editor.open')).toBe('C-e');
  });

  it('tree.close is bound to Escape in TREE_KEYMAP', () => {
    const index = buildBindingIndex([TREE_KEYMAP]);
    expect(index.get('tree.close')).toBe('Esc');
  });

  it('quickOpen.close is bound in QUICK_OPEN_KEYMAP', () => {
    const index = buildBindingIndex([QUICK_OPEN_KEYMAP]);
    expect(index.get('quickOpen.close')).toBe('Esc');
  });
});
