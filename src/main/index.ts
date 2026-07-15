import { app, BrowserWindow, protocol, session } from 'electron';

import { openConfiguredVaultFromEnvironment, registerIpcHandlers } from './ipc';
import {
  createMainWindow,
  installContentSecurityPolicy,
  installTypstWorkerProtocol
} from './window';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'folea-worker',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

void app.whenReady().then(() => {
  installContentSecurityPolicy(session.defaultSession);
  installTypstWorkerProtocol();
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
