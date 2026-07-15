import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupApp, currentEnv, expectSurfaceRendered, launchApp } from './support/electron';

test.afterEach(cleanupApp);

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
    await expect
      .poll(() =>
        app.evaluate(({ app: electronApp }) => electronApp.isHardwareAccelerationEnabled())
      )
      .toBe(false);

    await expect(page.locator(':root')).toHaveAttribute('data-theme', 'dark');
    await expectSurfaceRendered(page);

    // keys.config loads asynchronously; wait until the palette exposes the remap.
    await page.keyboard.press(':');
    await page.keyboard.type('Toggle tree');
    await expect(page.getByTestId('palette-results')).toContainText('t');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[document]');

    await page.keyboard.press('Control+b');
    await expect(page.getByTestId('tree-overlay')).toHaveCount(0);

    await page.keyboard.press('t');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[tree]');
    await expect(page.getByTestId('tree-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[document]');

    await page.keyboard.press(':');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[palette]');
    await page.keyboard.type('Toggle tree');
    await expect(page.getByTestId('palette-results')).toContainText('Toggle tree');
    await expect(page.getByTestId('palette-results')).toContainText('t');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[document]');

    await page.keyboard.press(':');
    await page.keyboard.type('Use light theme');
    await expect(page.getByTestId('palette-results')).toContainText('Use light theme');
    await page.keyboard.press('Enter');
    await expect(page.locator(':root')).toHaveAttribute('data-theme', 'light');
    await expect
      .poll(() => page.evaluate(() => window.folea.prefs.load().then((prefs) => prefs.theme)))
      .toBe('light');
    await expect
      .poll(() => fs.readFile(path.join(vaultRoot, '.folea', 'prefs.config'), 'utf8'))
      .toBe('theme = light\n');
    await expect
      .poll(() => fs.readFile(path.join(userDataRoot, 'prefs.config'), 'utf8'))
      .toBe('theme = dark\n');
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
    await fs.rm(userDataRoot, { recursive: true, force: true });
  }
});
