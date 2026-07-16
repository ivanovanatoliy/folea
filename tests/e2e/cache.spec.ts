import { expect, test, type Page } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { cleanupApp, currentEnv, expectSurfaceRendered, launchApp } from './support/electron';

test.afterEach(cleanupApp);

const runPaletteCommand = async (page: Page, query: string, commandId: string): Promise<void> => {
  await page.keyboard.press(':');
  const input = page.getByTestId('palette-input');
  await expect(input).toBeFocused();
  await input.fill(query);
  const row = page.getByTestId('palette-row');
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute('data-command-id', commandId);
  await page.keyboard.press('Enter');
};

test('clears current-vault and application caches through the command palette', async () => {
  test.setTimeout(60_000);
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-cache-vault-'));
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-cache-userdata-'));
  const renderCacheDir = path.join(vaultRoot, '.folea', 'render-cache');
  const prefsPath = path.join(userDataDir, 'prefs.config');
  await fs.writeFile(path.join(vaultRoot, 'alpha.typ'), '= Alpha\n\nCached content.\n', 'utf8');
  await fs.writeFile(prefsPath, 'theme = dark\n', 'utf8');

  try {
    const app = await launchApp(
      {
        ...currentEnv(),
        FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
        FOLEA_TEST_VAULT_PATH: vaultRoot
      },
      [`--user-data-dir=${userDataDir}`]
    );
    const page = await app.firstWindow();
    await expectSurfaceRendered(page);
    await expect
      .poll(() => fs.readdir(path.join(renderCacheDir, 'entries')).catch(() => []), {
        timeout: 20_000
      })
      .not.toHaveLength(0);

    await runPaletteCommand(page, 'current vault cache', 'cache.clearCurrentVault');
    const notification = page.getByTestId('notification');
    await expect(notification).toContainText('Current vault cache cleared');
    await expect(notification.getByRole('button')).toHaveCount(0);
    await expect
      .poll(() =>
        fs.stat(renderCacheDir).then(
          () => true,
          () => false
        )
      )
      .toBe(false);
    await expect(
      fs.readFile(path.join(vaultRoot, '.folea', 'state.json'), 'utf8')
    ).resolves.toContain('alpha.typ');
    await expect(notification).not.toBeVisible({ timeout: 4_000 });
    const cacheSizeBefore = await app.evaluate(({ session }) =>
      session.defaultSession.getCacheSize()
    );
    expect(cacheSizeBefore).toBeGreaterThan(0);

    await runPaletteCommand(page, 'application cache', 'cache.clearApplication');
    await expect(notification).toContainText('Application cache cleared');
    await expect
      .poll(() => app.evaluate(({ session }) => session.defaultSession.getCacheSize()))
      .toBe(0);
    await expect(fs.readFile(prefsPath, 'utf8')).resolves.toBe('theme = dark\n');
    await expect(notification).not.toBeVisible({ timeout: 4_000 });
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('reports that current-vault cache needs an open vault', async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-cache-empty-'));

  try {
    const app = await launchApp(currentEnv(), [`--user-data-dir=${userDataDir}`]);
    const page = await app.firstWindow();
    await expect(page.getByTestId('start-menu')).toBeVisible();

    await runPaletteCommand(page, 'current vault cache', 'cache.clearCurrentVault');
    const notification = page.getByTestId('notification');
    await expect(notification).toContainText('No vault is open');
    await expect(notification.getByRole('button')).toHaveCount(0);
    await expect(notification).not.toBeVisible({ timeout: 4_000 });
    await expect(page.getByTestId('start-menu')).toBeVisible();
  } finally {
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
});
