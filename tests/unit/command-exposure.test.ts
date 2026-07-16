import { describe, expect, it } from 'vitest';

import '../../src/renderer/input/bindings';
import { getCommand, listPaletteCommands, listRemappableCommands } from '../../src/renderer/input';

const paletteCommandIds = [
  'app.closeVault',
  'app.openVault',
  'cache.clearApplication',
  'cache.clearCurrentVault',
  'caret.smartJump',
  'caret.toggle',
  'document.links',
  'document.outline',
  'document.quickOpen',
  'editor.open',
  'palette.open',
  'search.open',
  'search.openGlobal',
  'templates.manage',
  'theme.cycle',
  'theme.useDark',
  'theme.useLight',
  'theme.useSystem',
  'tree.createDirectory',
  'tree.createNote',
  'tree.createNoteAtCurrent',
  'tree.delete',
  'tree.moveMarks',
  'tree.rename',
  'view.toggleTree',
  'zoom.fitContentWidth',
  'zoom.fitPage',
  'zoom.fitWidth',
  'zoom.in',
  'zoom.out'
] as const;

describe('command exposure', () => {
  it('shows only user-intent actions in the command palette', () => {
    expect(listPaletteCommands().map((command) => command.id)).toEqual(paletteCommandIds);
    expect(listPaletteCommands().filter((command) => command.id.endsWith('.close'))).toEqual([]);
    expect(listPaletteCommands().map((command) => command.id)).toContain('app.closeVault');
  });

  it('keeps navigation remappable while excluding input plumbing', () => {
    const ids = listRemappableCommands().map((command) => command.id);
    expect(ids).toContain('tree.moveDown');
    expect(ids).toContain('palette.close');
    expect(ids).not.toContain('tree.searchAppend');
    expect(ids).not.toContain('vaultDialog.submit');
  });

  it('does not register obsolete caret aliases', () => {
    for (const id of [
      'caret.exitVisual',
      'caret.extendDown',
      'caret.extendUp',
      'caret.extendLeft',
      'caret.extendRight',
      'caret.yank'
    ]) {
      expect(getCommand(id)).toBeUndefined();
    }
  });
});
