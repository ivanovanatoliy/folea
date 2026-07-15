import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupApp, currentEnv, expectSurfaceRendered, launchApp } from './support/electron';

interface SecurityPreferences {
  readonly nodeIntegration: boolean | undefined;
  readonly contextIsolation: boolean | undefined;
  readonly sandbox: boolean | undefined;
  readonly webSecurity: boolean | undefined;
}
interface WebContentsWithPreferences {
  getLastWebPreferences(): SecurityPreferences;
}

test.afterEach(cleanupApp);

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

test('serves the production Typst worker with its restricted worker CSP', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-worker-csp-'));
  await fs.writeFile(path.join(vaultRoot, 'index.typ'), '= Production worker CSP\n', 'utf8');

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();
    const workerResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).searchParams.get('folea-typst-worker') === '1',
      { timeout: 10_000 }
    );

    await expectSurfaceRendered(page);
    await expect(page.getByTestId('typst-rendered-document')).toContainText(
      'Production worker CSP'
    );

    const workerResponse = await workerResponsePromise;
    const workerCsp = (await workerResponse.allHeaders())['content-security-policy'];
    expect(workerResponse.url()).toMatch(
      /^folea-worker:\/\/assets\/index-[A-Za-z0-9_-]+\.js\?folea-typst-worker=1$/
    );
    expect(workerCsp).toContain("script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'");
    expect(workerCsp).toContain("worker-src 'none'");
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});
