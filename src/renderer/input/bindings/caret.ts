import { registerCommand } from '../commands';

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
