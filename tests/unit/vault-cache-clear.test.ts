import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { clearRenderCache } from '../../src/main/vault-state';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('vault render cache clearing', () => {
  it('removes only the render cache and preserves vault state', async () => {
    const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-vault-cache-clear-'));
    roots.push(vaultRoot);
    const foleaDir = path.join(vaultRoot, '.folea');
    const renderCacheDir = path.join(foleaDir, 'render-cache');
    const statePath = path.join(foleaDir, 'state.json');
    const prefsPath = path.join(foleaDir, 'prefs.config');
    await fs.mkdir(path.join(renderCacheDir, 'entries'), { recursive: true });
    await fs.writeFile(path.join(renderCacheDir, 'manifest.json'), '{"schemaVersion":1}', 'utf8');
    await fs.writeFile(path.join(renderCacheDir, 'entries', 'entry.json'), '{}', 'utf8');
    await fs.writeFile(statePath, '{"schemaVersion":1}', 'utf8');
    await fs.writeFile(prefsPath, 'theme = dark\n', 'utf8');

    await clearRenderCache(vaultRoot);

    await expect(fs.stat(renderCacheDir)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.readFile(statePath, 'utf8')).resolves.toBe('{"schemaVersion":1}');
    await expect(fs.readFile(prefsPath, 'utf8')).resolves.toBe('theme = dark\n');
  });

  it('is idempotent when no render cache exists', async () => {
    const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-vault-cache-empty-'));
    roots.push(vaultRoot);

    await expect(clearRenderCache(vaultRoot)).resolves.toBeUndefined();
  });
});
