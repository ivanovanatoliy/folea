import { _electron as electron } from 'playwright';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { median, writePerformanceResult } from './performance-output.mjs';

const runs = Number.parseInt(process.env.FOLEA_INPUT_PAINT_RUNS ?? '20', 10);

const env = Object.fromEntries(
  Object.entries(process.env).filter((entry) => entry[1] !== undefined)
);

const vaultRoot = await mkdtemp(path.join(os.tmpdir(), 'folea-input-paint-'));
const longContent = Array.from({ length: 120 }, (_, i) => `Line ${i + 1} of scroll content.`).join(
  '\n\n'
);
await writeFile(
  path.join(vaultRoot, 'scroll-test.typ'),
  `= Scroll test\n\n${longContent}\n`,
  'utf8'
);

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

  // M3 budget proxy: keydown -> next animation frame after synchronous scroll.
  // requestAnimationFrame runs before composited paint, so this is an input-to-next-frame
  // upper-bound check for the hot dispatch path rather than a compositor timestamp.
  const measureOnce = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const surface = document.querySelector('[data-testid="typst-surface"]');
          if (!surface) {
            resolve(-1);
            return;
          }

          const start = performance.now();
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
          requestAnimationFrame(() => resolve(performance.now() - start));
        })
    );

  // Warm up
  for (let i = 0; i < 3; i++) {
    await measureOnce();
  }

  // Reset scroll to top
  await page.evaluate(() => {
    const surface = document.querySelector('[data-testid="typst-surface"]');
    if (surface) surface.scrollTop = 0;
  });

  const samples = [];
  for (let i = 0; i < runs; i++) {
    const delta = await measureOnce();
    samples.push(delta);
  }

  const med = median(samples);
  const min = Math.min(...samples);
  const max = Math.max(...samples);

  console.log(`input-to-next-frame proxy (${runs} runs):`);
  console.log(`  median: ${med.toFixed(1)} ms`);
  console.log(`  min:    ${min.toFixed(1)} ms`);
  console.log(`  max:    ${max.toFixed(1)} ms`);
  console.log(`  target: ≤ 16 ms`);
  console.log(med <= 16 ? '  ✓ within budget' : '  ✗ OVER BUDGET');
  await writePerformanceResult('input-to-next-frame', {
    noteCount: 1,
    runs,
    medianMs: med,
    minMs: min,
    maxMs: max,
    budgetMs: 16,
    samplesMs: samples
  });
} finally {
  await electronApp?.close();
  await rm(vaultRoot, { recursive: true, force: true });
}
