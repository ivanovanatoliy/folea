import { app, BrowserWindow, shell, type Session, type WebPreferences } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  rendererContentSecurityPolicy,
  typstWorkerContentSecurityPolicy
} from '../shared/security';

let contentSecurityPolicyInstalled = false;

export const createWebPreferences = (preloadPath: string): WebPreferences => ({
  preload: preloadPath,
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true
});

export const installContentSecurityPolicy = (targetSession: Session): void => {
  if (contentSecurityPolicyInstalled) {
    return;
  }

  targetSession.webRequest.onHeadersReceived((details, callback) => {
    const contentSecurityPolicy = isTypstCompileWorkerUrl(details.url)
      ? typstWorkerContentSecurityPolicy
      : rendererContentSecurityPolicy;

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy]
      }
    });
  });

  contentSecurityPolicyInstalled = true;
};

const isTypstCompileWorkerUrl = (url: string): boolean =>
  url.includes('/src/workers/typst-compile/');

export const createMainWindow = (): BrowserWindow => {
  const iconPath = join(app.getAppPath(), 'build/icon.png');
  const icon = existsSync(iconPath) ? iconPath : undefined;
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 420,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f7f8fa',
    ...(icon ? { icon } : {}),
    webPreferences: createWebPreferences(join(__dirname, '../preload/index.js'))
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }

    return { action: 'deny' };
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
};
