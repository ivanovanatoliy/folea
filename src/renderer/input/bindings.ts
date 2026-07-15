import { registerCommand } from './commands';
import type { Keymap } from './keymap';

registerCommand({
  id: 'zoom.fitWidth',
  title: 'Fit document width',
  run: (ctx) => ctx.zoom.fitWidth()
});
registerCommand({
  id: 'zoom.fitContentWidth',
  title: 'Fit content width',
  run: (ctx) => ctx.zoom.fitContentWidth()
});
registerCommand({
  id: 'zoom.fitPage',
  title: 'Fit one page height',
  run: (ctx) => ctx.zoom.fitPage()
});
registerCommand({ id: 'zoom.in', title: 'Zoom in 10%', run: (ctx) => ctx.zoom.zoomIn() });
registerCommand({ id: 'zoom.out', title: 'Zoom out 10%', run: (ctx) => ctx.zoom.zoomOut() });

registerCommand({
  id: 'document.scrollLineDown',
  title: 'Scroll down',
  run: (ctx) => ctx.document.scrollByLines(1)
});
registerCommand({
  id: 'document.scrollLineUp',
  title: 'Scroll up',
  run: (ctx) => ctx.document.scrollByLines(-1)
});
registerCommand({
  id: 'document.scrollHalfDown',
  title: 'Scroll half page down',
  run: (ctx) => ctx.document.scrollByViewport(0.5)
});
registerCommand({
  id: 'document.scrollHalfUp',
  title: 'Scroll half page up',
  run: (ctx) => ctx.document.scrollByViewport(-0.5)
});
registerCommand({
  id: 'document.scrollToTop',
  title: 'Scroll to top',
  run: (ctx) => ctx.document.scrollToStart()
});
registerCommand({
  id: 'document.scrollToBottom',
  title: 'Scroll to bottom',
  run: (ctx) => ctx.document.scrollToEnd()
});
registerCommand({
  id: 'document.scrollLeft',
  title: 'Scroll left',
  run: (ctx) => ctx.document.scrollLeft()
});
registerCommand({
  id: 'document.scrollRight',
  title: 'Scroll right',
  run: (ctx) => ctx.document.scrollRight()
});
registerCommand({
  id: 'document.nextMatch',
  title: 'Next search match',
  run: (ctx) => ctx.document.nextMatch()
});
registerCommand({
  id: 'document.prevMatch',
  title: 'Previous search match',
  run: (ctx) => ctx.document.prevMatch()
});
registerCommand({
  id: 'view.toggleTree',
  title: 'Toggle tree',
  run: (ctx) => ctx.tree.toggleOverlay()
});
registerCommand({
  id: 'palette.open',
  title: 'Open command palette',
  run: (ctx) => ctx.palette.open()
});
registerCommand({ id: 'palette.close', title: 'Close palette', run: (ctx) => ctx.palette.close() });
registerCommand({
  id: 'palette.moveNext',
  title: 'Select next palette item',
  run: (ctx) => ctx.palette.moveNext()
});
registerCommand({
  id: 'palette.movePrevious',
  title: 'Select previous palette item',
  run: (ctx) => ctx.palette.movePrevious()
});
registerCommand({
  id: 'palette.accept',
  title: 'Run selected palette command',
  run: (ctx) => ctx.palette.accept()
});
registerCommand({ id: 'search.open', title: 'Open search', run: (ctx) => ctx.search.open() });
registerCommand({
  id: 'search.openGlobal',
  title: 'Open vault search',
  run: (ctx) => ctx.search.openGlobal()
});
registerCommand({ id: 'search.close', title: 'Close search', run: (ctx) => ctx.search.close() });
registerCommand({
  id: 'search.moveNext',
  title: 'Select next search result',
  run: (ctx) => ctx.search.moveNext()
});
registerCommand({
  id: 'search.movePrevious',
  title: 'Select previous search result',
  run: (ctx) => ctx.search.movePrevious()
});
registerCommand({
  id: 'search.accept',
  title: 'Open selected search result',
  run: (ctx) => ctx.search.accept()
});
registerCommand({
  id: 'document.outline',
  title: 'Open outline',
  run: (ctx) => ctx.outline.open()
});
registerCommand({ id: 'outline.close', title: 'Close outline', run: (ctx) => ctx.outline.close() });
registerCommand({
  id: 'outline.moveNext',
  title: 'Select next outline entry',
  run: (ctx) => ctx.outline.moveNext()
});
registerCommand({
  id: 'outline.movePrevious',
  title: 'Select previous outline entry',
  run: (ctx) => ctx.outline.movePrevious()
});
registerCommand({
  id: 'outline.accept',
  title: 'Jump to selected outline entry',
  run: (ctx) => ctx.outline.accept()
});
registerCommand({
  id: 'document.links',
  title: 'Open links panel',
  run: (ctx) => ctx.links.open()
});
registerCommand({ id: 'links.close', title: 'Close links panel', run: (ctx) => ctx.links.close() });
registerCommand({
  id: 'links.moveNext',
  title: 'Select next link',
  run: (ctx) => ctx.links.moveNext()
});
registerCommand({
  id: 'links.movePrevious',
  title: 'Select previous link',
  run: (ctx) => ctx.links.movePrevious()
});
registerCommand({
  id: 'links.accept',
  title: 'Open selected linked note',
  run: (ctx) => ctx.links.accept()
});
registerCommand({
  id: 'caret.toggle',
  title: 'Toggle caret mode',
  run: (ctx) => ctx.caret.toggle()
});
registerCommand({ id: 'caret.exit', title: 'Exit caret mode', run: (ctx) => ctx.caret.exit() });
registerCommand({
  id: 'caret.moveDown',
  title: 'Caret line down',
  run: (ctx) => ctx.caret.moveDown()
});
registerCommand({
  id: 'caret.moveUp',
  title: 'Caret line up',
  run: (ctx) => ctx.caret.moveUp()
});
registerCommand({
  id: 'caret.moveLeft',
  title: 'Caret char left',
  run: (ctx) => ctx.caret.moveLeft()
});
registerCommand({
  id: 'caret.moveRight',
  title: 'Caret char right',
  run: (ctx) => ctx.caret.moveRight()
});
registerCommand({
  id: 'caret.moveToStart',
  title: 'Caret to document start',
  run: (ctx) => ctx.caret.moveToStart()
});
registerCommand({
  id: 'caret.moveToEnd',
  title: 'Caret to document end',
  run: (ctx) => ctx.caret.moveToEnd()
});
registerCommand({
  id: 'caret.paraForward',
  title: 'Caret to next paragraph',
  run: (ctx) => ctx.caret.jumpParaForward()
});
registerCommand({
  id: 'caret.paraBackward',
  title: 'Caret to previous paragraph',
  run: (ctx) => ctx.caret.jumpParaBackward()
});
registerCommand({
  id: 'caret.enterVisual',
  title: 'Enter visual mode',
  run: (ctx) => ctx.caret.enterVisual()
});
registerCommand({
  id: 'caret.exitVisual',
  title: 'Exit visual mode',
  run: (ctx) => ctx.caret.exitVisual()
});
registerCommand({
  id: 'caret.extendDown',
  title: 'Extend selection down',
  run: (ctx) => ctx.caret.extendDown()
});
registerCommand({
  id: 'caret.extendUp',
  title: 'Extend selection up',
  run: (ctx) => ctx.caret.extendUp()
});
registerCommand({
  id: 'caret.extendLeft',
  title: 'Extend selection left',
  run: (ctx) => ctx.caret.extendLeft()
});
registerCommand({
  id: 'caret.extendRight',
  title: 'Extend selection right',
  run: (ctx) => ctx.caret.extendRight()
});
registerCommand({ id: 'caret.yank', title: 'Yank rendered text', run: (ctx) => ctx.caret.yank() });
registerCommand({
  id: 'caret.nextMatch',
  title: 'Next search match',
  run: (ctx) => ctx.caret.nextMatch()
});
registerCommand({
  id: 'caret.prevMatch',
  title: 'Previous search match',
  run: (ctx) => ctx.caret.prevMatch()
});
registerCommand({
  id: 'caret.smartJump',
  title: 'Jump to link under caret',
  run: (ctx) => ctx.caret.smartJump()
});
registerCommand({
  id: 'caret.setMark',
  title: 'Set mark',
  run: (ctx, arg) => ctx.caret.setMark(arg ?? '')
});
registerCommand({
  id: 'caret.jumpMark',
  title: 'Jump to mark',
  run: (ctx, arg) => ctx.caret.jumpMark(arg ?? '')
});
registerCommand({
  id: 'visual.extendDown',
  title: 'Extend selection down',
  run: (ctx) => ctx.caret.extendDown()
});
registerCommand({
  id: 'visual.extendUp',
  title: 'Extend selection up',
  run: (ctx) => ctx.caret.extendUp()
});
registerCommand({
  id: 'visual.extendLeft',
  title: 'Extend selection left',
  run: (ctx) => ctx.caret.extendLeft()
});
registerCommand({
  id: 'visual.extendRight',
  title: 'Extend selection right',
  run: (ctx) => ctx.caret.extendRight()
});
registerCommand({
  id: 'visual.extendParaForward',
  title: 'Extend selection to next paragraph',
  run: (ctx) => ctx.caret.jumpParaForward()
});
registerCommand({
  id: 'visual.extendParaBackward',
  title: 'Extend selection to previous paragraph',
  run: (ctx) => ctx.caret.jumpParaBackward()
});
registerCommand({ id: 'visual.yank', title: 'Yank selection', run: (ctx) => ctx.caret.yank() });
registerCommand({
  id: 'visual.exit',
  title: 'Exit visual mode',
  run: (ctx) => ctx.caret.exitVisual()
});
registerCommand({
  id: 'document.clearSearch',
  title: 'Clear search highlight',
  run: (ctx) => ctx.document.clearSearch()
});
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
  title: 'Create note',
  run: (ctx) => ctx.tree.createNote?.()
});
registerCommand({
  id: 'tree.createNoteAtCurrent',
  title: 'Create note beside current note',
  run: (ctx) => ctx.tree.createNoteAtCurrent?.()
});
registerCommand({
  id: 'tree.createDirectory',
  title: 'Create directory',
  run: (ctx) => ctx.tree.createDirectory?.()
});
registerCommand({
  id: 'tree.rename',
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
  title: 'Move marked entries',
  run: (ctx) => ctx.tree.moveMarks?.()
});
registerCommand({
  id: 'tree.delete',
  title: 'Move entries to trash',
  run: (ctx) => ctx.tree.deleteSelection?.()
});
registerCommand({
  id: 'templates.manage',
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
registerCommand({ id: 'vaultDialog.cancel', run: (ctx) => ctx.vaultDialog?.cancel() });
registerCommand({ id: 'vaultDialog.submit', run: (ctx) => ctx.vaultDialog?.submit() });
registerCommand({ id: 'vaultDialog.next', run: (ctx) => ctx.vaultDialog?.next() });
registerCommand({ id: 'vaultDialog.previous', run: (ctx) => ctx.vaultDialog?.previous() });
registerCommand({ id: 'vaultDialog.ignore', run: (ctx) => ctx.vaultDialog?.ignore() });

registerCommand({
  id: 'editor.open',
  title: 'Open in editor',
  run: (ctx) => {
    void ctx.editor.openCurrentNote();
  }
});

registerCommand({
  id: 'theme.useSystem',
  title: 'Use system theme',
  run: (ctx) => {
    void ctx.theme.useSystem();
  }
});

registerCommand({
  id: 'theme.useLight',
  title: 'Use light theme',
  run: (ctx) => {
    void ctx.theme.useLight();
  }
});

registerCommand({
  id: 'theme.useDark',
  title: 'Use dark theme',
  run: (ctx) => {
    void ctx.theme.useDark();
  }
});

registerCommand({
  id: 'theme.cycle',
  title: 'Cycle theme',
  run: (ctx) => {
    void ctx.theme.cycle();
  }
});

registerCommand({
  id: 'document.quickOpen',
  title: 'Quick open note',
  run: (ctx) => ctx.quickOpen.open()
});

registerCommand({
  id: 'app.openVault',
  title: 'Open vault',
  run: (ctx) => ctx.vault.open()
});

registerCommand({
  id: 'app.closeVault',
  title: 'Close vault',
  run: (ctx) => ctx.vault.close()
});

registerCommand({ id: 'tree.close', title: 'Close tree', run: (ctx) => ctx.tree.close() });

registerCommand({
  id: 'quickOpen.close',
  title: 'Close quick open',
  run: (ctx) => ctx.quickOpen.close()
});
registerCommand({
  id: 'quickOpen.moveNext',
  title: 'Next quick open item',
  run: (ctx) => ctx.quickOpen.moveNext()
});
registerCommand({
  id: 'quickOpen.movePrevious',
  title: 'Previous quick open item',
  run: (ctx) => ctx.quickOpen.movePrevious()
});
registerCommand({
  id: 'quickOpen.accept',
  title: 'Open selected note',
  run: (ctx) => ctx.quickOpen.accept()
});

export const DOCUMENT_KEYMAP: Keymap = new Map([
  ['j', 'document.scrollLineDown'],
  ['k', 'document.scrollLineUp'],
  ['h', 'document.scrollLeft'],
  ['l', 'document.scrollRight'],
  ['<C-d>', 'document.scrollHalfDown'],
  ['<C-u>', 'document.scrollHalfUp'],
  ['gg', 'document.scrollToTop'],
  ['G', 'document.scrollToBottom'],
  ['n', 'document.nextMatch'],
  ['N', 'document.prevMatch'],
  ['s', 'caret.toggle'],
  [':', 'palette.open'],
  ['/', 'search.open'],
  ['o', 'document.outline'],
  ['b', 'document.links'],
  ['<C-e>', 'editor.open'],
  ['=', 'zoom.fitWidth'],
  ['F9', 'zoom.fitWidth'],
  ['F10', 'zoom.fitContentWidth'],
  ['+', 'zoom.in'],
  ['-', 'zoom.out'],
  ['Escape', 'document.clearSearch']
]);

export const TREE_KEYMAP: Keymap = new Map([
  ['j', 'tree.moveDown'],
  ['k', 'tree.moveUp'],
  ['ArrowDown', 'tree.moveDown'],
  ['ArrowUp', 'tree.moveUp'],
  ['ArrowRight', 'tree.expand'],
  ['ArrowLeft', 'tree.collapse'],
  ['l', 'tree.expand'],
  ['h', 'tree.collapse'],
  ['gg', 'tree.selectFirst'],
  ['G', 'tree.selectLast'],
  ['/', 'tree.openSearch'],
  ['Enter', 'tree.openSelection'],
  ['%', 'tree.createNote'],
  ['d', 'tree.createDirectory'],
  ['R', 'tree.rename'],
  ['mf', 'tree.toggleMark'],
  ['mu', 'tree.clearMarks'],
  ['mm', 'tree.moveMarks'],
  ['D', 'tree.delete'],
  ['Escape', 'tree.close']
]);

export const TREE_SEARCH_KEYMAP: Keymap = new Map([
  ['j', 'tree.moveDown'],
  ['k', 'tree.moveUp'],
  ['ArrowDown', 'tree.moveDown'],
  ['ArrowUp', 'tree.moveUp'],
  ['<C-n>', 'tree.moveDown'],
  ['<C-p>', 'tree.moveUp'],
  ['Enter', 'tree.openSelection'],
  ['Escape', 'tree.closeSearch'],
  ['Backspace', 'tree.searchBackspace'],
  ['*', 'tree.searchAppend']
]);

export const TEMPLATES_KEYMAP: Keymap = new Map([
  ['j', 'templates.moveNext'],
  ['k', 'templates.movePrevious'],
  ['ArrowDown', 'templates.moveNext'],
  ['ArrowUp', 'templates.movePrevious'],
  ['Enter', 'templates.open'],
  ['R', 'templates.rename'],
  ['D', 'templates.delete'],
  ['Escape', 'templates.close']
]);

export const VAULT_DIALOG_KEYMAP: Keymap = new Map([
  ['Escape', 'vaultDialog.cancel'],
  ['Enter', 'vaultDialog.submit'],
  ['ArrowDown', 'vaultDialog.next'],
  ['<C-n>', 'vaultDialog.next'],
  ['ArrowUp', 'vaultDialog.previous'],
  ['<C-p>', 'vaultDialog.previous'],
  ['<C-b>', 'vaultDialog.cancel'],
  [':', 'vaultDialog.ignore'],
  ['/', 'vaultDialog.ignore']
]);

export const PALETTE_KEYMAP: Keymap = new Map([
  ['Escape', 'palette.close'],
  ['Enter', 'palette.accept'],
  ['ArrowDown', 'palette.moveNext'],
  ['<C-n>', 'palette.moveNext'],
  ['ArrowUp', 'palette.movePrevious'],
  ['<C-p>', 'palette.movePrevious']
]);

export const SEARCH_KEYMAP: Keymap = new Map([
  ['Escape', 'search.close'],
  ['Enter', 'search.accept'],
  ['ArrowDown', 'search.moveNext'],
  ['<C-n>', 'search.moveNext'],
  ['ArrowUp', 'search.movePrevious'],
  ['<C-p>', 'search.movePrevious']
]);

export const OUTLINE_KEYMAP: Keymap = new Map([
  ['Escape', 'outline.close'],
  ['Enter', 'outline.accept'],
  ['ArrowDown', 'outline.moveNext'],
  ['j', 'outline.moveNext'],
  ['ArrowUp', 'outline.movePrevious'],
  ['k', 'outline.movePrevious']
]);

export const LINKS_KEYMAP: Keymap = new Map([
  ['Escape', 'links.close'],
  ['Enter', 'links.accept'],
  ['ArrowDown', 'links.moveNext'],
  ['j', 'links.moveNext'],
  ['ArrowUp', 'links.movePrevious'],
  ['k', 'links.movePrevious']
]);

export const CARET_KEYMAP: Keymap = new Map([
  ['j', 'caret.moveDown'],
  ['k', 'caret.moveUp'],
  ['h', 'caret.moveLeft'],
  ['l', 'caret.moveRight'],
  ['{', 'caret.paraBackward'],
  ['}', 'caret.paraForward'],
  ['gg', 'caret.moveToStart'],
  ['G', 'caret.moveToEnd'],
  ['<C-d>', 'document.scrollHalfDown'],
  ['<C-u>', 'document.scrollHalfUp'],
  ['v', 'caret.enterVisual'],
  ['Enter', 'caret.smartJump'],
  ['gd', 'caret.smartJump'],
  ['n', 'caret.nextMatch'],
  ['N', 'caret.prevMatch'],
  ['m*', 'caret.setMark'],
  ["'*", 'caret.jumpMark'],
  [':', 'palette.open'],
  ['/', 'search.open'],
  ['o', 'document.outline'],
  ['b', 'document.links'],
  ['<C-e>', 'editor.open'],
  ['Escape', 'caret.exit'],
  ['=', 'zoom.fitWidth'],
  ['F9', 'zoom.fitWidth'],
  ['F10', 'zoom.fitContentWidth'],
  ['+', 'zoom.in'],
  ['-', 'zoom.out']
]);

export const VISUAL_KEYMAP: Keymap = new Map([
  ['j', 'visual.extendDown'],
  ['k', 'visual.extendUp'],
  ['h', 'visual.extendLeft'],
  ['l', 'visual.extendRight'],
  ['{', 'visual.extendParaBackward'],
  ['}', 'visual.extendParaForward'],
  ['y', 'visual.yank'],
  ['Escape', 'visual.exit'],
  [':', 'palette.open'],
  ['/', 'search.open'],
  ['o', 'document.outline'],
  ['<C-e>', 'editor.open'],
  ['=', 'zoom.fitWidth'],
  ['F9', 'zoom.fitWidth'],
  ['F10', 'zoom.fitContentWidth'],
  ['+', 'zoom.in'],
  ['-', 'zoom.out']
]);

export const QUICK_OPEN_KEYMAP: Keymap = new Map([
  ['Escape', 'quickOpen.close'],
  ['Enter', 'quickOpen.accept'],
  ['ArrowDown', 'quickOpen.moveNext'],
  ['<C-n>', 'quickOpen.moveNext'],
  ['ArrowUp', 'quickOpen.movePrevious'],
  ['<C-p>', 'quickOpen.movePrevious']
]);

export const GLOBAL_KEYMAP: Keymap = new Map([
  ['<C-b>', 'view.toggleTree'],
  [':', 'palette.open'],
  ['/', 'search.open'],
  ['<C-p>', 'document.quickOpen'],
  ['<C-n>', 'tree.createNoteAtCurrent']
]);
