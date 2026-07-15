import type { Keymap } from '../keymap';

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
  ['zM', 'tree.collapseAll'],
  ['zR', 'tree.expandAll'],
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
