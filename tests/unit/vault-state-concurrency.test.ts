import { describe, expect, it } from 'vitest';

import { VaultStateManager, type VaultStatePersistence } from '../../src/main/vault-state';
import {
  defaultVaultState,
  type ReadRenderCacheResponse,
  type VaultStateFileV1,
  type WriteRenderCacheRequest
} from '../../src/shared/ipc/vault-state';

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('VaultStateManager concurrency', () => {
  it('serializes deliberately reordered state writes without losing patches', async () => {
    let persisted = defaultVaultState();
    let saveCount = 0;
    const persistence: VaultStatePersistence = {
      loadState: async () => persisted,
      saveState: async (_root, state) => {
        saveCount += 1;
        if (saveCount === 1) await delay(30);
        persisted = state;
      },
      readCache: async (): Promise<ReadRenderCacheResponse> => ({ hit: false, reason: 'missing' }),
      writeCache: async () => undefined,
      invalidateCache: async () => undefined,
      clearCache: async () => undefined
    };
    const manager = new VaultStateManager('/vault', persistence);
    await manager.load();

    await Promise.all([
      manager.update({
        type: 'noteOpened',
        relPath: 'note.typ',
        title: 'Note',
        openedAt: '2026-07-15T00:00:00Z'
      }),
      manager.update({ type: 'commandExecuted', commandId: 'tree.open' })
    ]);

    expect(persisted.lastOpenedNote).toBe('note.typ');
    expect(persisted.commandHistory).toEqual(['tree.open']);
    expect(manager.getState()).toEqual(persisted);
  });

  it('serializes cache reads, writes, and invalidations as complete transactions', async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const transaction = async (name: string): Promise<void> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(`${name}:start`);
      await delay(name === 'write' ? 25 : 5);
      order.push(`${name}:end`);
      active -= 1;
    };
    const persistence: VaultStatePersistence = {
      loadState: async (): Promise<VaultStateFileV1> => defaultVaultState(),
      saveState: async () => undefined,
      readCache: async () => {
        await transaction('read');
        return { hit: false, reason: 'missing' };
      },
      writeCache: async () => transaction('write'),
      invalidateCache: async () => transaction('invalidate'),
      clearCache: async () => transaction('clear')
    };
    const manager = new VaultStateManager('/vault', persistence);
    const request: WriteRenderCacheRequest = {
      manifestEntry: {
        cacheKey: 'key',
        relPath: 'note.typ',
        entryPath: 'entries/key.json',
        compilerVersion: 'compiler',
        rendererVersion: 'renderer',
        inputHash: 'hash',
        inputFiles: [],
        byteSize: 1,
        createdAt: '2026-07-15T00:00:00Z',
        lastUsedAt: '2026-07-15T00:00:00Z'
      },
      entry: {
        schemaVersion: 1 as const,
        cacheKey: 'key',
        relPath: 'note.typ',
        artifact: {
          svg: '<svg/>',
          width: 1,
          height: 1
        },
        textLayer: { version: 1, text: '', spans: [], pages: [] },
        outline: []
      }
    };

    await Promise.all([
      manager.writeRenderCache(request),
      manager.readRenderCache({ relPath: 'note.typ' }),
      manager.invalidateRenderCache(['note.typ']),
      manager.clearRenderCache()
    ]);

    expect(maxActive).toBe(1);
    expect(order).toEqual([
      'write:start',
      'write:end',
      'read:start',
      'read:end',
      'invalidate:start',
      'invalidate:end',
      'clear:start',
      'clear:end'
    ]);
  });
});
