import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupApp, currentEnv, expectSurfaceRendered, launchApp } from './support/electron';
import { clickLinkAndExpect } from './support/ui';
import { startRendererDevServer } from './support/renderer-server';

test.afterEach(cleanupApp);

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
    await expect(page.getByTestId('statusline-mode')).toHaveText('[links]');
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
    await expect(page.getByTestId('statusline-mode')).toHaveText('[document]');
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
    await expect(page.getByTestId('statusline-mode')).toHaveText('[links]');
    await expect(page.getByTestId('links-overlay')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[document]');
    await expect(page.getByTestId('links-overlay')).not.toBeVisible();

    // Original note is still displayed
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Main');
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});

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
  let devServer: Awaited<ReturnType<typeof startRendererDevServer>>['server'] | undefined;

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
