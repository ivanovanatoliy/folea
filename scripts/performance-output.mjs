import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

export const writePerformanceResult = async (metric, measurements) => {
  const payload = {
    schemaVersion: 1,
    metric,
    measuredAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      cpu: os.cpus()[0]?.model ?? 'unknown'
    },
    measurements
  };
  const outputPath = process.env.FOLEA_PERF_OUTPUT ?? path.join('.perf-results', `${metric}.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`performance JSON: ${outputPath}`);
  return payload;
};
