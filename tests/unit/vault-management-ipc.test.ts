import { describe, expect, it } from 'vitest';

import {
  createAnalyzeVaultOperationRequest,
  createCreateDirectoryRequest,
  createMoveVaultEntriesRequest,
  createRenameVaultEntryRequest,
  createTrashVaultEntriesRequest,
  parseAnalyzeVaultOperationInvokeRequest,
  parseCreateDirectoryInvokeRequest,
  parseMoveVaultEntriesInvokeRequest,
  parseRenameVaultEntryInvokeRequest,
  parseTrashVaultEntriesInvokeRequest,
  parseVaultEntryName,
  parseVaultSnapshot
} from '../../src/shared/ipc/vault';

describe('vault management IPC contract', () => {
  it('round-trips typed management requests', () => {
    expect(
      parseCreateDirectoryInvokeRequest(createCreateDirectoryRequest({ relPath: 'a/b' }))
    ).toEqual({ relPath: 'a/b' });
    expect(
      parseAnalyzeVaultOperationInvokeRequest(
        createAnalyzeVaultOperationRequest({
          operation: 'move',
          sources: ['a.typ'],
          destination: ''
        })
      )
    ).toEqual({ operation: 'move', sources: ['a.typ'], destination: '' });
    expect(
      parseRenameVaultEntryInvokeRequest(
        createRenameVaultEntryRequest({ from: 'a.typ', to: 'b.typ', updateReferences: true })
      )
    ).toEqual({ from: 'a.typ', to: 'b.typ', updateReferences: true });
    expect(
      parseMoveVaultEntriesInvokeRequest(
        createMoveVaultEntriesRequest({ sources: ['a.typ'], destinationDirectory: 'archive' })
      )
    ).toEqual({ sources: ['a.typ'], destinationDirectory: 'archive' });
    expect(
      parseTrashVaultEntriesInvokeRequest(
        createTrashVaultEntriesRequest({ sources: ['a.typ'], removeReferences: true })
      )
    ).toEqual({ sources: ['a.typ'], removeReferences: true });
    expect(
      parseRenameVaultEntryInvokeRequest(
        createRenameVaultEntryRequest({
          from: '_templates/a.typ',
          to: '_templates/b.typ',
          templateMode: true
        })
      )
    ).toMatchObject({ templateMode: true });
  });

  it('rejects reserved paths, traversal, duplicate sources, and malformed snapshots', () => {
    expect(() => createCreateDirectoryRequest({ relPath: '_templates/nested' })).toThrow();
    expect(() =>
      createMoveVaultEntriesRequest({ sources: ['a.typ', 'a.typ'], destinationDirectory: '' })
    ).toThrow();
    expect(() => createTrashVaultEntriesRequest({ sources: ['../a.typ'] })).toThrow();
    expect(() => parseVaultEntryName('a/b')).toThrow();
    expect(() =>
      parseVaultSnapshot({ notes: [], directories: [{ relPath: '.git', name: '.git' }] })
    ).toThrow();
  });
});
