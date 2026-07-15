import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { cleanupApp, currentEnv, expectSurfaceRendered, launchApp } from './support/electron';

test.afterEach(cleanupApp);

test('shows only user actions in the palette and does not draw focus outlines', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-palette-'));
  await fs.writeFile(path.join(vaultRoot, 'alpha.typ'), '= Alpha\n', 'utf8');

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();
    await expectSurfaceRendered(page);

    await page.keyboard.press(':');
    const paletteInput = page.getByTestId('palette-input');
    await expect(paletteInput).toBeFocused();
    await expect(paletteInput).toHaveCSS('outline-style', 'none');
    await paletteInput.fill('close');
    await expect(page.getByTestId('palette-row')).toHaveCount(1);
    await expect(page.getByTestId('palette-row')).toHaveAttribute(
      'data-command-id',
      'app.closeVault'
    );
    await page.keyboard.press('Escape');

    await page.keyboard.press('Control+b');
    await page.keyboard.press('%');
    const dialogInput = page.getByTestId('vault-dialog-input');
    await expect(dialogInput).toBeFocused();
    await expect(dialogInput).toHaveCSS('outline-style', 'none');
    const focusedBorder = await dialogInput.evaluate(
      (element) => getComputedStyle(element).borderTopColor
    );
    await dialogInput.evaluate((element) => element.blur());
    const blurredBorder = await dialogInput.evaluate(
      (element) => getComputedStyle(element).borderTopColor
    );
    expect(focusedBorder).toBe(blurredBorder);
    await page.keyboard.press('Escape');
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});
