import { app, BrowserWindow, session } from 'electron';

import { openConfiguredVaultFromEnvironment, registerIpcHandlers } from './ipc';
import { createMainWindow, installContentSecurityPolicy } from './window';

void app.whenReady().then(() => {
  installContentSecurityPolicy(session.defaultSession);
  registerIpcHandlers();
  void openConfiguredVaultFromEnvironment().then(() => {
    createMainWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
