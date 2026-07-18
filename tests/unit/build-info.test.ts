import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { readBuildInfo } from '../../src/main/build-info';

describe('readBuildInfo', () => {
  it('reads the packaged commit metadata', () => {
    const resources = mkdtempSync(path.join(tmpdir(), 'folea-build-info-'));
    writeFileSync(path.join(resources, 'build-info'), 'SOURCE_COMMIT=abcdef\n');

    expect(readBuildInfo(resources)).toBe('SOURCE_COMMIT=abcdef\n');
  });
});
