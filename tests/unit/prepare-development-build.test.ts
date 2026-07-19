import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const script = path.resolve('scripts/prepare-development-build.mjs');
const run = (sha: string) => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'folea-development-build-'));
  mkdirSync(path.join(cwd, 'packaging'));
  writeFileSync(
    path.join(cwd, 'package.json'),
    JSON.stringify({ devDependencies: { electron: '41.10.2' } })
  );
  const version = execFileSync(process.execPath, [script], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FOLEA_COMMIT_SHA: sha,
      FOLEA_BUILD_TIMESTAMP: '20260718191500',
      FOLEA_COMMIT_COUNT: '142'
    }
  }).trim();

  return { version, buildInfo: readFileSync(path.join(cwd, 'packaging/build-info'), 'utf8') };
};

describe('prepare-development-build', () => {
  it('creates a package-manager-safe version tied to one commit', () => {
    const metadata = run('abcdef1234567890abcdef1234567890abcdef12');

    expect(metadata.version).toBe('0.0.0-git.20260718191500.c00000142.abcdef1');
    expect(metadata.buildInfo).toContain('SOURCE_COMMIT=abcdef1234567890abcdef1234567890abcdef12');
    expect(metadata.buildInfo).toContain('BUILD_TIMESTAMP_UTC=20260718191500');
  });

  it('rejects mutable commit identifiers', () => {
    expect(() => run('develop')).toThrow();
  });
});
