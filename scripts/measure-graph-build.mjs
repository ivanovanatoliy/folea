import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const runs = Number.parseInt(process.env.FOLEA_GRAPH_RUNS ?? '10', 10);
const configuredVaultRoot = process.env.FOLEA_GRAPH_VAULT_PATH;
const ownsVaultRoot = configuredVaultRoot === undefined;
const vaultRoot =
  configuredVaultRoot ?? (await mkdtemp(path.join(os.tmpdir(), 'folea-graph-build-')));

const env = Object.fromEntries(
  Object.entries(process.env).filter((entry) => entry[1] !== undefined)
);

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

// Register a one-shot listener for folea:graph-built in the renderer.
// Must be called before triggering the rebuild so the listener is in place first.
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

// Vault note paths for triggering writes
const noteFiles = [];

let electronApp;

try {
  if (ownsVaultRoot) {
    // Synthetic vault: 20 notes with cross-links + one nested note
    await mkdir(path.join(vaultRoot, 'sub'));
    for (let i = 0; i < 20; i += 1) {
      const next = (i + 1) % 20;
      const absPath = path.join(vaultRoot, `note${i}.typ`);
      await writeFile(absPath, `= Note ${i}\n\n#link("note${next}.typ")[Next]\n`, 'utf8');
      noteFiles.push(absPath);
    }
    const deepPath = path.join(vaultRoot, 'sub', 'deep.typ');
    await writeFile(deepPath, '= Deep\n\n#link("../note0.typ")[Root]\n', 'utf8');
    noteFiles.push(deepPath);
  } else {
    // Real vault — use the first few .typ files we find for writes
    // (we restore the exact content after each write)
    const { readdirSync } = await import('node:fs');
    const scan = (dir, depth = 0) => {
      if (depth > 3) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          scan(path.join(dir, entry.name), depth + 1);
        } else if (entry.name.endsWith('.typ')) {
          noteFiles.push(path.join(dir, entry.name));
        }
      }
    };
    scan(configuredVaultRoot);
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

  // Wait for the vault to fully load (surface rendered = initial graph pre-built).
  await page.getByTestId('typst-surface').waitFor({ state: 'visible' });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="typst-surface"]')?.getAttribute('data-state') ===
      'rendered'
  );

  const noteCount = await page.evaluate(() => window.folea.vault.list().then((n) => n.length));
  console.log(`vault: ${vaultRoot}`);
  console.log(`note count: ${noteCount}`);

  // Time graph rebuilds by writing vault files directly (triggers Electron's file watcher).
  const durations = [];
  for (let i = 0; i < runs; i += 1) {
    const filePath = noteFiles[i % noteFiles.length];
    const { readFile } = await import('node:fs/promises');
    const original = await readFile(filePath, 'utf8');

    // Register the listener BEFORE touching the file to avoid a race
    const pending = waitForGraphBuilt(page);
    await writeFile(filePath, original + ' ', 'utf8');
    const detail = await pending;
    durations.push(detail.durationMs);

    // Restore original content (suppress the resulting rebuild)
    await writeFile(filePath, original, 'utf8');
    // Allow the watcher to settle before next run
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(
    `graph rebuild median (${runs} runs): ${Math.round(median(durations))} ms (local Linux, ${new Date().toISOString().slice(0, 10)}; npm run measure:graph-build)`
  );
  console.log(
    `min: ${Math.round(Math.min(...durations))} ms, max: ${Math.round(Math.max(...durations))} ms`
  );
} finally {
  await electronApp?.close();
  if (ownsVaultRoot) {
    await rm(vaultRoot, { recursive: true, force: true });
  }
}
