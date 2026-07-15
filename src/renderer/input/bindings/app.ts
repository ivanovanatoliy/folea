import { registerCommand } from '../commands';

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
