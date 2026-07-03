import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  openVaultRoot,
  resolveExistingNotePath,
  resolveNewNotePath,
  resolveRelativeNotePath
} from '../../src/main/vault/paths';

const tempRoots: string[] = [];

const makeTempDir = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-vault-paths-'));
  tempRoots.push(root);
  return root;
};

const linkDirectory = async (target: string, linkPath: string): Promise<void> => {
  await fs.symlink(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
};

describe('vault path confinement', () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
    );
  });

  it('accepts normal relative note paths', async () => {
    const rootPath = await makeTempDir();
    await fs.mkdir(path.join(rootPath, 'notes'));
    await fs.writeFile(path.join(rootPath, 'notes', 'a.typ'), '= A', 'utf8');

    const root = await openVaultRoot(rootPath);
    const resolved = await resolveExistingNotePath(root, 'notes/a.typ');

    expect(resolved.relPath).toBe('notes/a.typ');
    expect(resolved.absolutePath).toBe(path.join(root.realRoot, 'notes', 'a.typ'));
  });

  it('rejects traversal, absolute paths, and non-note targets', async () => {
    const root = await openVaultRoot(await makeTempDir());

    expect(() => resolveRelativeNotePath(root, '../outside.typ')).toThrow(TypeError);
    expect(() => resolveRelativeNotePath(root, '/outside.typ')).toThrow(TypeError);
    expect(() => resolveRelativeNotePath(root, 'note.md')).toThrow(TypeError);
    await expect(resolveNewNotePath(root, 'missing/../note.typ')).rejects.toThrow(TypeError);
  });

  it('rejects symlink escapes outside the vault', async () => {
    const rootPath = await makeTempDir();
    const outsidePath = await makeTempDir();
    await fs.writeFile(path.join(outsidePath, 'outside.typ'), '= Outside', 'utf8');
    await linkDirectory(outsidePath, path.join(rootPath, 'linked'));

    const root = await openVaultRoot(rootPath);
    await expect(resolveExistingNotePath(root, 'linked/outside.typ')).rejects.toThrow(
      'outside the vault'
    );
  });

  it('accepts symlink paths that resolve inside the vault', async () => {
    const rootPath = await makeTempDir();
    const realDirectory = path.join(rootPath, 'real');
    await fs.mkdir(realDirectory);
    await fs.writeFile(path.join(realDirectory, 'inside.typ'), '= Inside', 'utf8');
    await linkDirectory(realDirectory, path.join(rootPath, 'alias'));

    const root = await openVaultRoot(rootPath);
    const resolved = await resolveExistingNotePath(root, 'alias/inside.typ');

    expect(resolved.relPath).toBe('alias/inside.typ');
  });
});
