import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupApp, currentEnv, expectSurfaceRendered, launchApp } from './support/electron';

test.afterEach(cleanupApp);

test('editor commands appear in the command palette', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();

  await expect(page.getByTestId('folea-shell')).toBeVisible();

  await page.keyboard.press(':');
  await expect(page.getByTestId('statusline-mode')).toHaveText('[palette]');

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

test('opens a shell-metacharacter note path as one editor argument', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-editor-vault-'));
  const helperRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-editor-helper-'));
  const helperPath = path.join(helperRoot, 'capture-argv.cjs');
  const resultPath = path.join(helperRoot, 'result.txt');
  const injectionMarker = path.join(process.cwd(), 'folea-editor-injection-marker.typ');
  const noteName = 'note&touch folea-editor-injection-marker.typ';
  await fs.writeFile(path.join(vaultRoot, noteName), '= Safe editor launch\n', 'utf8');
  await fs.writeFile(
    helperPath,
    `require('node:fs').writeFileSync(process.argv[2], process.argv[3], 'utf8');\n`,
    'utf8'
  );

  try {
    const editorCommand = [process.execPath, helperPath, resultPath, '%FILE%']
      .map((argument) => JSON.stringify(argument))
      .join(' ');
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot,
      FOLEA_EDITOR_CMD: editorCommand
    });
    const page = await app.firstWindow();
    await expectSurfaceRendered(page);

    await page.keyboard.press(':');
    await page.keyboard.type('Open in editor');
    await expect(page.getByTestId('palette-row').first()).toContainText('Open in editor');
    await page.keyboard.press('Enter');

    await expect
      .poll(() => fs.readFile(resultPath, 'utf8').catch(() => null))
      .toBe(path.join(vaultRoot, noteName));
    await expect
      .poll(() =>
        fs
          .stat(injectionMarker)
          .then(() => true)
          .catch(() => false)
      )
      .toBe(false);
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
    await fs.rm(helperRoot, { recursive: true, force: true });
    await fs.rm(injectionMarker, { force: true });
  }
});
