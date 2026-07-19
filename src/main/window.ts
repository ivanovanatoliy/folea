import { app, BrowserWindow, protocol, shell, type Session, type WebPreferences } from 'electron';
import { existsSync, promises as fs } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

import {
  rendererContentSecurityPolicy,
  TYPST_WORKER_CSP_MARKER,
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
    const isTypstWorker = isTypstCompileWorkerUrl(details.url);
    const contentSecurityPolicy = isTypstWorker
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

const WORKER_ASSET_CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf'
};

export const parseTypstWorkerAssetName = (requestUrl: string): string => {
  const url = new URL(requestUrl);
  if (url.protocol !== 'folea-worker:' || url.hostname !== 'assets') {
    throw new Error('Invalid Typst worker asset origin');
  }

  const assetName = decodeURIComponent(url.pathname.slice(1));
  if (
    assetName.length === 0 ||
    assetName.includes('/') ||
    assetName.includes('\\') ||
    assetName === '.' ||
    assetName === '..' ||
    WORKER_ASSET_CONTENT_TYPES[extname(assetName)] === undefined
  ) {
    throw new Error('Invalid Typst worker asset path');
  }
  return assetName;
};

export const installTypstWorkerProtocol = (): void => {
  protocol.handle('folea-worker', async (request) => {
    try {
      const assetName = parseTypstWorkerAssetName(request.url);
      const assetsRoot = resolve(join(app.getAppPath(), 'out/renderer/assets'));
      const assetPath = resolve(join(assetsRoot, assetName));
      if (!assetPath.startsWith(`${assetsRoot}${sep}`)) {
        return new Response('Not found', { status: 404 });
      }

      const body = await fs.readFile(assetPath);
      return new Response(body, {
        headers: {
          'Content-Type': WORKER_ASSET_CONTENT_TYPES[extname(assetName)]!,
          'Content-Security-Policy': typstWorkerContentSecurityPolicy,
          'Cache-Control': 'no-cache'
        }
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
};

export const isTypstCompileWorkerUrl = (url: string): boolean => {
  try {
    return new URL(url).searchParams.get(TYPST_WORKER_CSP_MARKER) === '1';
  } catch {
    return false;
  }
};

export const createMainWindow = (): BrowserWindow => {
  const iconPath = join(
    app.getAppPath(),
    process.platform === 'win32'
      ? 'assets/logo/app-icon-windows.ico'
      : 'assets/logo/app-icon-dark.svg'
  );
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
