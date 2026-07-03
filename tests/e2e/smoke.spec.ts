import { expect, test, type Page } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import solid from 'vite-plugin-solid';

interface SecurityPreferences {
  readonly nodeIntegration: boolean | undefined;
  readonly contextIsolation: boolean | undefined;
  readonly sandbox: boolean | undefined;
  readonly webSecurity: boolean | undefined;
}

interface WebContentsWithPreferences {
  getLastWebPreferences(): SecurityPreferences;
}

let electronApp: ElectronApplication | undefined;

const currentEnv = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );

const launchApp = async (env = currentEnv()): Promise<ElectronApplication> => {
  electronApp = await electron.launch({
    args: [process.cwd()],
    env
  });
  return electronApp;
};

const startRendererDevServer = async (): Promise<{ server: ViteDevServer; url: string }> => {
  const server = await createServer({
    appType: 'spa',
    configFile: false,
    root: path.join(process.cwd(), 'src/renderer'),
    plugins: [solid()],
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      fs: {
        allow: [process.cwd()]
      }
    },
    optimizeDeps: {
      include: [
        '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs',
        '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer.mjs'
      ]
    },
    worker: {
      format: 'es'
    }
  });

  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) {
    await server.close();
    throw new Error('Vite dev server did not expose a local URL');
  }

  return { server, url };
};

const installCspViolationRecorder = async (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>
): Promise<void> => {
  await page.evaluate(() => {
    const target = window as Window & { __foleaCspViolations?: string[] };
    target.__foleaCspViolations = [];
    window.addEventListener('securitypolicyviolation', (event) => {
      target.__foleaCspViolations?.push(
        `${event.effectiveDirective}: ${event.blockedURI || 'inline'}`
      );
    });
  });
};

const expectNoCspViolations = async (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>
): Promise<void> => {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const target = window as Window & { __foleaCspViolations?: string[] };
        return target.__foleaCspViolations ?? [];
      })
    )
    .toEqual([]);
};

const expectSurfaceRendered = async (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>
): Promise<void> => {
  await expect
    .poll(
      async () => {
        const surface = page.getByTestId('typst-surface');
        const state = await surface.getAttribute('data-state');

        if (state !== 'error') {
          return state;
        }

        const errorText = await page.getByTestId('typst-render-error').textContent();
        return `error: ${errorText}`;
      },
      { timeout: 10_000 }
    )
    .toBe('rendered');
};

const waitForSurfacePrefetched = (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  noteId: string
): Promise<boolean> =>
  page.evaluate(
    (expectedNoteId) =>
      new Promise<boolean>((resolve) => {
        window.addEventListener('folea:surface-prefetched', (event: Event) => {
          const customEvent = event as CustomEvent<{ noteId: string; fromCache: boolean }>;
          if (customEvent.detail.noteId === expectedNoteId) {
            resolve(customEvent.detail.fromCache);
          }
        });
      }),
    noteId
  );

const selectedTreeRelPath = (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>
): Promise<string | null> =>
  page.evaluate(
    () =>
      document
        .querySelector('[data-testid="tree-row"][data-selected="true"]')
        ?.getAttribute('data-relpath') ?? null
  );

const selectTreeRow = async (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  relPath: string
): Promise<void> => {
  await page.keyboard.press('g');
  await page.keyboard.press('g');

  for (let attempt = 0; attempt < 200; attempt += 1) {
    if ((await selectedTreeRelPath(page)) === relPath) {
      return;
    }

    await page.keyboard.press('j');
  }

  throw new Error(`Unable to reach tree row: ${relPath}`);
};

test.afterEach(async () => {
  if (electronApp) {
    const proc = electronApp.process();
    const pid = proc.pid;
    await electronApp
      .evaluate(async ({ app }) => {
        app.quit();
      })
      .catch(() => undefined);
    await Promise.race([
      electronApp.close().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000))
    ]);
    if (process.platform === 'win32' && pid != null) {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try {
        proc.kill();
      } catch {
        /* already exited */
      }
    }
    // Give OS time to release handles before Playwright worker cleanup runs
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    electronApp = undefined;
  }
});

test('opens the minimalist shell and bridge', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();

  await expect(page.getByTestId('folea-shell')).toBeVisible();
  await expect(page.getByTestId('document-surface')).toBeVisible();

  await expect.poll(() => page.evaluate(() => window.folea.app.version())).toBe('0.0.0');

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.folea.vault
          .open('/tmp/folea-should-not-open')
          .then(() => 'opened')
          .catch((error: unknown) => (error instanceof Error ? error.message : String(error)))
      )
    )
    .toContain('only available in test mode');
});

test('keeps the renderer security invariants enabled', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();

  await expect(page.getByTestId('folea-shell')).toBeVisible();

  const preferences = await app.evaluate<SecurityPreferences>(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) {
      throw new Error('No BrowserWindow was created');
    }

    const webContents = window.webContents as unknown as WebContentsWithPreferences;
    const webPreferences = webContents.getLastWebPreferences();
    return {
      nodeIntegration: webPreferences.nodeIntegration,
      contextIsolation: webPreferences.contextIsolation,
      sandbox: webPreferences.sandbox,
      webSecurity: webPreferences.webSecurity
    };
  });

  expect(preferences.nodeIntegration).toBe(false);
  expect(preferences.contextIsolation).toBe(true);
  expect(preferences.sandbox).toBe(true);
  expect(preferences.webSecurity).toBe(true);

  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');

  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp).toContain("object-src 'none'");
});

test('opens a configured vault, lists notes, and renders the selected note', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-vault-'));
  const detailBody = Array.from({ length: 48 }, (_, i) => `Detail line ${i + 1}.`).join('\n\n');
  await fs.mkdir(path.join(vaultRoot, 'nested'));
  await fs.writeFile(
    path.join(vaultRoot, 'alpha.typ'),
    `#import "shared.typ": shared\n= Alpha\n\nHello from folea.\n== Details\n\n${detailBody}\n\n#shared\n`,
    'utf8'
  );
  await fs.writeFile(path.join(vaultRoot, 'shared.typ'), '#let shared = [Imported shared text]\n');
  await fs.writeFile(path.join(vaultRoot, 'nested', 'beta.typ'), '= Beta\n', 'utf8');
  await fs.mkdir(path.join(vaultRoot, 'many', 'one'), { recursive: true });
  await fs.mkdir(path.join(vaultRoot, 'many', 'two'), { recursive: true });
  await fs.writeFile(path.join(vaultRoot, 'many', 'one', 'a.typ'), '= A\n', 'utf8');
  await fs.writeFile(path.join(vaultRoot, 'many', 'one', 'b.typ'), '= B\n', 'utf8');
  await fs.writeFile(path.join(vaultRoot, 'many', 'two', 'c.typ'), '= C\n', 'utf8');
  await fs.writeFile(path.join(vaultRoot, 'many', 'two', 'd.typ'), '= D\n', 'utf8');

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();
    await installCspViolationRecorder(page);

    await expect(page.getByTestId('vault-status')).toHaveText('vault open');
    await expectSurfaceRendered(page);
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Alpha');
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Hello from folea.');
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Imported shared text');
    await expect(page.getByTestId('typst-rendered-document')).not.toContainText('= Alpha');

    await expect
      .poll(() => page.evaluate(() => window.folea.vault.read({ relPath: 'nested/beta.typ' })))
      .toBe('= Beta\n');

    await page.keyboard.press('Control+b');
    await expect(page.getByTestId('statusline-mode')).toHaveText('tree');
    await expect(page.getByTestId('tree-selected-row')).toHaveCount(1);
    await expect.poll(() => page.getByTestId('tree-row').count()).toBeGreaterThan(7);
    await expect(page.getByTestId('tree-overlay')).toContainText('alpha.typ');
    await expect(page.getByTestId('tree-overlay')).toContainText('nested');
    await selectTreeRow(page, 'nested/beta.typ');
    const betaPrefetched = waitForSurfacePrefetched(page, 'nested/beta.typ');
    await page.keyboard.press('k');
    await page.keyboard.press('j');
    await betaPrefetched;
    const betaCachedRender = page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          window.addEventListener('folea:surface-rendered', (event: Event) => {
            const customEvent = event as CustomEvent<{ noteId: string; fromCache: boolean }>;
            if (customEvent.detail.noteId === 'nested/beta.typ') {
              resolve(customEvent.detail.fromCache);
            }
          });
        })
    );
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('statusline-mode')).toHaveText('document');
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Beta');
    await expect(betaCachedRender).resolves.toBe(true);

    const cachedRender = page.evaluate(
      () =>
        new Promise<{ fromCache: boolean; durationMs: number }>((resolve) => {
          window.addEventListener('folea:surface-rendered', (event: Event) => {
            const customEvent = event as CustomEvent<{
              noteId: string;
              fromCache: boolean;
              durationMs: number;
            }>;
            if (customEvent.detail.noteId === 'alpha.typ') {
              resolve({
                fromCache: customEvent.detail.fromCache,
                durationMs: customEvent.detail.durationMs
              });
            }
          });
        })
    );
    await page.keyboard.press('Control+b');
    await selectTreeRow(page, 'alpha.typ');
    const alphaPrefetched = waitForSurfacePrefetched(page, 'alpha.typ');
    await page.keyboard.press('k');
    await page.keyboard.press('j');
    await alphaPrefetched;
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Alpha');
    await expect(cachedRender).resolves.toMatchObject({ fromCache: true });

    await page.keyboard.press(':');
    await expect(page.getByTestId('statusline-mode')).toHaveText('palette');
    const paletteBox = await page.getByTestId('palette-overlay').boundingBox();
    const viewport = page.viewportSize();
    expect(paletteBox && viewport ? Math.round(paletteBox.x + paletteBox.width / 2) : 0).toBe(
      viewport ? Math.round(viewport.width / 2) : 0
    );
    await expect
      .poll(() =>
        page
          .getByTestId('palette-results')
          .evaluate((el) => window.getComputedStyle(el).scrollbarWidth)
      )
      .toBe('none');
    for (let i = 0; i < 18; i += 1) {
      await page.keyboard.press('ArrowDown');
    }
    await expect
      .poll(() => page.getByTestId('palette-results').evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await page.keyboard.type('document.outline');
    await expect(page.getByTestId('palette-input')).toHaveValue('document.outline');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('statusline-mode')).toHaveText('outline');
    await expect(page.getByTestId('outline-overlay')).toContainText('Alpha');
    await expect(page.getByTestId('outline-overlay')).toContainText('Details');
    const outlineScrollBefore = await page
      .getByTestId('typst-surface')
      .evaluate((el) => el.scrollTop);
    await page.keyboard.press('j');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (prev) => (document.querySelector('[data-testid="typst-surface"]')?.scrollTop ?? 0) > prev,
      outlineScrollBefore
    );

    await page.keyboard.press('/');
    await expect(page.getByTestId('statusline-mode')).toHaveText('search');
    await expect(page.getByTestId('search-overlay')).toContainText('file search');
    const localSearchScrollBefore = await page
      .getByTestId('typst-surface')
      .evaluate((el) => el.scrollTop);
    await page.keyboard.type('Detail line 30');
    await expect(page.getByTestId('search-input')).toHaveValue('Detail line 30');
    await expect.poll(() => page.getByTestId('search-row').count()).toBeGreaterThan(0);
    await expect(page.getByTestId('search-overlay')).toContainText('alpha.typ');
    await expect(page.getByTestId('search-overlay')).not.toContainText('nested/beta.typ');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('statusline-mode')).toHaveText('document');
    await expect(page.getByTestId('surface-search-highlight')).toHaveCount(1);
    await page.waitForFunction(
      (prev) => (document.querySelector('[data-testid="typst-surface"]')?.scrollTop ?? 0) > prev,
      localSearchScrollBefore
    );

    await page.keyboard.press('Control+p');
    await expect(page.getByTestId('statusline-mode')).toHaveText('quick-open');
    await expect(page.getByTestId('quick-open-overlay')).toContainText('recent notes');
    await page.keyboard.type('Beta');
    await expect(page.getByTestId('quick-open-input')).toHaveValue('Beta');
    await expect(page.getByTestId('quick-open-overlay')).toContainText('vault search');
    await expect.poll(() => page.getByTestId('quick-open-row').count()).toBeGreaterThan(0);
    await expect(page.getByTestId('quick-open-overlay')).toContainText('nested/beta.typ');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('statusline-mode')).toHaveText('document');
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Beta');

    await page.evaluate(() =>
      window.folea.vault.create({ relPath: 'created.typ', contents: '= Created\n' })
    );
    await page.keyboard.press('Control+b');
    await expect(page.getByTestId('tree-overlay')).toContainText('created.typ');
    await expectNoCspViolations(page);
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});

test('modal input: status line shows active context and scroll keys move the surface', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-input-'));
  const longContent = Array.from({ length: 80 }, (_, i) => `Line ${i + 1} of the note.`).join(
    '\n\n'
  );
  await fs.writeFile(path.join(vaultRoot, 'long.typ'), `= Long Note\n\n${longContent}\n`, 'utf8');

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();

    await expect(page.getByTestId('statusline-mode')).toHaveText('document');

    await expectSurfaceRendered(page);
    await expect(page.getByTestId('statusline-page')).toHaveText(/\[1\/\d+\]/);
    await expect
      .poll(() =>
        page
          .getByTestId('typst-surface')
          .evaluate((el) => window.getComputedStyle(el).scrollbarWidth)
      )
      .toBe('none');

    await page.keyboard.press('Control+b');
    await expect(page.getByTestId('statusline-mode')).toHaveText('tree');
    const treeScrollTopBefore = await page
      .getByTestId('typst-surface')
      .evaluate((el) => el.scrollTop);
    await page.keyboard.press('j');
    await page.waitForTimeout(50);
    expect(await page.getByTestId('typst-surface').evaluate((el) => el.scrollTop)).toBe(
      treeScrollTopBefore
    );
    await page.keyboard.press('Control+b');
    await expect(page.getByTestId('statusline-mode')).toHaveText('document');

    const scrollTopBefore = await page.getByTestId('typst-surface').evaluate((el) => el.scrollTop);
    await page.keyboard.press('j');
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="typst-surface"]')?.scrollTop ?? 0) > 0
    );
    const scrollTopAfterJ = await page.getByTestId('typst-surface').evaluate((el) => el.scrollTop);
    expect(scrollTopAfterJ).toBeGreaterThan(scrollTopBefore);

    await page.keyboard.press('Control+d');
    await page.waitForFunction(
      (prev) => (document.querySelector('[data-testid="typst-surface"]')?.scrollTop ?? 0) > prev,
      scrollTopAfterJ
    );

    await page.keyboard.press('G');
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="typst-surface"]');
      if (!el) return false;
      return el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    });
    await expect
      .poll(async () => {
        const text = (await page.getByTestId('statusline-page').textContent()) ?? '';
        const match = /^\[(\d+)\/(\d+)\]$/.exec(text);
        return match ? match[1] === match[2] : false;
      })
      .toBe(true);

    await page.keyboard.press('g');
    await page.keyboard.press('g');
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="typst-surface"]')?.scrollTop ?? 1) === 0
    );
    expect(await page.getByTestId('typst-surface').evaluate((el) => el.scrollTop)).toBe(0);
    await expect(page.getByTestId('statusline-page')).toHaveText(/\[1\/\d+\]/);
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});

test('renders a dev-served note without CSP violations', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-dev-vault-'));
  await fs.writeFile(path.join(vaultRoot, 'alpha.typ'), '= Alpha\n\nDev render path.\n', 'utf8');
  let devServer: ViteDevServer | undefined;

  try {
    const started = await startRendererDevServer();
    devServer = started.server;

    const app = await launchApp({
      ...currentEnv(),
      ELECTRON_RENDERER_URL: started.url,
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1'
    });
    const page = await app.firstWindow();

    await expect(page.getByTestId('folea-shell')).toBeVisible();
    await installCspViolationRecorder(page);

    await page.evaluate((rootPath) => window.folea.vault.open(rootPath), vaultRoot);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('folea:vault-refresh')));

    await expectSurfaceRendered(page);
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Alpha');
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Dev render path.');
    await expectNoCspViolations(page);
  } finally {
    await devServer?.close();
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});

test('editor commands appear in the command palette', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();

  await expect(page.getByTestId('folea-shell')).toBeVisible();

  await page.keyboard.press(':');
  await expect(page.getByTestId('statusline-mode')).toHaveText('palette');

  await page.keyboard.type('Open in editor');
  await expect
    .poll(() => page.getByTestId('palette-results').textContent())
    .toContain('Open in editor');

  await page.keyboard.press('Escape');
});

test('editor.open rejects invalid relPath in the preload', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();

  await expect(page.getByTestId('folea-shell')).toBeVisible();

  const error = await page.evaluate(async () => {
    try {
      await window.folea.editor.open('../secret');
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  });

  expect(error).toBeTruthy();
  expect(typeof error).toBe('string');
});

test('loads theme and key remaps from config files', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-config-vault-'));
  const userDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-user-data-'));
  await fs.writeFile(path.join(vaultRoot, 'alpha.typ'), '= Alpha\n', 'utf8');
  await fs.writeFile(path.join(userDataRoot, 'prefs.config'), 'theme = dark\n', 'utf8');
  await fs.writeFile(path.join(userDataRoot, 'keys.config'), 'view.toggleTree t\n', 'utf8');

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot,
      FOLEA_TEST_USER_DATA_DIR: userDataRoot
    });
    const page = await app.firstWindow();

    await expect(page.locator(':root')).toHaveAttribute('data-theme', 'dark');
    await expectSurfaceRendered(page);

    await page.keyboard.press('Control+b');
    await expect(page.getByTestId('tree-overlay')).toHaveCount(0);

    await page.keyboard.press('t');
    await expect(page.getByTestId('statusline-mode')).toHaveText('tree');
    await expect(page.getByTestId('tree-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('statusline-mode')).toHaveText('document');

    await page.keyboard.press(':');
    await expect(page.getByTestId('statusline-mode')).toHaveText('palette');
    await page.keyboard.type('Toggle tree');
    await expect(page.getByTestId('palette-results')).toContainText('Toggle tree');
    await expect(page.getByTestId('palette-results')).toContainText('t');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('statusline-mode')).toHaveText('document');

    await page.keyboard.press(':');
    await page.keyboard.type('Use light theme');
    await expect(page.getByTestId('palette-results')).toContainText('Use light theme');
    await page.keyboard.press('Enter');
    await expect(page.locator(':root')).toHaveAttribute('data-theme', 'light');
    await expect
      .poll(() => page.evaluate(() => window.folea.prefs.load().then((prefs) => prefs.theme)))
      .toBe('light');
    await expect
      .poll(() => fs.readFile(path.join(userDataRoot, 'prefs.config'), 'utf8'))
      .toBe('theme = light\n');
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
    await fs.rm(userDataRoot, { recursive: true, force: true });
  }
});

test('links panel: b opens overlay, shows backlinks + outgoing, Enter opens note', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-links-'));

  await fs.writeFile(
    path.join(vaultRoot, 'alpha.typ'),
    '= Alpha\n\n#link("beta.typ")[Go to Beta]\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(vaultRoot, 'beta.typ'),
    '= Beta\n\n#link("alpha.typ")[Go to Alpha]\n',
    'utf8'
  );

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();

    await expectSurfaceRendered(page);
    // alpha.typ is the first note alphabetically and should be selected
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Alpha');

    // Open the links panel
    await page.keyboard.press('b');
    await expect(page.getByTestId('statusline-mode')).toHaveText('links');
    await expect(page.getByTestId('links-overlay')).toBeVisible();

    // alpha.typ is linked from beta.typ (backlink) and links to beta.typ (outgoing).
    // The overlay shows titles (basename without extension), so 'beta.typ' renders as 'beta'.
    await expect
      .poll(() => page.getByTestId('links-overlay').textContent(), { timeout: 5_000 })
      .toContain('beta');

    // The overlay shows both section headers
    await expect(page.getByTestId('links-section-backlinks')).toBeVisible();
    await expect(page.getByTestId('links-section-outgoing')).toBeVisible();

    // At least one row is present
    await expect.poll(() => page.getByTestId('links-row').count()).toBeGreaterThan(0);

    // Navigate to the first selected row and open it (selectedIndex=0, backlinks section first)
    // beta.typ appears in backlinks (since beta links to alpha)
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('statusline-mode')).toHaveText('document');
    // After Enter, beta.typ should be rendered
    await expectSurfaceRendered(page);
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Beta');
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});

test('links panel: Escape closes overlay without navigating', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-links-esc-'));

  await fs.writeFile(
    path.join(vaultRoot, 'main.typ'),
    '= Main\n\n#link("other.typ")[other]\n',
    'utf8'
  );
  await fs.writeFile(path.join(vaultRoot, 'other.typ'), '= Other\n', 'utf8');

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();

    await expectSurfaceRendered(page);

    await page.keyboard.press('b');
    await expect(page.getByTestId('statusline-mode')).toHaveText('links');
    await expect(page.getByTestId('links-overlay')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('statusline-mode')).toHaveText('document');
    await expect(page.getByTestId('links-overlay')).not.toBeVisible();

    // Original note is still displayed
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Main');
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});

const clickLinkAndExpect = async (page: Page, targetText: string): Promise<void> => {
  const pseudo = page.getByTestId('typst-rendered-document').locator('.pseudo-link').first();
  const box = await pseudo.boundingBox();
  if (!box) throw new Error('pseudo-link not visible');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx, cy);
  await expect
    .poll(() => page.getByTestId('typst-rendered-document').textContent(), { timeout: 10_000 })
    .toContain(targetText);
};

test('link click: extensionless ./ relative #link resolves and navigates to target note', async () => {
  // Reproduces the user's real-world link: #link("./linear_regression") — a leading ./
  // and NO .typ extension. The target file is linear_regression.typ. Resolution must
  // strip ./, append .typ, and confirm the note exists in the vault.
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-link-click-'));
  await fs.writeFile(
    path.join(vaultRoot, 'from.typ'),
    '= From\n\n#link("./linear_regression")[check]\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(vaultRoot, 'linear_regression.typ'),
    '= Linear Regression\n\nTarget note.\n',
    'utf8'
  );

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();
    await expectSurfaceRendered(page);
    await expect(page.getByTestId('typst-rendered-document')).toContainText('From');
    await clickLinkAndExpect(page, 'Target note.');
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});

test('link click: middle-click on #link navigates to target note (not system browser)', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-link-click-'));
  await fs.writeFile(
    path.join(vaultRoot, 'from.typ'),
    '= From\n\n#link("to.typ")[Go to To]\n',
    'utf8'
  );
  await fs.writeFile(path.join(vaultRoot, 'to.typ'), '= To\n\nTarget note.\n', 'utf8');

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();
    await expectSurfaceRendered(page);
    await expect(page.getByTestId('typst-rendered-document')).toContainText('From');

    const pseudo = page.getByTestId('typst-rendered-document').locator('.pseudo-link').first();
    const box = await pseudo.boundingBox();
    if (!box) throw new Error('pseudo-link not visible');
    // Middle click fires auxclick, which Chromium uses to open links in new tabs/windows
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'middle' });

    await expect
      .poll(() => page.getByTestId('typst-rendered-document').textContent(), { timeout: 10_000 })
      .toContain('Target note.');
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});

test('link click (dev server): clicking a rendered #link opens the target note in-app', async () => {
  // Runs against the Vite dev server, exactly like `npm run dev`. The renderer base URL
  // is http://127.0.0.1:<port>/, so an SVG <a xlink:href="to.typ"> resolves to an http URL
  // and Chromium's default link activation tries to navigate there (or open a browser).
  // This reproduces the real-world failure the file:// production-build test missed.
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-dev-link-'));
  await fs.writeFile(
    path.join(vaultRoot, 'from.typ'),
    '= From\n\n#link("to.typ")[Go to To]\n',
    'utf8'
  );
  await fs.writeFile(path.join(vaultRoot, 'to.typ'), '= To\n\nTarget note.\n', 'utf8');
  let devServer: ViteDevServer | undefined;

  try {
    const started = await startRendererDevServer();
    devServer = started.server;
    const app = await launchApp({
      ...currentEnv(),
      ELECTRON_RENDERER_URL: started.url,
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1'
    });
    const page = await app.firstWindow();

    await expect(page.getByTestId('folea-shell')).toBeVisible();
    await page.evaluate((rootPath) => window.folea.vault.open(rootPath), vaultRoot);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('folea:vault-refresh')));

    await expectSurfaceRendered(page);
    await expect(page.getByTestId('typst-rendered-document')).toContainText('From');

    const pseudo = page.getByTestId('typst-rendered-document').locator('.pseudo-link').first();
    const box = await pseudo.boundingBox();
    if (!box) throw new Error('pseudo-link not visible');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    // The page must NOT have navigated away (no http://127.0.0.1/to.typ in-app navigation)
    // and the target note must be shown.
    await expect
      .poll(() => page.getByTestId('typst-rendered-document').textContent(), { timeout: 10_000 })
      .toContain('Target note.');
  } finally {
    await devServer?.close();
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});
