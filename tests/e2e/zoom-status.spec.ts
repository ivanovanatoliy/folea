import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { cleanupApp, currentEnv, expectSurfaceRendered, launchApp } from './support/electron';

test.afterEach(cleanupApp);

test('keeps the same document point visible while changing zoom', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-zoom-anchor-'));
  const body = Array.from({ length: 120 }, (_, index) => `Zoom anchor line ${index + 1}.`).join(
    '\n\n'
  );
  await fs.writeFile(path.join(vaultRoot, 'note.typ'), `= Zoom anchor\n\n${body}\n`);

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();
    const surface = page.getByTestId('typst-surface');
    const documentNode = page.getByTestId('typst-rendered-document');
    await expectSurfaceRendered(page);
    await page.keyboard.press('Control+d');
    await page.keyboard.press('Control+d');

    const relativeTopBefore = await page.evaluate(() => {
      const surface = document.querySelector<HTMLElement>('[data-testid="typst-surface"]')!;
      const documentNode = document.querySelector<HTMLElement>(
        '[data-testid="typst-rendered-document"]'
      )!;
      const svg = documentNode.querySelector('svg')!;
      return (
        (surface.getBoundingClientRect().top - svg.getBoundingClientRect().top) /
        svg.getBoundingClientRect().height
      );
    });

    await page.keyboard.press('+');
    await expect(documentNode).toHaveCSS('max-width', 'none');
    const relativeTopAfter = await page.evaluate(() => {
      const surface = document.querySelector<HTMLElement>('[data-testid="typst-surface"]')!;
      const documentNode = document.querySelector<HTMLElement>(
        '[data-testid="typst-rendered-document"]'
      )!;
      const svg = documentNode.querySelector('svg')!;
      return (
        (surface.getBoundingClientRect().top - svg.getBoundingClientRect().top) /
        svg.getBoundingClientRect().height
      );
    });

    expect(Math.abs(relativeTopAfter - relativeTopBefore)).toBeLessThan(0.002);
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});

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

test('keeps the Typst physical page count while zooming', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-page-count-'));
  await fs.writeFile(
    path.join(vaultRoot, 'note.typ'),
    '= First page\n\n#pagebreak()\n\n= Second page\n\n#pagebreak()\n\n= Third page\n'
  );

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();
    await expectSurfaceRendered(page);

    await expect(page.getByTestId('statusline-page')).toHaveText('[1/3]');
    await page.keyboard.press('+');
    await expect(page.getByTestId('statusline-page')).toHaveText('[1/3]');
    await page.keyboard.press('-');
    await expect(page.getByTestId('statusline-page')).toHaveText('[1/3]');
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});
