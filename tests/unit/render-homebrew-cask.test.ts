import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

it('renders an immutable Homebrew cask', () => {
  const output = path.join(mkdtempSync(path.join(tmpdir(), 'folea-cask-')), 'folea-dev.rb');
  execFileSync(process.execPath, ['scripts/render-homebrew-cask.mjs', output], {
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

  const cask = readFileSync(output, 'utf8');
  expect(cask).toContain('version "abcdef1234567890abcdef1234567890abcdef12"');
  expect(cask).toContain(`sha256 "${'1'.repeat(64)}"`);
  expect(cask).not.toMatch(/__[A-Z_]+__/);
});
