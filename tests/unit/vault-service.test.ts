import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { VAULT_RENDER_FILES_MAX_TOTAL_BYTES, VaultService } from '../../src/main/vault/service';
import type { VaultChange } from '../../src/shared/ipc/vault';

const tempRoots: string[] = [];
const services: VaultService[] = [];

const makeTempDir = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-vault-service-'));
  tempRoots.push(root);
  return root;
};

const makeService = (): VaultService => {
  const service = new VaultService();
  services.push(service);
  return service;
};

const waitForEvent = (
  service: VaultService,
  predicate: (event: VaultChange) => boolean,
  timeoutMs = 4_000
): Promise<VaultChange> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Timed out waiting for vault event'));
    }, timeoutMs);

    const unsubscribe = service.onChanged((event) => {
      if (!predicate(event)) {
        return;
      }

      clearTimeout(timeout);
      unsubscribe();
      resolve(event);
    });
  });

describe('VaultService', () => {
  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.dispose()));
    await Promise.all(
      tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
    );
  });

  it('rejects operations before a vault is opened', async () => {
    const service = makeService();

    await expect(service.list()).rejects.toThrow('No vault is open');
    await expect(service.read({ relPath: 'a.typ' })).rejects.toThrow('No vault is open');
    await expect(service.create({ relPath: 'a.typ' })).rejects.toThrow('No vault is open');
  });

  it('lists nested .typ files and ignores noise directories', async () => {
    const root = await makeTempDir();
    await fs.mkdir(path.join(root, 'nested'), { recursive: true });
    await fs.mkdir(path.join(root, '.git'), { recursive: true });
    await fs.mkdir(path.join(root, '.obsidian', 'plugins'), { recursive: true });
    await fs.mkdir(path.join(root, 'node_modules'), { recursive: true });
    await fs.writeFile(path.join(root, 'b.typ'), '= B', 'utf8');
    await fs.writeFile(path.join(root, 'nested', 'a.typ'), '= A', 'utf8');
    await fs.writeFile(path.join(root, 'nested', 'ignore.md'), '# Ignore', 'utf8');
    await fs.writeFile(path.join(root, '.git', 'hidden.typ'), '= Hidden', 'utf8');
    await fs.writeFile(path.join(root, '.obsidian', 'plugins', 'hidden.typ'), '= Hidden', 'utf8');
    await fs.writeFile(path.join(root, 'node_modules', 'hidden.typ'), '= Hidden', 'utf8');

    const service = makeService();
    await service.open(root);

    expect((await service.list()).map((item) => item.relPath)).toEqual(['b.typ', 'nested/a.typ']);
  });

  it('returns render files for notes and local Obsidian Typst package cache', async () => {
    const root = await makeTempDir();
    const packageRoot = path.join(
      root,
      '.obsidian',
      'plugins',
      'typst-for-obsidian',
      'packages',
      'preview',
      'localpkg',
      '0.1.0'
    );
    await fs.mkdir(packageRoot, { recursive: true });
    await fs.mkdir(path.join(root, '_typst'), { recursive: true });
    await fs.writeFile(path.join(root, 'alpha.typ'), '= Alpha', 'utf8');
    await fs.writeFile(path.join(root, '_typst', 'template.typ'), '#let helper = 1', 'utf8');
    await fs.writeFile(path.join(packageRoot, 'typst.toml'), '[package]\n', 'utf8');
    await fs.writeFile(path.join(packageRoot, 'lib.typ'), '#let value = 1', 'utf8');
    await fs.writeFile(path.join(packageRoot, 'README.md'), '# ignored', 'utf8');

    const service = makeService();
    await service.open(root);

    expect(await service.renderFiles()).toEqual([
      { relPath: '_typst/template.typ', contents: '#let helper = 1' },
      {
        relPath: '.obsidian/plugins/typst-for-obsidian/packages/preview/localpkg/0.1.0/lib.typ',
        contents: '#let value = 1'
      },
      {
        relPath: '.obsidian/plugins/typst-for-obsidian/packages/preview/localpkg/0.1.0/typst.toml',
        contents: '[package]\n'
      },
      { relPath: 'alpha.typ', contents: '= Alpha' }
    ]);
  });

  it('rejects render snapshots that exceed the configured byte cap', async () => {
    const root = await makeTempDir();
    await fs.writeFile(path.join(root, 'alpha.typ'), '= Alpha', 'utf8');

    const service = new VaultService({ renderFilesMaxTotalBytes: 4 });
    services.push(service);
    await service.open(root);

    await expect(service.renderFiles()).rejects.toThrow(
      'Vault render snapshot exceeds 4 bytes while adding alpha.typ'
    );
    expect(VAULT_RENDER_FILES_MAX_TOTAL_BYTES).toBe(50 * 1024 * 1024);
  });

  it('handles a note named exactly .typ without breaking the vault listing', async () => {
    const root = await makeTempDir();
    await fs.writeFile(path.join(root, '.typ'), '= Dot Typ', 'utf8');

    const service = makeService();
    await service.open(root);

    expect(await service.list()).toMatchObject([
      {
        relPath: '.typ',
        basename: '.typ',
        title: '.typ'
      }
    ]);
  });

  it('reads, creates, renames, and deletes notes inside the vault', async () => {
    const root = await makeTempDir();
    await fs.writeFile(path.join(root, 'a.typ'), '= A', 'utf8');

    const service = makeService();
    await service.open(root);

    expect(await service.read({ relPath: 'a.typ' })).toBe('= A');

    const created = await service.create({ relPath: 'nested/b.typ', contents: '= B' });
    expect(created.relPath).toBe('nested/b.typ');
    await expect(service.create({ relPath: 'nested/b.typ' })).rejects.toThrow('already exists');

    const renamed = await service.rename({ from: 'nested/b.typ', to: 'c.typ' });
    expect(renamed.relPath).toBe('c.typ');
    expect(await service.read({ relPath: 'c.typ' })).toBe('= B');

    await service.delete({ relPath: 'c.typ' });
    await expect(service.read({ relPath: 'c.typ' })).rejects.toThrow();
  });

  it('replaces previous vault state when opening another vault', async () => {
    const first = await makeTempDir();
    const second = await makeTempDir();
    await fs.writeFile(path.join(first, 'first.typ'), '= First', 'utf8');
    await fs.writeFile(path.join(second, 'second.typ'), '= Second', 'utf8');

    const service = makeService();
    await service.open(first);
    expect((await service.list()).map((item) => item.relPath)).toEqual(['first.typ']);

    await service.open(second);
    expect((await service.list()).map((item) => item.relPath)).toEqual(['second.typ']);
  });

  it('emits watcher events for external create, modify, and delete', async () => {
    const root = await makeTempDir();
    const service = makeService();
    await service.open(root);

    const createEvent = waitForEvent(
      service,
      (event) => event.kind === 'created' && event.note.relPath === 'external.typ'
    );
    await fs.writeFile(path.join(root, 'external.typ'), '= External', 'utf8');
    await expect(createEvent).resolves.toMatchObject({ kind: 'created' });

    const changeEvent = waitForEvent(
      service,
      (event) => event.kind === 'changed' && event.note.relPath === 'external.typ'
    );
    await fs.writeFile(path.join(root, 'external.typ'), '= Changed', 'utf8');
    await expect(changeEvent).resolves.toMatchObject({ kind: 'changed' });

    const deleteEvent = waitForEvent(
      service,
      (event) => event.kind === 'deleted' && event.relPath === 'external.typ'
    );
    await fs.unlink(path.join(root, 'external.typ'));
    await expect(deleteEvent).resolves.toEqual({ kind: 'deleted', relPath: 'external.typ' });
  }, 12_000);

  it('cleans up previous watchers when reopening a vault', async () => {
    const firstRoot = await makeTempDir();
    const secondRoot = await makeTempDir();
    const service = makeService();
    await service.open(firstRoot);
    await service.open(secondRoot);

    const events: VaultChange[] = [];
    service.onChanged((event) => events.push(event));

    const createEvent = waitForEvent(
      service,
      (event) => event.kind === 'created' && event.note.relPath === 'single.typ'
    );

    await fs.writeFile(path.join(firstRoot, 'old.typ'), '= Old', 'utf8');
    await fs.writeFile(path.join(secondRoot, 'single.typ'), '= Single', 'utf8');
    await createEvent;
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'created',
        note: expect.objectContaining({ relPath: 'single.typ' })
      })
    ]);
  }, 8_000);
});
