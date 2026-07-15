import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupApp, currentEnv, expectSurfaceRendered, launchApp } from './support/electron';
import {
  expectNoCspViolations,
  installCspViolationRecorder,
  selectTreeRow,
  waitForSurfacePrefetched
} from './support/ui';
import { startRendererDevServer } from './support/renderer-server';

test.afterEach(cleanupApp);

test('opens a configured vault, lists notes, and renders the selected note', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-vault-'));
  const detailBody = Array.from({ length: 48 }, (_, i) => `Detail line ${i + 1}.`).join('\n\n');
  await fs.mkdir(path.join(vaultRoot, 'nested'));
  await fs.writeFile(
    path.join(vaultRoot, 'alpha.typ'),
    `#import "shared.typ": shared\n= Alpha\n\nHello from folea.\n== Details\n\n${detailBody}\n\n#shared\n`,
    'utf8'
  );
  await fs.writeFile(path.join(vaultRoot, 'shared.typ'), '#let shared = [Imported shared text]\n');
  await fs.writeFile(path.join(vaultRoot, 'nested', 'beta.typ'), '= Beta\n', 'utf8');
  await fs.mkdir(path.join(vaultRoot, 'many', 'one'), { recursive: true });
  await fs.mkdir(path.join(vaultRoot, 'many', 'two'), { recursive: true });
  await fs.writeFile(path.join(vaultRoot, 'many', 'one', 'a.typ'), '= A\n', 'utf8');
  await fs.writeFile(path.join(vaultRoot, 'many', 'one', 'b.typ'), '= B\n', 'utf8');
  await fs.writeFile(path.join(vaultRoot, 'many', 'two', 'c.typ'), '= C\n', 'utf8');
  await fs.writeFile(path.join(vaultRoot, 'many', 'two', 'd.typ'), '= D\n', 'utf8');

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();
    await installCspViolationRecorder(page);

    await expect(page.getByTestId('statusline-doc')).toHaveText('alpha.typ');
    await expectSurfaceRendered(page);
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Alpha');
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Hello from folea.');
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Imported shared text');
    await expect(page.getByTestId('typst-rendered-document')).not.toContainText('= Alpha');

    await expect
      .poll(() => page.evaluate(() => window.folea.vault.read({ relPath: 'nested/beta.typ' })))
      .toBe('= Beta\n');

    await page.keyboard.press('Control+b');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[tree]');
    await expect(page.getByTestId('tree-selected-row')).toHaveCount(1);
    await expect.poll(() => page.getByTestId('tree-row').count()).toBeGreaterThan(7);
    await expect(page.getByTestId('tree-overlay')).toContainText('alpha.typ');
    await expect(page.getByTestId('tree-overlay')).toContainText('nested');
    await selectTreeRow(page, 'nested/beta.typ');
    const betaPrefetched = waitForSurfacePrefetched(page, 'nested/beta.typ');
    await page.keyboard.press('k');
    await page.keyboard.press('j');
    await betaPrefetched;
    const betaCachedRender = page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          window.addEventListener('folea:surface-rendered', (event: Event) => {
            const customEvent = event as CustomEvent<{ noteId: string; fromCache: boolean }>;
            if (customEvent.detail.noteId === 'nested/beta.typ') {
              resolve(customEvent.detail.fromCache);
            }
          });
        })
    );
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[document]');
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Beta');
    await expect(betaCachedRender).resolves.toBe(true);

    const cachedRender = page.evaluate(
      () =>
        new Promise<{ fromCache: boolean; durationMs: number }>((resolve) => {
          window.addEventListener('folea:surface-rendered', (event: Event) => {
            const customEvent = event as CustomEvent<{
              noteId: string;
              fromCache: boolean;
              durationMs: number;
            }>;
            if (customEvent.detail.noteId === 'alpha.typ') {
              resolve({
                fromCache: customEvent.detail.fromCache,
                durationMs: customEvent.detail.durationMs
              });
            }
          });
        })
    );
    await page.keyboard.press('Control+b');
    await selectTreeRow(page, 'alpha.typ');
    const alphaPrefetched = waitForSurfacePrefetched(page, 'alpha.typ');
    await page.keyboard.press('k');
    await page.keyboard.press('j');
    await alphaPrefetched;
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Alpha');
    await expect(cachedRender).resolves.toMatchObject({ fromCache: true });

    await page.keyboard.press(':');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[palette]');
    const paletteBox = await page.getByTestId('palette-overlay').boundingBox();
    const viewport = page.viewportSize();
    expect(paletteBox && viewport ? Math.round(paletteBox.x + paletteBox.width / 2) : 0).toBe(
      viewport ? Math.round(viewport.width / 2) : 0
    );
    await expect
      .poll(() =>
        page
          .getByTestId('palette-results')
          .evaluate((el) => window.getComputedStyle(el).scrollbarWidth)
      )
      .toBe('none');
    for (let i = 0; i < 18; i += 1) {
      await page.keyboard.press('ArrowDown');
    }
    await expect
      .poll(() => page.getByTestId('palette-results').evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await page.keyboard.type('document.outline');
    await expect(page.getByTestId('palette-input')).toHaveValue('document.outline');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[outline]');
    await expect(page.getByTestId('outline-overlay')).toContainText('Alpha');
    await expect(page.getByTestId('outline-overlay')).toContainText('Details');
    const outlineScrollBefore = await page
      .getByTestId('typst-surface')
      .evaluate((el) => el.scrollTop);
    await page.keyboard.press('j');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (prev) => (document.querySelector('[data-testid="typst-surface"]')?.scrollTop ?? 0) > prev,
      outlineScrollBefore
    );

    await page.keyboard.press('/');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[search]');
    await expect(page.getByTestId('search-overlay')).toContainText('file search');
    const localSearchScrollBefore = await page
      .getByTestId('typst-surface')
      .evaluate((el) => el.scrollTop);
    await page.keyboard.type('Detail line 30');
    await expect(page.getByTestId('search-input')).toHaveValue('Detail line 30');
    await expect.poll(() => page.getByTestId('search-row').count()).toBeGreaterThan(0);
    await expect(page.getByTestId('search-overlay')).toContainText('alpha.typ');
    await expect(page.getByTestId('search-overlay')).not.toContainText('nested/beta.typ');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[document]');
    await expect(page.getByTestId('surface-search-highlight')).toHaveCount(1);
    await page.waitForFunction(
      (prev) => (document.querySelector('[data-testid="typst-surface"]')?.scrollTop ?? 0) > prev,
      localSearchScrollBefore
    );

    await page.keyboard.press('Control+p');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[quick-open]');
    await expect(page.getByTestId('quick-open-overlay')).toContainText('recent notes');
    await page.keyboard.type('Beta');
    await expect(page.getByTestId('quick-open-input')).toHaveValue('Beta');
    await expect(page.getByTestId('quick-open-overlay')).toContainText('vault search');
    await expect.poll(() => page.getByTestId('quick-open-row').count()).toBeGreaterThan(0);
    await expect(page.getByTestId('quick-open-overlay')).toContainText('nested/beta.typ');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[document]');
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Beta');

    await page.keyboard.press('Control+n');
    await expect(page.getByTestId('vault-operation-dialog')).toHaveAttribute(
      'aria-label',
      'Create note'
    );
    await page.getByTestId('vault-dialog-input').fill('created');
    await page.getByTestId('vault-dialog-submit').click();
    await expect(page.getByTestId('vault-operation-dialog')).toHaveAttribute(
      'aria-label',
      'Choose template'
    );
    await expect(page.getByTestId('vault-template-choice').first()).toHaveAttribute(
      'data-selected',
      'true'
    );
    await page.getByTestId('vault-dialog-submit').click();
    await expect
      .poll(() =>
        fs.readFile(path.join(vaultRoot, 'nested', 'created.typ'), 'utf8').catch(() => undefined)
      )
      .toBe('');
    await expect(page.getByTestId('statusline-doc')).toHaveText('created.typ');
    await page.keyboard.press('Control+b');
    await expect(page.getByTestId('tree-overlay')).toContainText('created.typ');
    await expectNoCspViolations(page);
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});

test('warms every note once and applies dependency-aware source deltas', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-delta-vault-'));
  await fs.writeFile(
    path.join(vaultRoot, 'main.typ'),
    '#import "shared.typ": value\n= Main\n#value\n',
    'utf8'
  );
  await fs.writeFile(path.join(vaultRoot, 'shared.typ'), '#let value = [Initial shared]\n', 'utf8');
  await fs.writeFile(path.join(vaultRoot, 'unrelated.typ'), '= Unrelated\n', 'utf8');
  const manifestPath = path.join(vaultRoot, '.folea', 'render-cache', 'manifest.json');
  interface CacheIdentity {
    readonly cacheKey: string;
    readonly inputHash: string;
  }
  const cacheIdentitiesByPath = async (): Promise<Record<string, CacheIdentity>> => {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
      entries: Record<string, { relPath: string; cacheKey: string; inputHash: string }>;
    };
    return Object.fromEntries(
      Object.values(manifest.entries).map((entry) => [
        entry.relPath,
        { cacheKey: entry.cacheKey, inputHash: entry.inputHash }
      ])
    );
  };

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();
    await expectSurfaceRendered(page);
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Initial shared');

    await expect
      .poll(() => cacheIdentitiesByPath().catch(() => ({})), { timeout: 20_000 })
      .toEqual(
        expect.objectContaining({
          'main.typ': expect.any(Object),
          'shared.typ': expect.any(Object),
          'unrelated.typ': expect.any(Object)
        })
      );
    const before = await cacheIdentitiesByPath();

    const sourceDelta = page.evaluate(
      () =>
        new Promise<{
          kind: string;
          changedCount: number;
          deletedCount: number;
          totalFileCount: number;
          affectedNoteIds: string[];
        }>((resolve) => {
          window.addEventListener(
            'folea:source-synced',
            (event) => resolve((event as CustomEvent).detail),
            { once: true }
          );
        })
    );
    const graphUpdate = page.evaluate(
      () =>
        new Promise<{ mode: string }>((resolve) => {
          window.addEventListener(
            'folea:graph-built',
            (event) => resolve((event as CustomEvent).detail),
            { once: true }
          );
        })
    );

    await fs.writeFile(
      path.join(vaultRoot, 'shared.typ'),
      '#let value = [Updated shared]\n',
      'utf8'
    );

    await expect(sourceDelta).resolves.toEqual({
      kind: 'delta',
      changedCount: 1,
      deletedCount: 0,
      totalFileCount: 3,
      affectedNoteIds: ['main.typ', 'shared.typ'],
      version: expect.any(Number)
    });
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Updated shared');
    await expect(graphUpdate).resolves.toMatchObject({ mode: 'incremental' });
    await expect
      .poll(
        async () => {
          const after = await cacheIdentitiesByPath();
          return (
            after['main.typ']?.cacheKey === before['main.typ']?.cacheKey &&
            after['main.typ']?.inputHash !== before['main.typ']?.inputHash &&
            after['shared.typ']?.cacheKey !== before['shared.typ']?.cacheKey &&
            after['shared.typ']?.inputHash !== before['shared.typ']?.inputHash &&
            after['unrelated.typ']?.cacheKey === before['unrelated.typ']?.cacheKey &&
            after['unrelated.typ']?.inputHash === before['unrelated.typ']?.inputHash
          );
        },
        { timeout: 20_000 }
      )
      .toBe(true);
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});

test('modal input: status line shows active context and scroll keys move the surface', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-input-'));
  const longContent = Array.from({ length: 80 }, (_, i) => `Line ${i + 1} of the note.`).join(
    '\n\n'
  );
  await fs.writeFile(path.join(vaultRoot, 'long.typ'), `= Long Note\n\n${longContent}\n`, 'utf8');

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();

    await expect(page.getByTestId('statusline-mode')).toHaveText('[document]');

    await expectSurfaceRendered(page);
    await expect(page.getByTestId('statusline-page')).toHaveText(/\[1\/\d+\]/);
    await expect
      .poll(() =>
        page
          .getByTestId('typst-surface')
          .evaluate((el) => window.getComputedStyle(el).scrollbarWidth)
      )
      .toBe('none');

    await page.keyboard.press('Control+b');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[tree]');
    const treeScrollTopBefore = await page
      .getByTestId('typst-surface')
      .evaluate((el) => el.scrollTop);
    await page.keyboard.press('j');
    await page.waitForTimeout(50);
    expect(await page.getByTestId('typst-surface').evaluate((el) => el.scrollTop)).toBe(
      treeScrollTopBefore
    );
    await page.keyboard.press('Control+b');
    await expect(page.getByTestId('statusline-mode')).toHaveText('[document]');

    const scrollTopBefore = await page.getByTestId('typst-surface').evaluate((el) => el.scrollTop);
    await page.keyboard.press('j');
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="typst-surface"]')?.scrollTop ?? 0) > 0
    );
    const scrollTopAfterJ = await page.getByTestId('typst-surface').evaluate((el) => el.scrollTop);
    expect(scrollTopAfterJ).toBeGreaterThan(scrollTopBefore);

    await page.keyboard.press('Control+d');
    await page.waitForFunction(
      (prev) => (document.querySelector('[data-testid="typst-surface"]')?.scrollTop ?? 0) > prev,
      scrollTopAfterJ
    );

    await page.keyboard.press('G');
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="typst-surface"]');
      if (!el) return false;
      return el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    });
    await expect
      .poll(async () => {
        const text = (await page.getByTestId('statusline-page').textContent()) ?? '';
        const match = /^\[(\d+)\/(\d+)\]$/.exec(text);
        return match ? match[1] === match[2] : false;
      })
      .toBe(true);

    await page.keyboard.press('g');
    await page.keyboard.press('g');
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="typst-surface"]')?.scrollTop ?? 1) === 0
    );
    expect(await page.getByTestId('typst-surface').evaluate((el) => el.scrollTop)).toBe(0);
    await expect(page.getByTestId('statusline-page')).toHaveText(/\[1\/\d+\]/);
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});

test('renders a dev-served note without CSP violations', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-dev-vault-'));
  await fs.writeFile(path.join(vaultRoot, 'alpha.typ'), '= Alpha\n\nDev render path.\n', 'utf8');
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
    await installCspViolationRecorder(page);

    await page.evaluate((rootPath) => window.folea.vault.open(rootPath), vaultRoot);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('folea:vault-refresh')));

    await expectSurfaceRendered(page);
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Alpha');
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Dev render path.');
    await expectNoCspViolations(page);
  } finally {
    await devServer?.close();
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});

test('keeps the latest note selected during rapid tree navigation', async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-navigation-vault-'));
  await fs.writeFile(path.join(vaultRoot, 'base.typ'), '= Base\n', 'utf8');
  await fs.writeFile(path.join(vaultRoot, 'first.typ'), '= First choice\n', 'utf8');
  await fs.writeFile(path.join(vaultRoot, 'second.typ'), '= Latest choice\n', 'utf8');

  try {
    const app = await launchApp({
      ...currentEnv(),
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    });
    const page = await app.firstWindow();
    await expectSurfaceRendered(page);

    await page.keyboard.press('Control+b');
    await expect(page.getByTestId('tree-overlay')).toBeVisible();
    await page.getByTestId('tree-row').filter({ hasText: 'first.typ' }).click();
    await page.getByTestId('tree-row').filter({ hasText: 'second.typ' }).click();

    await expect(page.getByTestId('statusline-doc')).toHaveText('second.typ');
    await expect(page.getByTestId('typst-rendered-document')).toContainText('Latest choice');
    await expect(page.getByTestId('typst-rendered-document')).not.toContainText('First choice');
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  }
});
