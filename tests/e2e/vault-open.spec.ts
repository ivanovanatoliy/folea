import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupApp, currentEnv, expectSurfaceRendered, launchApp } from './support/electron';

test.afterEach(cleanupApp);

test('shows start menu when no vault is configured', async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-userdata-'));

  try {
    const app = await launchApp(currentEnv(), [`--user-data-dir=${userDataDir}`]);
    const page = await app.firstWindow();

    await expect(page.getByTestId('start-menu')).toBeVisible();
    await expect(page.locator('.start-menu-logo')).toHaveAttribute(
      'src',
      /\/assets\/logo-(?:dark|light)-.+\.svg$/
    );
    await expect(page.getByTestId('start-menu-vault-row')).toHaveCount(0);
    await expect(page.getByTestId('statusline-zoom')).toHaveCount(0);
    await expect(page.getByTestId('statusline-page')).toHaveCount(0);
    await expect(page.getByTestId('statusline-mode')).toHaveText('[start_screen]');
    expect(
      await page.getByTestId('statusline-mode').evaluate((element) => {
        const mode = element.getBoundingClientRect();
        return element.parentElement!.getBoundingClientRect().right - mode.right;
      })
    ).toBe(10);
    await expect(page.getByTestId('start-menu-open-link')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('start-menu-open-link')).toBeFocused();
  } finally {
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('opens a vault via the Open vault button and renders the note', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-vault-'));
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-userdata-'));

  try {
    await fs.writeFile(
      path.join(vaultRoot, 'index.typ'),
      '= Hello Vault\n\nWelcome to the vault.\n',
      'utf8'
    );

    // FOLEA_TEST_VAULT_PATH_FOR_DIALOG makes the file picker return the given path
    // without showing a dialog, letting us test the full openVaultInteractive flow.
    const app = await launchApp(
      {
        ...currentEnv(),
        FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
        FOLEA_TEST_VAULT_PATH_FOR_DIALOG: vaultRoot
      },
      [`--user-data-dir=${userDataDir}`]
    );
    const page = await app.firstWindow();

    await expect(page.getByTestId('start-menu')).toBeVisible();

    // Click the "Open vault" button — the dialog is intercepted by the test hook
    await page.getByTestId('start-menu-open-link').click();

    await expectSurfaceRendered(page);
    await expect(page.getByTestId('start-menu')).not.toBeVisible();
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Hello Vault');
    await expect(page.getByTestId('typst-rendered-document')).toContainText(
      'Welcome to the vault.'
    );
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('reopens vault from recent list after closing', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-vault-'));
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-userdata-'));

  try {
    await fs.writeFile(
      path.join(vaultRoot, 'notes.typ'),
      '= Reopen Test\n\nThis vault was reopened successfully.\n',
      'utf8'
    );

    // Launch with test vault path — vault opens automatically and is saved to app state
    const app = await launchApp(
      {
        ...currentEnv(),
        FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
        FOLEA_TEST_VAULT_PATH: vaultRoot
      },
      [`--user-data-dir=${userDataDir}`]
    );
    const page = await app.firstWindow();

    // Vault opens directly via FOLEA_TEST_VAULT_PATH
    await expect(page.getByTestId('statusline-doc')).toHaveText('notes.typ');
    await expectSurfaceRendered(page);
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Reopen Test');

    // Close vault via command palette
    await page.keyboard.press(':');
    await expect(page.getByTestId('palette-overlay')).toBeVisible();
    await page.keyboard.type('close vault');
    await expect(page.getByTestId('palette-row').first()).toContainText('Close vault');
    await page.keyboard.press('Enter');

    // Start menu appears with the vault in the recent list
    await expect(page.getByTestId('start-menu')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('statusline-zoom')).toHaveCount(0);
    await expect(page.getByTestId('statusline-page')).toHaveCount(0);
    await expect(page.getByTestId('statusline-mode')).toHaveText('[start_screen]');
    await expect(page.getByTestId('start-menu-vault-row')).toHaveCount(1);
    await expect(page.getByTestId('start-menu-vault-row')).toContainText(path.basename(vaultRoot));

    // Click the recent vault to reopen it
    await page.getByTestId('start-menu-vault-row').click();

    // Vault reopens
    await expectSurfaceRendered(page);
    await expect(page.getByTestId('start-menu')).not.toBeVisible();
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Reopen Test');
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
});
