import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupApp, currentEnv, expectSurfaceRendered, launchApp } from './support/electron';

test.afterEach(cleanupApp);

test('creates notes and directories through the real tree UI and dismisses its context menu', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-management-'));
  await fs.mkdir(path.join(vaultRoot, '_templates'));
  await fs.writeFile(path.join(vaultRoot, 'alpha.typ'), '= Alpha\n', 'utf8');
  await fs.writeFile(
    path.join(vaultRoot, '_templates', 'starter.typ'),
    '#import "template-helper.typ": helper\n= Created from template\n#helper()\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(vaultRoot, '_templates', 'template-helper.typ'),
    '#let helper() = [Template helper]\n',
    'utf8'
  );

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot,
      FOLEA_TEST_TRASH_DELETE: '1'
    });
    const page = await app.firstWindow();
    const nativeDialogs: string[] = [];
    page.on('dialog', (dialog) => {
      nativeDialogs.push(dialog.type());
      void dialog.dismiss();
    });
    await expectSurfaceRendered(page);

    await page.keyboard.press('Control+b');
    await expect(page.getByTestId('tree-overlay')).toBeVisible();

    await page.keyboard.type('%');
    await expect(page.getByTestId('vault-operation-dialog')).toHaveAttribute(
      'aria-label',
      'Create note'
    );
    await page.getByTestId('vault-dialog-input').fill('keyboard-note');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('vault-operation-dialog')).toHaveAttribute(
      'aria-label',
      'Choose template'
    );
    await page.keyboard.press('Enter');
    await expect
      .poll(() =>
        fs.readFile(path.join(vaultRoot, 'keyboard-note.typ'), 'utf8').catch(() => undefined)
      )
      .toBe('');
    await expect(page.getByTestId('statusline-doc')).toHaveText('keyboard-note.typ');
    await expect(page.getByTestId('tree-overlay')).toContainText('keyboard-note.typ');

    await page.keyboard.press('d');
    await expect(page.getByTestId('vault-operation-dialog')).toHaveAttribute(
      'aria-label',
      'Create directory'
    );
    await page.getByTestId('vault-dialog-input').fill('keyboard-folder');
    await page.keyboard.press('Enter');
    await expect
      .poll(() =>
        fs
          .stat(path.join(vaultRoot, 'keyboard-folder'))
          .then((entry) => entry.isDirectory())
          .catch(() => false)
      )
      .toBe(true);
    await expect(page.getByTestId('tree-overlay')).toContainText('keyboard-folder');

    const keyboardFolderRow = page.locator(
      '[data-testid="tree-row"][data-relpath="keyboard-folder"]'
    );
    await keyboardFolderRow.click({ button: 'right' });
    await expect(page.getByTestId('tree-context-menu')).toBeVisible();
    await page.getByRole('button', { name: 'create note', exact: true }).click();
    await page.getByTestId('vault-dialog-input').fill('context-note');
    await page.getByTestId('vault-dialog-submit').click();
    await page.getByTestId('vault-template-choice').filter({ hasText: 'starter' }).click();
    await page.getByTestId('vault-dialog-submit').click();
    await expect
      .poll(() =>
        fs
          .readFile(path.join(vaultRoot, 'keyboard-folder', 'context-note.typ'), 'utf8')
          .catch(() => undefined)
      )
      .toBe(
        '#import "../_templates/template-helper.typ": helper\n= Created from template\n#helper()\n'
      );
    await expect(page.getByTestId('statusline-doc')).toHaveText('context-note.typ');
    await expectSurfaceRendered(page);
    await expect(page.getByTestId('typst-rendered-document')).toContainText(
      'Created from template'
    );
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Template helper');

    await keyboardFolderRow.click({ button: 'right' });
    await page.getByRole('button', { name: 'create note', exact: true }).click();
    await page.getByTestId('vault-dialog-input').fill('context-note');
    await page.getByTestId('vault-dialog-submit').click();
    await page.getByTestId('vault-dialog-submit').click();
    await expect(page.getByTestId('operation-notice')).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss notification' }).click();

    await page.getByTestId('tree-root-drop').click({ button: 'right' });
    await page.getByRole('button', { name: 'create directory', exact: true }).click();
    await page.getByTestId('vault-dialog-input').fill('context-folder');
    await page.getByTestId('vault-dialog-submit').click();
    await expect
      .poll(() =>
        fs
          .stat(path.join(vaultRoot, 'context-folder'))
          .then((entry) => entry.isDirectory())
          .catch(() => false)
      )
      .toBe(true);
    await expect(page.getByTestId('tree-overlay')).toContainText('context-folder');

    const alphaRow = page.locator('[data-testid="tree-row"][data-relpath="alpha.typ"]');
    await alphaRow.click({ button: 'right' });
    await expect(page.getByTestId('tree-context-menu')).toBeVisible();
    await page.getByTestId('tree-root-drop').click();
    await expect(page.getByTestId('tree-context-menu')).toHaveCount(0);
    await expect(page.getByTestId('tree-overlay')).toBeVisible();

    await alphaRow.click({ button: 'right' });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tree-context-menu')).toHaveCount(0);
    await expect(page.getByTestId('tree-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tree-overlay')).toHaveCount(0);

    await page.keyboard.press('Control+b');
    const contextNoteRow = page.locator(
      '[data-testid="tree-row"][data-relpath="keyboard-folder/context-note.typ"]'
    );
    await contextNoteRow.click({ button: 'right' });
    await page.getByRole('button', { name: 'delete', exact: true }).click();
    await expect(page.getByTestId('vault-operation-dialog')).toHaveAttribute(
      'aria-label',
      'Move to trash'
    );
    await page.getByTestId('vault-dialog-cancel').click();
    await expect(
      fs.stat(path.join(vaultRoot, 'keyboard-folder', 'context-note.typ'))
    ).resolves.toBeDefined();

    await contextNoteRow.click({ button: 'right' });
    await page.getByRole('button', { name: 'delete', exact: true }).click();
    await page.getByTestId('vault-dialog-submit').click();
    await expect
      .poll(() =>
        fs
          .stat(path.join(vaultRoot, 'keyboard-folder', 'context-note.typ'))
          .then(() => true)
          .catch(() => false)
      )
      .toBe(false);

    await page.getByTestId('tree-root-drop').click({ button: 'right' });
    await expect(page.getByTestId('tree-context-menu')).toBeVisible();
    const surfaceBox = await page.getByTestId('typst-surface').boundingBox();
    if (!surfaceBox) throw new Error('The document surface has no bounding box');
    await page.mouse.click(surfaceBox.x + surfaceBox.width - 20, surfaceBox.y + 80);
    await expect(page.getByTestId('tree-context-menu')).toHaveCount(0);
    await expect(page.getByTestId('tree-overlay')).toHaveCount(0);
    expect(nativeDialogs).toEqual([]);
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});
