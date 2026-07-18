import { app, BrowserWindow, protocol, session } from 'electron';

import { readBuildInfo } from './build-info';
import { openConfiguredVaultFromEnvironment, registerIpcHandlers } from './ipc';
import {
  createMainWindow,
  installContentSecurityPolicy,
  installTypstWorkerProtocol
} from './window';

if (process.argv.includes('--build-info')) {
  console.log(readBuildInfo(process.resourcesPath).trimEnd());
  app.exit(0);
} else {
  if (process.env.FOLEA_DISABLE_HARDWARE_ACCELERATION === '1') {
    app.disableHardwareAcceleration();
  }

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
}
