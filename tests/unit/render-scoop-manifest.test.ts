import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

it('renders lowercase installed Scoop names', () => {
  const output = path.join(mkdtempSync(path.join(tmpdir(), 'folea-scoop-')), 'folea-dev.json');
  execFileSync(process.execPath, ['scripts/render-scoop-manifest.mjs', output], {
    env: {
      ...process.env,
      FOLEA_VERSION: '0.0.0-git.20260718191500.c00000142.abcdef1',
      FOLEA_COMMIT_SHA: 'abcdef1234567890abcdef1234567890abcdef12',
      FOLEA_ARCHIVE_SHA256: '1'.repeat(64),
      FOLEA_COMMIT_COUNT: '142',
      FOLEA_BUILD_TIMESTAMP: '20260718191500',
      FOLEA_WORKFLOW_RUN_URL: 'https://example.test/run/1'
    }
  });

  const manifest = JSON.parse(readFileSync(output, 'utf8')) as {
    bin: string[][];
    shortcuts: string[][];
  };
  expect(manifest.bin).toEqual([['app\\folea.exe', 'folea']]);
  expect(manifest.shortcuts).toEqual([['app\\folea.exe', 'folea']]);
});
