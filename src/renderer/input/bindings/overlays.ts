import { registerCommand } from '../commands';

registerCommand({
  id: 'palette.open',
  exposure: 'action',
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
registerCommand({
  id: 'search.open',
  exposure: 'action',
  title: 'Open search',
  run: (ctx) => ctx.search.open()
});
registerCommand({
  id: 'search.openGlobal',
  exposure: 'action',
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
  exposure: 'action',
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
  exposure: 'action',
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
