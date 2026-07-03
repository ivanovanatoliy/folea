import { describe, expect, it } from 'vitest';

import {
  VAULT_CREATE_CHANNEL,
  VAULT_DELETE_CHANNEL,
  VAULT_OPEN_CHANNEL,
  VAULT_READ_CHANNEL,
  VAULT_RENDER_FILES_CHANNEL,
  VAULT_RENAME_CHANNEL,
  createListRenderFilesRequest,
  createCreateNoteRequest,
  createDeleteNoteRequest,
  createOpenVaultRequest,
  createReadNoteRequest,
  createRenameNoteRequest,
  parseCreateNoteInvokeRequest,
  parseCreateNoteRequest,
  parseDeleteNoteRequest,
  parseListNotesRequestArgs,
  parseListRenderFilesInvokeRequest,
  parseListRenderFilesRequestArgs,
  parseOpenVaultRequestArgs,
  parseOpenVaultInvokeRequest,
  parseReadNoteRequest,
  parseRenameNoteInvokeRequest,
  parseRenameNoteRequest,
  parseVaultChange,
  parseVaultPath,
  parseVaultRenderFileList
} from '../../src/shared/ipc/vault';

describe('vault IPC contract', () => {
  it('accepts valid requests', () => {
    expect(parseOpenVaultRequestArgs([])).toEqual({ type: VAULT_OPEN_CHANNEL });
    expect(parseOpenVaultInvokeRequest(createOpenVaultRequest('/tmp/vault'))).toEqual({
      type: VAULT_OPEN_CHANNEL,
      rootPath: '/tmp/vault'
    });
    expect(parseListNotesRequestArgs([])).toEqual({ type: 'folea:vault:list' });
    expect(createReadNoteRequest(parseReadNoteRequest({ relPath: 'a.typ' }))).toEqual({
      type: VAULT_READ_CHANNEL,
      relPath: 'a.typ'
    });
    expect(parseListRenderFilesRequestArgs([])).toEqual({ type: VAULT_RENDER_FILES_CHANNEL });
    expect(parseListRenderFilesInvokeRequest(createListRenderFilesRequest())).toEqual({
      type: VAULT_RENDER_FILES_CHANNEL
    });
    expect(
      parseCreateNoteInvokeRequest(
        createCreateNoteRequest(
          parseCreateNoteRequest({ relPath: 'dir/a.typ', contents: '#let x = 1' })
        )
      )
    ).toEqual({
      type: VAULT_CREATE_CHANNEL,
      relPath: 'dir/a.typ',
      contents: '#let x = 1'
    });
    expect(
      parseRenameNoteInvokeRequest(
        createRenameNoteRequest(parseRenameNoteRequest({ from: 'a.typ', to: 'b.typ' }))
      )
    ).toEqual({
      type: VAULT_RENAME_CHANNEL,
      from: 'a.typ',
      to: 'b.typ'
    });
    expect(createDeleteNoteRequest(parseDeleteNoteRequest({ relPath: 'b.typ' }))).toEqual({
      type: VAULT_DELETE_CHANNEL,
      relPath: 'b.typ'
    });
  });

  it('rejects invalid relPath values', () => {
    expect(() => parseVaultPath('../outside.typ')).toThrow(TypeError);
    expect(() => parseVaultPath('/absolute.typ')).toThrow(TypeError);
    expect(() => parseVaultPath('C:/absolute.typ')).toThrow(TypeError);
    expect(() => parseVaultPath('dir\\note.typ')).toThrow(TypeError);
    expect(() => parseVaultPath('dir/./note.typ')).toThrow(TypeError);
    expect(() => parseVaultPath('dir//note.typ')).toThrow(TypeError);
    expect(() => parseVaultPath('note.txt')).toThrow(TypeError);
  });

  it('validates render file responses', () => {
    expect(
      parseVaultRenderFileList([
        { relPath: 'alpha.typ', contents: '= Alpha' },
        {
          relPath: '.obsidian/plugins/typst-for-obsidian/packages/preview/pkg/0.1.0/typst.toml',
          contents: '[package]\n'
        }
      ])
    ).toEqual([
      { relPath: 'alpha.typ', contents: '= Alpha' },
      {
        relPath: '.obsidian/plugins/typst-for-obsidian/packages/preview/pkg/0.1.0/typst.toml',
        contents: '[package]\n'
      }
    ]);

    expect(() => parseVaultRenderFileList([{ relPath: '../escape.typ', contents: '' }])).toThrow(
      TypeError
    );
    expect(() => parseVaultRenderFileList([{ relPath: 'README.md', contents: '' }])).toThrow(
      TypeError
    );
  });

  it('rejects malformed requests', () => {
    expect(() => parseOpenVaultRequestArgs(['one', 'two'])).toThrow(TypeError);
    expect(() => parseOpenVaultInvokeRequest({ type: VAULT_OPEN_CHANNEL, rootPath: '' })).toThrow(
      TypeError
    );
    expect(() => parseListRenderFilesRequestArgs(['extra'])).toThrow(TypeError);
    expect(() => parseReadNoteRequest({ relPath: '../outside.typ' })).toThrow(TypeError);
    expect(() => parseCreateNoteRequest({ relPath: 'a.typ', contents: 1 })).toThrow(TypeError);
    expect(() => parseRenameNoteRequest({ from: 'a.typ' })).toThrow(TypeError);
    expect(() => parseDeleteNoteRequest({ relPath: 'a.md' })).toThrow(TypeError);
  });

  it('validates vault change events', () => {
    const note = {
      id: 'a.typ',
      relPath: 'a.typ',
      basename: 'a.typ',
      title: 'a',
      byteSize: 4,
      mtimeMs: 1
    };

    expect(parseVaultChange({ kind: 'created', note })).toEqual({ kind: 'created', note });
    expect(parseVaultChange({ kind: 'changed', note })).toEqual({ kind: 'changed', note });
    expect(
      parseVaultChange({
        kind: 'renamed',
        oldRelPath: 'a.typ',
        newRelPath: 'b.typ',
        note: { ...note, id: 'b.typ', relPath: 'b.typ', basename: 'b.typ', title: 'b' }
      })
    ).toMatchObject({ kind: 'renamed', oldRelPath: 'a.typ', newRelPath: 'b.typ' });
    expect(parseVaultChange({ kind: 'deleted', relPath: 'a.typ' })).toEqual({
      kind: 'deleted',
      relPath: 'a.typ'
    });

    expect(() => parseVaultChange({ kind: 'created' })).toThrow(TypeError);
    expect(() => parseVaultChange({ kind: 'deleted', relPath: '../outside.typ' })).toThrow(
      TypeError
    );
    expect(() => parseVaultChange({ kind: 'unknown' })).toThrow(TypeError);
  });
});
