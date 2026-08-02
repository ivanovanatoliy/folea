import { describe, expect, it } from 'vitest';

import '../../src/renderer/input/bindings';
import {
  buildHelpCatalog,
  buildHelpRows,
  helpTabForContext
} from '../../src/renderer/app/help-model';
import {
  CARET_KEYMAP,
  DOCUMENT_KEYMAP,
  GLOBAL_KEYMAP,
  LINKS_KEYMAP,
  OUTLINE_KEYMAP,
  PALETTE_KEYMAP,
  QUICK_OPEN_KEYMAP,
  SEARCH_KEYMAP,
  TEMPLATES_KEYMAP,
  TREE_KEYMAP,
  TREE_SEARCH_KEYMAP,
  VISUAL_KEYMAP
} from '../../src/renderer/input';
import type { KeymapSet } from '../../src/shared/keys-config';

const defaults = (): KeymapSet => ({
  document: new Map(DOCUMENT_KEYMAP),
  caret: new Map(CARET_KEYMAP),
  visual: new Map(VISUAL_KEYMAP),
  tree: new Map(TREE_KEYMAP),
  treeSearch: new Map(TREE_SEARCH_KEYMAP),
  palette: new Map(PALETTE_KEYMAP),
  search: new Map(SEARCH_KEYMAP),
  outline: new Map(OUTLINE_KEYMAP),
  links: new Map(LINKS_KEYMAP),
  quickOpen: new Map(QUICK_OPEN_KEYMAP),
  global: new Map(GLOBAL_KEYMAP),
  templates: new Map(TEMPLATES_KEYMAP)
});

describe('keyboard help model', () => {
  it('groups commands into four task-level tabs with semantic groups', () => {
    const catalog = buildHelpCatalog(defaults());

    expect(catalog.tabs.map((tab) => tab.id)).toEqual(['reading', 'tree', 'panels', 'selection']);
    expect(catalog.tabs.find((tab) => tab.id === 'tree')?.groups.map((group) => group.id)).toEqual([
      'movement',
      'folders',
      'files',
      'marks',
      'search',
      'templates',
      'actions'
    ]);
    expect(
      catalog.tabs.find((tab) => tab.id === 'panels')?.groups.map((group) => group.id)
    ).toEqual(['palette', 'search', 'quick-open', 'outline', 'links', 'dialogs']);
  });

  it('maps the active input context to its tab', () => {
    expect(helpTabForContext('document')).toBe('reading');
    expect(helpTabForContext('tree-search')).toBe('tree');
    expect(helpTabForContext('links')).toBe('panels');
    expect(helpTabForContext('visual')).toBe('selection');
  });

  it('groups aliases and formats wildcard bindings', () => {
    const rows = buildHelpRows(
      new Map([
        ['=', 'zoom.fitWidth'],
        ['F9', 'zoom.fitWidth'],
        ['m*', 'caret.setMark'],
        ['*', 'tree.searchAppend']
      ])
    );

    expect(rows.find((row) => row.commandId === 'zoom.fitWidth')?.bindings).toEqual(['=', 'F9']);
    expect(rows.find((row) => row.commandId === 'caret.setMark')?.bindings).toEqual(['m{key}']);
    expect(rows.find((row) => row.commandId === 'tree.searchAppend')?.bindings).toEqual([
      'Any text'
    ]);
  });

  it('uses the effective remapped keymaps', () => {
    const keymaps = defaults();
    keymaps.document.delete('j');
    keymaps.document.set('F8', 'document.scrollLineDown');

    const reading = buildHelpCatalog(keymaps).tabs.find((tab) => tab.id === 'reading');
    const row = reading?.groups
      .flatMap((group) => group.rows)
      .find((candidate) => candidate.commandId === 'document.scrollLineDown');

    expect(row?.bindings).toEqual(['↓', 'F8']);
  });

  it('merges global shortcuts into each context and lets local chords win', () => {
    const catalog = buildHelpCatalog(defaults());
    const readingRows = catalog.tabs
      .find((tab) => tab.id === 'reading')
      ?.groups.flatMap((group) => group.rows);
    const treeRows = catalog.tabs
      .find((tab) => tab.id === 'tree')
      ?.groups.flatMap((group) => group.rows);

    expect(readingRows?.find((row) => row.commandId === 'app.showKeyboardHelp')).toMatchObject({
      title: 'Show keyboard help',
      bindings: ['?']
    });
    expect(treeRows?.find((row) => row.commandId === 'tree.openSearch')?.bindings).toContain('/');
    expect(treeRows?.find((row) => row.commandId === 'view.toggleTree')?.bindings).toContain('C-b');
  });
});
