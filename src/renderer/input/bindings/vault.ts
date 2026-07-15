import { registerCommand } from '../commands';

registerCommand({ id: 'tree.moveDown', title: 'Tree down', run: (ctx) => ctx.tree.moveDown() });
registerCommand({ id: 'tree.moveUp', title: 'Tree up', run: (ctx) => ctx.tree.moveUp() });
registerCommand({ id: 'tree.expand', title: 'Tree expand', run: (ctx) => ctx.tree.expand() });
registerCommand({ id: 'tree.collapse', title: 'Tree collapse', run: (ctx) => ctx.tree.collapse() });
registerCommand({
  id: 'tree.openSearch',
  title: 'Search tree',
  run: (ctx) => ctx.tree.openSearch()
});
registerCommand({
  id: 'tree.closeSearch',
  title: 'Close tree search',
  run: (ctx) => ctx.tree.closeSearch()
});
registerCommand({
  id: 'tree.searchBackspace',
  title: 'Delete tree search character',
  run: (ctx) => ctx.tree.backspaceSearch()
});
registerCommand({
  id: 'tree.searchAppend',
  exposure: 'internal',
  title: 'Append tree search character',
  run: (ctx, char) => {
    if (char) ctx.tree.appendSearchChar(char);
  }
});
registerCommand({
  id: 'tree.openSelection',
  title: 'Open selected tree note',
  run: (ctx) => ctx.tree.openSelection()
});
registerCommand({
  id: 'tree.selectFirst',
  title: 'Tree first row',
  run: (ctx) => ctx.tree.selectFirst()
});
registerCommand({
  id: 'tree.selectLast',
  title: 'Tree last row',
  run: (ctx) => ctx.tree.selectLast()
});
registerCommand({
  id: 'tree.createNote',
  exposure: 'action',
  title: 'Create note',
  run: (ctx) => ctx.tree.createNote?.()
});
registerCommand({
  id: 'tree.createNoteAtCurrent',
  exposure: 'action',
  title: 'Create note beside current note',
  run: (ctx) => ctx.tree.createNoteAtCurrent?.()
});
registerCommand({
  id: 'tree.createDirectory',
  exposure: 'action',
  title: 'Create directory',
  run: (ctx) => ctx.tree.createDirectory?.()
});
registerCommand({
  id: 'tree.rename',
  exposure: 'action',
  title: 'Rename note or directory',
  run: (ctx) => ctx.tree.renameSelection?.()
});
registerCommand({
  id: 'tree.toggleMark',
  title: 'Toggle tree mark',
  run: (ctx) => ctx.tree.toggleMark?.()
});
registerCommand({
  id: 'tree.clearMarks',
  title: 'Clear tree marks',
  run: (ctx) => ctx.tree.clearMarks?.()
});
registerCommand({
  id: 'tree.moveMarks',
  exposure: 'action',
  title: 'Move marked entries',
  run: (ctx) => ctx.tree.moveMarks?.()
});
registerCommand({
  id: 'tree.delete',
  exposure: 'action',
  title: 'Move entries to trash',
  run: (ctx) => ctx.tree.deleteSelection?.()
});
registerCommand({
  id: 'templates.manage',
  exposure: 'action',
  title: 'Manage note templates',
  run: (ctx) => ctx.tree.manageTemplates?.()
});
registerCommand({
  id: 'templates.close',
  title: 'Close template manager',
  run: (ctx) => ctx.tree.closeTemplates?.()
});
registerCommand({
  id: 'templates.moveNext',
  title: 'Select next template',
  run: (ctx) => ctx.tree.nextTemplate?.()
});
registerCommand({
  id: 'templates.movePrevious',
  title: 'Select previous template',
  run: (ctx) => ctx.tree.previousTemplate?.()
});
registerCommand({
  id: 'templates.open',
  title: 'Open selected template in editor',
  run: (ctx) => ctx.tree.openTemplate?.()
});
registerCommand({
  id: 'templates.rename',
  title: 'Rename selected template',
  run: (ctx) => ctx.tree.renameTemplate?.()
});
registerCommand({
  id: 'templates.delete',
  title: 'Move selected template to trash',
  run: (ctx) => ctx.tree.deleteTemplate?.()
});
registerCommand({
  id: 'vaultDialog.cancel',
  exposure: 'internal',
  run: (ctx) => ctx.vaultDialog?.cancel()
});
registerCommand({
  id: 'vaultDialog.submit',
  exposure: 'internal',
  run: (ctx) => ctx.vaultDialog?.submit()
});
registerCommand({
  id: 'vaultDialog.next',
  exposure: 'internal',
  run: (ctx) => ctx.vaultDialog?.next()
});
registerCommand({
  id: 'vaultDialog.previous',
  exposure: 'internal',
  run: (ctx) => ctx.vaultDialog?.previous()
});
registerCommand({
  id: 'vaultDialog.ignore',
  exposure: 'internal',
  run: (ctx) => ctx.vaultDialog?.ignore()
});
