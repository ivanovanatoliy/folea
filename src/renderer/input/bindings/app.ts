import { registerCommand } from '../commands';

registerCommand({
  id: 'app.showKeyboardHelp',
  exposure: 'action',
  title: 'Show keyboard help',
  run: (ctx) => ctx.help?.toggle()
});

registerCommand({
  id: 'help.close',
  exposure: 'internal',
  title: 'Close keyboard help',
  run: (ctx) => ctx.help?.close()
});

registerCommand({
  id: 'help.nextTab',
  exposure: 'internal',
  title: 'Next keyboard help tab',
  run: (ctx) => ctx.help?.nextTab()
});

registerCommand({
  id: 'help.previousTab',
  exposure: 'internal',
  title: 'Previous keyboard help tab',
  run: (ctx) => ctx.help?.previousTab()
});

registerCommand({
  id: 'help.scrollDown',
  exposure: 'internal',
  title: 'Scroll keyboard help down',
  run: (ctx) => ctx.help?.scrollDown()
});

registerCommand({
  id: 'help.scrollUp',
  exposure: 'internal',
  title: 'Scroll keyboard help up',
  run: (ctx) => ctx.help?.scrollUp()
});

registerCommand({
  id: 'help.ignore',
  exposure: 'internal',
  run: () => {}
});

registerCommand({
  id: 'cache.clearApplication',
  exposure: 'action',
  title: 'Clear application cache',
  run: (ctx) => {
    void ctx.cache.clearApplication();
  }
});

registerCommand({
  id: 'cache.clearCurrentVault',
  exposure: 'action',
  title: 'Clear current vault cache',
  run: (ctx) => {
    void ctx.cache.clearCurrentVault();
  }
});

registerCommand({
  id: 'editor.open',
  exposure: 'action',
  title: 'Open in editor',
  run: (ctx) => {
    void ctx.editor.openCurrentNote();
  }
});

registerCommand({
  id: 'theme.useSystem',
  exposure: 'action',
  title: 'Use system theme',
  run: (ctx) => {
    void ctx.theme.useSystem();
  }
});

registerCommand({
  id: 'theme.useLight',
  exposure: 'action',
  title: 'Use light theme',
  run: (ctx) => {
    void ctx.theme.useLight();
  }
});

registerCommand({
  id: 'theme.useDark',
  exposure: 'action',
  title: 'Use dark theme',
  run: (ctx) => {
    void ctx.theme.useDark();
  }
});

registerCommand({
  id: 'theme.cycle',
  exposure: 'action',
  title: 'Cycle theme',
  run: (ctx) => {
    void ctx.theme.cycle();
  }
});

registerCommand({
  id: 'document.quickOpen',
  exposure: 'action',
  title: 'Quick open note',
  run: (ctx) => ctx.quickOpen.open()
});

registerCommand({
  id: 'app.openVault',
  exposure: 'action',
  title: 'Open vault',
  run: (ctx) => ctx.vault.open()
});

registerCommand({
  id: 'app.closeVault',
  exposure: 'action',
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
