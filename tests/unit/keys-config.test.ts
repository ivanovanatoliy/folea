import { describe, expect, it } from 'vitest';

import {
  applyKeysConfigOverrides,
  isValidChord,
  parseKeysConfig,
  type KeymapSet
} from '../../src/shared/keys-config';
import { buildBindingIndex } from '../../src/renderer/input/binding-index';

const known = new Set([
  'document.scrollLineDown',
  'document.scrollHalfDown',
  'view.toggleTree',
  'editor.open',
  'cache.clearApplication',
  'caret.moveDown'
]);

const defaults = (): KeymapSet => ({
  document: new Map([
    ['j', 'document.scrollLineDown'],
    ['<C-d>', 'document.scrollHalfDown'],
    ['<C-e>', 'editor.open']
  ]),
  caret: new Map([
    ['j', 'caret.moveDown'],
    ['<C-e>', 'editor.open']
  ]),
  visual: new Map([['<C-e>', 'editor.open']]),
  tree: new Map(),
  treeSearch: new Map(),
  palette: new Map(),
  search: new Map(),
  outline: new Map(),
  links: new Map(),
  quickOpen: new Map(),
  global: new Map([['<C-b>', 'view.toggleTree']])
});

describe('keys.config parser', () => {
  it('places cache command overrides in the global keymap', () => {
    const parsed = parseKeysConfig('cache.clearApplication C', known);
    const result = applyKeysConfigOverrides(defaults(), parsed);

    expect(result.warnings).toEqual([]);
    expect(result.keymaps.global.get('C')).toBe('cache.clearApplication');
  });

  it('keeps global remaps working when the templates keymap is present', () => {
    const defaultsWithTemplates: KeymapSet = {
      ...defaults(),
      templates: new Map([
        ['R', 'templates.rename'],
        ['D', 'templates.delete']
      ])
    };
    const parsed = parseKeysConfig(
      'view.toggleTree t\ntemplates.rename r',
      new Set([...known, 'templates.rename'])
    );
    const result = applyKeysConfigOverrides(defaultsWithTemplates, parsed);
    expect(result.keymaps.global.get('t')).toBe('view.toggleTree');
    expect(result.keymaps.global.has('<C-b>')).toBe(false);
    expect(result.keymaps.templates?.get('r')).toBe('templates.rename');
  });
  it('parses valid override lines', () => {
    const parsed = parseKeysConfig('document.scrollHalfDown <C-f>', known);
    expect(parsed.overrides).toEqual([
      { context: 'document', commandId: 'document.scrollHalfDown', chord: '<C-f>' }
    ]);
    expect(parsed.warnings).toEqual([]);
  });

  it('skips comments and blank lines', () => {
    expect(parseKeysConfig('# comment\n\nview.toggleTree t', known).overrides).toHaveLength(1);
  });

  it('warns for unknown commands', () => {
    const parsed = parseKeysConfig('document.nope x', known);
    expect(parsed.overrides).toEqual([]);
    expect(parsed.warnings[0]).toContain('unknown command');
  });

  it('warns for invalid chords', () => {
    const parsed = parseKeysConfig('document.scrollLineDown <C-Enter>', known);
    expect(parsed.overrides).toEqual([]);
    expect(parsed.warnings[0]).toContain('invalid chord');
  });

  it('accepts canonical Ctrl named-key chords', () => {
    const parsed = parseKeysConfig('document.scrollLineDown <C-enter>', known);
    expect(parsed.overrides).toEqual([
      { context: 'document', commandId: 'document.scrollLineDown', chord: '<C-enter>' }
    ]);
    expect(parsed.warnings).toEqual([]);
  });

  it('accepts multi-key sequences as chord tokens', () => {
    expect(isValidChord('gg')).toBe(true);
    expect(parseKeysConfig('document.scrollLineDown gg', known).overrides[0]?.chord).toBe('gg');
  });

  it('accepts space chords', () => {
    expect(isValidChord('Space')).toBe(true);
    expect(isValidChord('<S-Space>')).toBe(true);
    expect(parseKeysConfig('document.scrollHalfDown Space', known).overrides[0]?.chord).toBe(
      'Space'
    );
  });
});

describe('applyKeysConfigOverrides', () => {
  it('remapping replaces the old chord', () => {
    const parsed = parseKeysConfig('document.scrollHalfDown <C-f>', known);
    const { keymaps } = applyKeysConfigOverrides(defaults(), parsed);

    expect(keymaps.document.get('<C-d>')).toBeUndefined();
    expect(keymaps.document.get('<C-f>')).toBe('document.scrollHalfDown');
  });

  it('multiple lines for the same command add multiple chords', () => {
    const parsed = parseKeysConfig(
      'document.scrollHalfDown <C-f>\ndocument.scrollHalfDown J',
      known
    );
    const { keymaps } = applyKeysConfigOverrides(defaults(), parsed);

    expect(keymaps.document.get('<C-f>')).toBe('document.scrollHalfDown');
    expect(keymaps.document.get('J')).toBe('document.scrollHalfDown');
  });

  it('patches commands bound in multiple contexts', () => {
    const parsed = parseKeysConfig('editor.open e', known);
    const { keymaps } = applyKeysConfigOverrides(defaults(), parsed);

    expect(keymaps.document.get('<C-e>')).toBeUndefined();
    expect(keymaps.caret.get('<C-e>')).toBeUndefined();
    expect(keymaps.visual.get('<C-e>')).toBeUndefined();
    expect(keymaps.document.get('e')).toBe('editor.open');
    expect(keymaps.caret.get('e')).toBe('editor.open');
    expect(keymaps.visual.get('e')).toBe('editor.open');
  });

  it('last chord conflict wins with warning', () => {
    const parsed = parseKeysConfig('document.scrollHalfDown j', known);
    const { keymaps, warnings } = applyKeysConfigOverrides(defaults(), parsed);

    expect(keymaps.document.get('j')).toBe('document.scrollHalfDown');
    expect(warnings.some((warning) => warning.includes('rebound'))).toBe(true);
  });

  it('binding index reflects the remap', () => {
    const parsed = parseKeysConfig('document.scrollHalfDown <C-f>', known);
    const { keymaps } = applyKeysConfigOverrides(defaults(), parsed);
    const index = buildBindingIndex([keymaps.document]);

    expect(index.get('document.scrollHalfDown')).toBe('C-f');
  });
});
