import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { VaultService } from '../../src/main/vault/service';

const roots: string[] = [];
const services: VaultService[] = [];

const setup = async (options: ConstructorParameters<typeof VaultService>[0] = {}) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-management-'));
  roots.push(root);
  const service = new VaultService(options);
  services.push(service);
  await service.open(root);
  return { root, service };
};

describe('vault management operations', () => {
  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.dispose()));
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('snapshots empty directories and exposes only direct templates', async () => {
    const { root, service } = await setup();
    await fs.mkdir(path.join(root, 'empty'));
    await fs.mkdir(path.join(root, '_templates', 'nested'), { recursive: true });
    await fs.writeFile(path.join(root, '_templates', 'daily.typ'), '= Daily');
    await fs.writeFile(path.join(root, '_templates', 'nested', 'hidden.typ'), '= Hidden');

    expect(await service.snapshot()).toMatchObject({
      notes: [],
      directories: [{ relPath: 'empty', name: 'empty' }]
    });
    expect(await service.templates()).toEqual([
      { relPath: '_templates/daily.typ', name: 'daily', contents: '= Daily' }
    ]);
    expect((await service.renderFiles()).map((file) => file.relPath)).toContain(
      '_templates/nested/hidden.typ'
    );
  });

  it('moves a directory with assets and rewrites incoming and moved outgoing references', async () => {
    const { root, service } = await setup();
    await fs.mkdir(path.join(root, 'old'));
    await fs.mkdir(path.join(root, 'dest'));
    await fs.writeFile(path.join(root, 'old', 'a.typ'), '#link("../outside.typ?x#y")[outside]');
    await fs.writeFile(path.join(root, 'old', 'asset.png'), 'asset');
    await fs.writeFile(path.join(root, 'outside.typ'), '#link("old/a")[A]');

    const result = await service.moveBatch({
      sources: ['old'],
      destinationDirectory: 'dest',
      updateReferences: true
    });

    expect(result.mappings).toEqual([{ from: 'old', to: 'dest/old' }]);
    await expect(fs.readFile(path.join(root, 'dest', 'old', 'asset.png'), 'utf8')).resolves.toBe(
      'asset'
    );
    await expect(fs.readFile(path.join(root, 'outside.typ'), 'utf8')).resolves.toBe(
      '#link("dest/old/a")[A]'
    );
    await expect(fs.readFile(path.join(root, 'dest', 'old', 'a.typ'), 'utf8')).resolves.toBe(
      '#link("../../outside.typ?x#y")[outside]'
    );
  });

  it('returns partial trash results and preserves failed sources', async () => {
    const { root, service } = await setup({
      trashItem: async (absolutePath) => {
        if (absolutePath.endsWith('bad.typ')) throw new Error('trash unavailable');
        await fs.rm(absolutePath, { recursive: true });
      }
    });
    await fs.writeFile(path.join(root, 'good.typ'), '= Good');
    await fs.writeFile(path.join(root, 'bad.typ'), '= Bad');

    const result = await service.trashBatch({ sources: ['good.typ', 'bad.typ'] });
    expect(result.results).toEqual([
      { source: 'good.typ', success: true },
      { source: 'bad.typ', success: false, error: 'trash unavailable' }
    ]);
    await expect(fs.stat(path.join(root, 'bad.typ'))).resolves.toBeDefined();
  });

  it('renames and trashes direct templates only in explicit template mode', async () => {
    const { root, service } = await setup({
      trashItem: async (absolutePath) => fs.rm(absolutePath)
    });
    await fs.mkdir(path.join(root, '_templates'));
    await fs.writeFile(path.join(root, '_templates', 'one.typ'), '= One');

    await expect(
      service.renameEntry({ from: '_templates/one.typ', to: '_templates/two.typ' })
    ).rejects.toThrow('template mode');
    await service.renameEntry({
      from: '_templates/one.typ',
      to: '_templates/two.typ',
      templateMode: true,
      updateReferences: false
    });
    const result = await service.trashBatch({
      sources: ['_templates/two.typ'],
      templateMode: true
    });
    expect(result.results).toEqual([{ source: '_templates/two.typ', success: true }]);
  });

  it('rolls back earlier batch moves after an intermediate filesystem failure', async () => {
    let calls = 0;
    const { root, service } = await setup({
      renamePath: async (from, to) => {
        calls++;
        if (calls === 2) throw new Error('simulated rename failure');
        await fs.rename(from, to);
      }
    });
    await fs.mkdir(path.join(root, 'dest'));
    await fs.writeFile(path.join(root, 'a.typ'), 'A');
    await fs.writeFile(path.join(root, 'b.typ'), 'B');

    await expect(
      service.moveBatch({ sources: ['a.typ', 'b.typ'], destinationDirectory: 'dest' })
    ).rejects.toThrow('simulated rename failure');
    await expect(fs.readFile(path.join(root, 'a.typ'), 'utf8')).resolves.toBe('A');
    await expect(fs.readFile(path.join(root, 'b.typ'), 'utf8')).resolves.toBe('B');
    await expect(fs.stat(path.join(root, 'dest', 'a.typ'))).rejects.toThrow();
  });
});
