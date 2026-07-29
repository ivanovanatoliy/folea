import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { cleanupApp, currentEnv, expectSurfaceRendered, launchApp } from './support/electron';

test.afterEach(cleanupApp);

test('shows fit modes and hides the manual zoom status', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-zoom-status-'));
  await fs.writeFile(path.join(vaultRoot, 'note.typ'), '= Zoom status\n\nReadable body.\n');

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();
    await expectSurfaceRendered(page);

    await expect(page.getByTestId('statusline-zoom')).toHaveText('[fit-w]');

    await page.keyboard.press('+');
    await expect(page.getByTestId('statusline-zoom')).toHaveCount(0);

    await page.keyboard.press('=');
    await expect(page.getByTestId('statusline-zoom')).toHaveText('[fit-w]');

    await page.keyboard.press('F10');
    await expect(page.getByTestId('statusline-zoom')).toHaveText('[fit-c]');

    await page.keyboard.press('-');
    await expect(page.getByTestId('statusline-zoom')).toHaveCount(0);
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});
