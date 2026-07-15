import { describe, expect, it } from 'vitest';

import {
  isCompileRequest,
  isCompileResult,
  parseCompileRequest,
  parseCompileResult,
  parseTypstWorkerResult
} from '../../src/shared/worker/typst';

describe('typst compile-worker protocol', () => {
  it('accepts snapshot, delta, compile, dependency, and invalidation requests', () => {
    expect(
      parseCompileRequest({
        type: 'syncSnapshot',
        version: 3,
        files: [
          { path: 'shared.typ', source: '#let value = 1' },
          {
            path: '.obsidian/plugins/typst-for-obsidian/packages/preview/pkg/0.1.0/typst.toml',
            source: '[package]'
          }
        ]
      })
    ).toEqual({
      type: 'syncSnapshot',
      version: 3,
      files: new Map([
        ['shared.typ', '#let value = 1'],
        ['.obsidian/plugins/typst-for-obsidian/packages/preview/pkg/0.1.0/typst.toml', '[package]']
      ])
    });
    expect(
      parseCompileRequest({
        type: 'updateFiles',
        version: 4,
        changed: new Map([['shared.typ', '#let value = 2']]),
        deleted: ['old.typ']
      })
    ).toEqual({
      type: 'updateFiles',
      version: 4,
      changed: new Map([['shared.typ', '#let value = 2']]),
      deleted: ['old.typ']
    });
    expect(parseCompileRequest({ type: 'compile', noteId: 'alpha.typ', version: 4 })).toEqual({
      type: 'compile',
      noteId: 'alpha.typ',
      version: 4
    });
    expect(parseCompileRequest({ type: 'prefetch', noteId: 'alpha.typ', version: 4 })).toEqual({
      type: 'prefetch',
      noteId: 'alpha.typ',
      version: 4
    });
    expect(
      parseCompileRequest({
        type: 'registerDependencies',
        noteId: 'alpha.typ',
        dependencies: ['alpha.typ', 'shared.typ']
      })
    ).toEqual({
      type: 'registerDependencies',
      noteId: 'alpha.typ',
      dependencies: ['alpha.typ', 'shared.typ']
    });
    expect(parseCompileRequest({ type: 'invalidate', noteId: 'alpha.typ' })).toEqual({
      type: 'invalidate',
      noteId: 'alpha.typ'
    });
    expect(isCompileRequest({ type: 'compile', noteId: 'alpha.typ', version: 4 })).toBe(true);
  });

  it('rejects malformed requests', () => {
    expect(() => parseCompileRequest(null)).toThrow(TypeError);
    expect(() => parseCompileRequest({ type: 'compile', noteId: '', version: 1 })).toThrow(
      TypeError
    );
    expect(() =>
      parseCompileRequest({ type: 'compile', noteId: 'alpha.typ', version: -1 })
    ).toThrow(TypeError);
    expect(() =>
      parseCompileRequest({ type: 'compile', noteId: 'alpha.typ', version: 1, extra: true })
    ).toThrow(TypeError);
    expect(() =>
      parseCompileRequest({
        type: 'syncSnapshot',
        version: 1,
        files: [{ path: '../escape.typ', source: '' }]
      })
    ).toThrow(TypeError);
    expect(isCompileRequest({ type: 'compile', noteId: 'alpha.typ' })).toBe(false);
  });

  it('accepts compile and control results', () => {
    const rendered = {
      type: 'rendered',
      noteId: 'alpha.typ',
      version: 2,
      cacheKey: 'abc:typst.ts@0.7.0',
      artifact: { svg: '<svg />', width: 10, height: 20 },
      textLayer: {
        version: 1,
        text: 'Alpha',
        spans: [],
        pages: [{ page: 0, width: 10, height: 20 }]
      },
      outline: [],
      inputFiles: [],
      fromCache: true
    };
    const error = {
      type: 'error',
      noteId: 'broken.typ',
      version: 2,
      diagnostics: [{ severity: 'error', message: 'expected expression', range: '0:8-0:8' }]
    };
    const prefetched = {
      type: 'prefetched',
      noteId: 'alpha.typ',
      version: 2,
      cacheKey: 'abc:typst.ts@0.7.0',
      fromCache: false
    };

    expect(parseCompileResult(rendered)).toEqual(rendered);
    expect(parseCompileResult(error)).toEqual(error);
    expect(parseCompileResult(prefetched)).toEqual(prefetched);
    expect(isCompileResult(rendered)).toBe(true);
    expect(isCompileResult(error)).toBe(true);
    expect(isCompileResult(prefetched)).toBe(true);
    expect(parseTypstWorkerResult({ type: 'snapshotSynced', version: 2 })).toEqual({
      type: 'snapshotSynced',
      version: 2
    });
    expect(
      parseTypstWorkerResult({ type: 'filesUpdated', version: 3, affectedNoteIds: ['alpha.typ'] })
    ).toEqual({ type: 'filesUpdated', version: 3, affectedNoteIds: ['alpha.typ'] });
  });

  it('rejects malformed results', () => {
    expect(() => parseCompileResult({ type: 'rendered', noteId: 'alpha.typ' })).toThrow(TypeError);
    expect(() =>
      parseCompileResult({
        type: 'error',
        noteId: 'broken.typ',
        version: 1,
        diagnostics: [{ severity: 'fatal', message: 'bad' }]
      })
    ).toThrow(TypeError);
    expect(isCompileResult({ type: 'error', noteId: 'broken.typ', diagnostics: 'bad' })).toBe(
      false
    );
    expect(isCompileResult({ type: 'prefetched', noteId: 'alpha.typ' })).toBe(false);
    expect(() =>
      parseTypstWorkerResult({ type: 'filesUpdated', version: 3, affectedNoteIds: ['../bad.typ'] })
    ).toThrow(TypeError);
  });
});
