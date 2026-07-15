import { readFile } from 'node:fs/promises';

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));
const baselines = await readJson('performance/baselines.json');
const coldStart = await readJson('.perf-results/cold-start.json');
const warmOpen = await readJson('.perf-results/warm-note-open.json');
const inputFrame = await readJson('.perf-results/input-to-next-frame.json');
const graphDelta = await readJson('.perf-results/link-graph-delta.json');

const failures = [];
const check = (label, actual, budget) => {
  if (!Number.isFinite(actual) || actual > budget) {
    failures.push(`${label}: ${actual} ms exceeds ${budget} ms`);
  }
};

check('cold start', coldStart.measurements.elapsedMs, baselines.metrics.coldStart.budgetMs);
check(
  'warm note open',
  warmOpen.measurements.warmMedianMs,
  baselines.metrics.warmNoteOpen.budgetMedianMs
);
check(
  'input to next frame',
  inputFrame.measurements.medianMs,
  baselines.metrics.inputToNextFrame.budgetMedianMs
);

const expectedSizes = new Set(
  baselines.metrics.linkGraphDelta.fixedVaults.map(({ noteCount }) => noteCount)
);
for (const result of graphDelta.measurements.results) {
  if (!expectedSizes.delete(result.noteCount)) {
    failures.push(`unexpected link graph vault size: ${result.noteCount}`);
    continue;
  }
  check(
    `link graph delta (${result.noteCount} notes)`,
    result.medianMs,
    baselines.metrics.linkGraphDelta.budgetMedianMs
  );
}
for (const missingSize of expectedSizes) {
  failures.push(`missing link graph vault size: ${missingSize}`);
}

if (failures.length > 0) {
  throw new Error(`Performance budget failures:\n${failures.join('\n')}`);
}
console.log('All performance measurements are within their committed budgets.');
