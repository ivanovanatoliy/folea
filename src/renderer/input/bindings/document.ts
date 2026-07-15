import { registerCommand } from '../commands';

registerCommand({
  id: 'zoom.fitWidth',
  exposure: 'action',
  title: 'Fit document width',
  run: (ctx) => ctx.zoom.fitWidth()
});
registerCommand({
  id: 'zoom.fitContentWidth',
  exposure: 'action',
  title: 'Fit content width',
  run: (ctx) => ctx.zoom.fitContentWidth()
});
registerCommand({
  id: 'zoom.fitPage',
  exposure: 'action',
  title: 'Fit one page height',
  run: (ctx) => ctx.zoom.fitPage()
});
registerCommand({
  id: 'zoom.in',
  exposure: 'action',
  title: 'Zoom in 10%',
  run: (ctx) => ctx.zoom.zoomIn()
});
registerCommand({
  id: 'zoom.out',
  exposure: 'action',
  title: 'Zoom out 10%',
  run: (ctx) => ctx.zoom.zoomOut()
});

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
  exposure: 'action',
  title: 'Toggle tree',
  run: (ctx) => ctx.tree.toggleOverlay()
});
