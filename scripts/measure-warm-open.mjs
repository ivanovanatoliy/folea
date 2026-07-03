import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const runs = Number.parseInt(process.env.FOLEA_WARM_OPEN_RUNS ?? '7', 10);
const configuredVaultRoot = process.env.FOLEA_WARM_OPEN_VAULT_PATH;
const ownsVaultRoot = configuredVaultRoot === undefined;
const vaultRoot =
  configuredVaultRoot ?? (await mkdtemp(path.join(os.tmpdir(), 'folea-warm-open-')));
let primaryNote = process.env.FOLEA_WARM_OPEN_PRIMARY_NOTE;
let secondaryNote = process.env.FOLEA_WARM_OPEN_SECONDARY_NOTE;

const env = Object.fromEntries(
  Object.entries(process.env).filter((entry) => entry[1] !== undefined)
);

const waitForSurfaceRender = (page, noteId, fromCache) =>
  page.evaluate(
    ({ expectedNoteId, expectedFromCache }) =>
      new Promise((resolve) => {
        const handler = (event) => {
          const detail = event.detail;
          if (
            detail.noteId === expectedNoteId &&
            (expectedFromCache === null || detail.fromCache === expectedFromCache)
          ) {
            window.removeEventListener('folea:surface-rendered', handler);
            resolve(detail.durationMs);
          }
        };

        window.addEventListener('folea:surface-rendered', handler);
      }),
    { expectedNoteId: noteId, expectedFromCache: fromCache }
  );

const waitForSurfacePrefetched = (page, noteId) =>
  page.evaluate(
    (expectedNoteId) =>
      new Promise((resolve) => {
        const handler = (event) => {
          const detail = event.detail;
          if (detail.noteId === expectedNoteId) {
            window.removeEventListener('folea:surface-prefetched', handler);
            resolve(detail.fromCache);
          }
        };

        window.addEventListener('folea:surface-prefetched', handler);
      }),
    noteId
  );

const waitOrTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('timeout'), ms))]);

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const openTree = async (page) => {
  const mode = await page.getByTestId('statusline-mode').textContent();
  if (mode !== 'tree') {
    await page.keyboard.press('Control+b');
    await page.getByTestId('tree-overlay').waitFor({ state: 'visible' });
  }
};

const selectedTreeRelPath = (page) =>
  page.evaluate(
    () =>
      document
        .querySelector('[data-testid="tree-row"][data-selected="true"]')
        ?.getAttribute('data-relpath') ?? null
  );

const selectTreeNote = async (page, relPath) => {
  await openTree(page);
  const prefetched = waitForSurfacePrefetched(page, relPath);
  await page.keyboard.press('g');
  await page.keyboard.press('g');

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if ((await selectedTreeRelPath(page)) === relPath) {
      await waitOrTimeout(prefetched, 5_000);
      await page.keyboard.press('Enter');
      return;
    }

    await page.keyboard.press('j');
  }

  throw new Error(`Unable to reach note in tree: ${relPath}`);
};

let electronApp;

try {
  if (ownsVaultRoot) {
    await mkdir(path.join(vaultRoot, 'nested'));
    await writeFile(
      path.join(vaultRoot, 'alpha.typ'),
      '= Alpha\n\nWarm cached render measurement.\n',
      'utf8'
    );
    await writeFile(
      path.join(vaultRoot, 'nested', 'beta.typ'),
      '= Beta\n\nCache separator.\n',
      'utf8'
    );
    primaryNote = primaryNote ?? 'alpha.typ';
    secondaryNote = secondaryNote ?? 'nested/beta.typ';
  }

  electronApp = await electron.launch({
    args: [process.cwd()],
    env: {
      ...env,
      FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
      FOLEA_TEST_VAULT_PATH: vaultRoot
    }
  });

  const page = await electronApp.firstWindow();
  await page.getByTestId('typst-surface').waitFor({ state: 'visible' });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="typst-surface"]')?.getAttribute('data-state') ===
      'rendered'
  );

  let coldCompileMs = Number(
    (await page.getByTestId('typst-surface').getAttribute('data-duration-ms')) ?? '0'
  );

  if (!primaryNote || !secondaryNote) {
    const relPaths = await page.evaluate(() =>
      window.folea.vault.list().then((notes) => notes.map((note) => note.relPath).sort())
    );
    primaryNote = primaryNote ?? relPaths[0];
    secondaryNote = secondaryNote ?? relPaths.find((relPath) => relPath !== primaryNote);
  }

  if (!primaryNote || !secondaryNote) {
    throw new Error('Warm-open measurement requires at least two .typ notes');
  }

  if (!ownsVaultRoot) {
    const primaryRender = waitForSurfaceRender(page, primaryNote, null);
    await selectTreeNote(page, primaryNote);
    coldCompileMs = await primaryRender;
  }

  const firstBetaRender = waitForSurfaceRender(page, secondaryNote, null);
  await selectTreeNote(page, secondaryNote);
  await firstBetaRender;

  const warmOpenMs = [];
  for (let index = 0; index < runs; index += 1) {
    const alphaRender = waitForSurfaceRender(page, primaryNote, true);
    await selectTreeNote(page, primaryNote);
    warmOpenMs.push(await alphaRender);

    const betaRender = waitForSurfaceRender(page, secondaryNote, null);
    await selectTreeNote(page, secondaryNote);
    await betaRender;
  }

  console.log(`vault: ${vaultRoot}`);
  console.log(`primary note: ${primaryNote}`);
  console.log(`secondary note: ${secondaryNote}`);
  console.log(`cold compile: ${Math.round(coldCompileMs)} ms`);
  console.log(`warm note-open cached median (${runs} runs): ${Math.round(median(warmOpenMs))} ms`);
} finally {
  await electronApp?.close();
  if (ownsVaultRoot) {
    await rm(vaultRoot, { recursive: true, force: true });
  }
}
