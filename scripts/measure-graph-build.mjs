import { _electron as electron } from 'playwright';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { median, writePerformanceResult } from './performance-output.mjs';

const runs = Number.parseInt(process.env.FOLEA_GRAPH_RUNS ?? '5', 10);
const configuredVaultRoot = process.env.FOLEA_GRAPH_VAULT_PATH;
const fixedVaultSizes = (process.env.FOLEA_GRAPH_VAULT_SIZES ?? '20,50,100')
  .split(',')
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isSafeInteger(value) && value > 1);
const env = Object.fromEntries(
  Object.entries(process.env).filter((entry) => entry[1] !== undefined)
);

const waitForGraphBuilt = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const handler = (event) => {
          window.removeEventListener('folea:graph-built', handler);
          resolve(event.detail);
        };
        window.addEventListener('folea:graph-built', handler);
      })
  );

const findTypstFiles = async (vaultRoot) => {
  const { readdir } = await import('node:fs/promises');
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.name.endsWith('.typ')) files.push(absolutePath);
    }
  };
  await visit(vaultRoot);
  return files;
};

const createSyntheticVault = async (noteCount) => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), `folea-graph-${noteCount}-`));
  const noteFiles = [];
  for (let index = 0; index < noteCount; index += 1) {
    const next = (index + 1) % noteCount;
    const filePath = path.join(vaultRoot, `note-${String(index).padStart(4, '0')}.typ`);
    await writeFile(
      filePath,
      `= Note ${index}\n\n#link("note-${String(next).padStart(4, '0')}.typ")[Next]\n`,
      'utf8'
    );
    noteFiles.push(filePath);
  }
  return { vaultRoot, noteFiles };
};

const measureVault = async ({ vaultRoot, noteFiles, noteCount }) => {
  let electronApp;
  try {
    electronApp = await electron.launch({
      args: [process.cwd()],
      env: {
        ...env,
        FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
        FOLEA_TEST_VAULT_PATH: vaultRoot
      }
    });
    const page = await electronApp.firstWindow();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="typst-surface"]')?.getAttribute('data-state') ===
        'rendered'
    );
    await page.waitForTimeout(500);

    const durations = [];
    for (let index = 0; index < runs; index += 1) {
      const filePath = noteFiles[index % noteFiles.length];
      const { readFile } = await import('node:fs/promises');
      const original = await readFile(filePath, 'utf8');
      const pending = waitForGraphBuilt(page);
      await writeFile(filePath, `${original} `, 'utf8');
      const detail = await pending;
      durations.push(detail.durationMs);
      await writeFile(filePath, original, 'utf8');
      await page.waitForTimeout(250);
    }

    return {
      noteCount,
      runs,
      medianMs: median(durations),
      minMs: Math.min(...durations),
      maxMs: Math.max(...durations),
      samplesMs: durations
    };
  } finally {
    await electronApp?.close();
  }
};

const measurements = [];
if (configuredVaultRoot) {
  const noteFiles = await findTypstFiles(configuredVaultRoot);
  if (noteFiles.length < 2) throw new Error('Graph measurement requires at least two notes');
  measurements.push(
    await measureVault({
      vaultRoot: configuredVaultRoot,
      noteFiles,
      noteCount: noteFiles.length
    })
  );
} else {
  if (fixedVaultSizes.length === 0) throw new Error('No valid fixed vault sizes configured');
  for (const noteCount of fixedVaultSizes) {
    const synthetic = await createSyntheticVault(noteCount);
    try {
      measurements.push(await measureVault({ ...synthetic, noteCount }));
    } finally {
      await rm(synthetic.vaultRoot, { recursive: true, force: true });
    }
  }
}

for (const measurement of measurements) {
  console.log(
    `link graph delta median (${measurement.noteCount} notes, ${runs} runs): ${measurement.medianMs.toFixed(2)} ms`
  );
}
await writePerformanceResult('link-graph-delta', {
  methodology: 'filesystem change to completed incremental renderer graph update',
  fixedVaultSizes: configuredVaultRoot ? null : fixedVaultSizes,
  results: measurements
});
