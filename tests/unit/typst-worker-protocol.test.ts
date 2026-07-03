import { describe, expect, it } from 'vitest';

import {
  isCompileRequest,
  isCompileResult,
  parseCompileRequest,
  parseCompileResult
} from '../../src/shared/worker/typst';

describe('typst compile-worker protocol', () => {
  it('accepts compile, prefetch, and invalidate requests', () => {
    const parsed = parseCompileRequest({
      type: 'compile',
      noteId: 'alpha.typ',
      source: '',
      sourceFiles: [
        { path: 'shared.typ', source: '#let value = 1' },
        {
          path: '.obsidian/plugins/typst-for-obsidian/packages/preview/pkg/0.1.0/typst.toml',
          source: '[package]'
        }
      ]
    });

    expect(parsed).toEqual({
      type: 'compile',
      noteId: 'alpha.typ',
      source: '',
      sourceFiles: new Map([
        ['shared.typ', '#let value = 1'],
        ['.obsidian/plugins/typst-for-obsidian/packages/preview/pkg/0.1.0/typst.toml', '[package]']
      ])
    });
    expect(
      parseCompileRequest({
        type: 'compile',
        noteId: 'alpha.typ',
        source: '',
        sourceFiles: new Map([['shared.typ', '#let value = 1']])
      })
    ).toEqual({
      type: 'compile',
      noteId: 'alpha.typ',
      source: '',
      sourceFiles: new Map([['shared.typ', '#let value = 1']])
    });
    expect(parseCompileRequest({ type: 'prefetch', noteId: 'alpha.typ', source: '' })).toEqual({
      type: 'prefetch',
      noteId: 'alpha.typ',
      source: ''
    });
    expect(parseCompileRequest({ type: 'invalidate', noteId: 'alpha.typ' })).toEqual({
      type: 'invalidate',
      noteId: 'alpha.typ'
    });
    expect(isCompileRequest({ type: 'compile', noteId: 'alpha.typ', source: '= Alpha' })).toBe(
      true
    );
  });

  it('rejects malformed requests', () => {
    expect(() => parseCompileRequest(null)).toThrow(TypeError);
    expect(() => parseCompileRequest({ type: 'compile', noteId: '', source: '= Alpha' })).toThrow(
      TypeError
    );
    expect(() =>
      parseCompileRequest({ type: 'compile', noteId: 'alpha.typ', source: '= Alpha', extra: true })
    ).toThrow(TypeError);
    expect(() =>
      parseCompileRequest({
        type: 'compile',
        noteId: 'alpha.typ',
        source: '= Alpha',
        sourceFiles: [{ path: '../escape.typ', source: '' }]
      })
    ).toThrow(TypeError);
    expect(isCompileRequest({ type: 'compile', noteId: 'alpha.typ' })).toBe(false);
  });

  it('accepts rendered and error results', () => {
    const rendered = {
      type: 'rendered',
      noteId: 'alpha.typ',
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
      diagnostics: [{ severity: 'error', message: 'expected expression', range: '0:8-0:8' }]
    };
    const prefetched = {
      type: 'prefetched',
      noteId: 'alpha.typ',
      cacheKey: 'abc:typst.ts@0.7.0',
      fromCache: false
    };

    expect(parseCompileResult(rendered)).toEqual(rendered);
    expect(parseCompileResult(error)).toEqual(error);
    expect(parseCompileResult(prefetched)).toEqual(prefetched);
    expect(isCompileResult(rendered)).toBe(true);
    expect(isCompileResult(error)).toBe(true);
    expect(isCompileResult(prefetched)).toBe(true);
  });

  it('rejects malformed results', () => {
    expect(() => parseCompileResult({ type: 'rendered', noteId: 'alpha.typ' })).toThrow(TypeError);
    expect(() =>
      parseCompileResult({
        type: 'error',
        noteId: 'broken.typ',
        diagnostics: [{ severity: 'fatal', message: 'bad' }]
      })
    ).toThrow(TypeError);
    expect(isCompileResult({ type: 'error', noteId: 'broken.typ', diagnostics: 'bad' })).toBe(
      false
    );
    expect(isCompileResult({ type: 'prefetched', noteId: 'alpha.typ' })).toBe(false);
  });
});
