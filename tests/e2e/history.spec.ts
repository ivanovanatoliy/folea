import { expect, test, type Page } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { cleanupApp, currentEnv, expectSurfaceRendered, launchApp } from './support/electron';
import { selectTreeRow } from './support/ui';

test.afterEach(cleanupApp);

const openTreeNote = async (page: Page, relPath: string): Promise<void> => {
  await page.keyboard.press('Control+b');
  await expect(page.getByTestId('statusline-mode')).toHaveText('[tree]');
  await selectTreeRow(page, relPath);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('statusline-mode')).toHaveText('[document]');
  await expect(page.getByTestId('statusline-doc')).toHaveText(path.posix.basename(relPath));
  await expectSurfaceRendered(page);
};

test('navigates backward and forward with exact reading locations', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-history-'));
  const beforeHeading = Array.from({ length: 55 }, (_, index) => `Alpha line ${index + 1}.`).join(
    '\n\n'
  );
  const afterHeading = Array.from({ length: 30 }, (_, index) => `Deep line ${index + 1}.`).join(
    '\n\n'
  );
  await fs.writeFile(
    path.join(vaultRoot, 'alpha.typ'),
    `= Alpha\n\n${beforeHeading}\n\n== Deep section\n\n${afterHeading}\n`,
    'utf8'
  );
  await fs.writeFile(path.join(vaultRoot, 'beta.typ'), '= Beta\n\nBeta body.\n', 'utf8');
  await fs.writeFile(path.join(vaultRoot, 'gamma.typ'), '= Gamma\n\nGamma body.\n', 'utf8');

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();
    const surface = page.getByTestId('typst-surface');
    await expectSurfaceRendered(page);
    await expect(page.getByTestId('statusline-doc')).toHaveText('alpha.typ');

    await page.keyboard.press('+');
    await page.keyboard.press('Space');
    await expect.poll(() => surface.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const alphaScrollTop = await surface.evaluate((element) => element.scrollTop);
    const alphaZoom = await page.getByTestId('statusline-zoom').textContent();

    await openTreeNote(page, 'beta.typ');
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('statusline-doc')).toHaveText('alpha.typ');
    await expectSurfaceRendered(page);
    await expect(page.getByTestId('statusline-zoom')).toHaveText(alphaZoom ?? '');
    await expect
      .poll(() =>
        surface.evaluate(
          (element, expectedScrollTop) => Math.abs(element.scrollTop - expectedScrollTop),
          alphaScrollTop
        )
      )
      .toBeLessThanOrEqual(2);

    await page.keyboard.press('Shift+Backspace');
    await expect(page.getByTestId('statusline-doc')).toHaveText('beta.typ');
    await expectSurfaceRendered(page);

    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('statusline-doc')).toHaveText('alpha.typ');
    await expectSurfaceRendered(page);
    await openTreeNote(page, 'gamma.typ');
    await page.keyboard.press('Shift+Backspace');
    await page.waitForTimeout(100);
    await expect(page.getByTestId('statusline-doc')).toHaveText('gamma.typ');

    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('statusline-doc')).toHaveText('alpha.typ');
    await expectSurfaceRendered(page);
    await page.keyboard.press('g');
    await page.keyboard.press('g');
    await expect
      .poll(() => surface.evaluate((element) => element.scrollTop))
      .toBeLessThanOrEqual(1);

    await page.keyboard.press('o');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[outline]');
    await page.keyboard.press('j');
    await page.keyboard.press('Enter');
    await expect.poll(() => surface.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const headingScrollTop = await surface.evaluate((element) => element.scrollTop);

    await page.keyboard.press('Backspace');
    await expect
      .poll(() => surface.evaluate((element) => element.scrollTop))
      .toBeLessThanOrEqual(1);
    await page.keyboard.press('Shift+Backspace');
    await expect
      .poll(() =>
        surface.evaluate(
          (element, expectedScrollTop) => Math.abs(element.scrollTop - expectedScrollTop),
          headingScrollTop
        )
      )
      .toBeLessThanOrEqual(2);
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});

test('supports history in visual mode without stealing Backspace from search input', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-history-contexts-'));
  await fs.writeFile(path.join(vaultRoot, 'alpha.typ'), '= Alpha\n\nNeedle alpha.\n', 'utf8');
  await fs.writeFile(path.join(vaultRoot, 'beta.typ'), '= Beta\n\nNeedle beta.\n', 'utf8');

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();
    await expectSurfaceRendered(page);
    await openTreeNote(page, 'beta.typ');

    await page.keyboard.press('s');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[caret]');
    await page.keyboard.press('v');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[visual]');
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[caret]');
    await expect(page.getByTestId('statusline-doc')).toHaveText('alpha.typ');
    await expectSurfaceRendered(page);

    await page.keyboard.press('Shift+Backspace');
    await expect(page.getByTestId('statusline-doc')).toHaveText('beta.typ');
    await expectSurfaceRendered(page);

    await page.keyboard.press('/');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[search]');
    await page.keyboard.type('Needle');
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('search-input')).toHaveValue('Needl');
    await expect(page.getByTestId('statusline-doc')).toHaveText('beta.typ');
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});
