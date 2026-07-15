import { describe, expect, it } from 'vitest';

import { isTypstCompileWorkerUrl, parseTypstWorkerAssetName } from '../../src/main/window';
import { TYPST_WORKER_CSP_MARKER } from '../../src/shared/security';

describe('Typst worker CSP identification', () => {
  it('recognizes the stable query marker in development and production URLs', () => {
    expect(
      isTypstCompileWorkerUrl(
        `http://localhost:5173/src/workers/typst-compile/index.ts?${TYPST_WORKER_CSP_MARKER}=1`
      )
    ).toBe(true);
    expect(
      isTypstCompileWorkerUrl(
        `file:///app/out/renderer/assets/index-a1b2c3.js?${TYPST_WORKER_CSP_MARKER}=1`
      )
    ).toBe(true);
  });

  it('does not identify source paths, similarly named parameters, or malformed URLs', () => {
    expect(isTypstCompileWorkerUrl('file:///app/src/workers/typst-compile/index.ts')).toBe(false);
    expect(isTypstCompileWorkerUrl(`file:///app/index.js?${TYPST_WORKER_CSP_MARKER}=0`)).toBe(
      false
    );
    expect(isTypstCompileWorkerUrl('not a URL')).toBe(false);
  });
});

describe('Typst worker protocol confinement', () => {
  it('accepts emitted worker assets and binary dependencies', () => {
    expect(
      parseTypstWorkerAssetName('folea-worker://assets/index-a1b2c3.js?folea-typst-worker=1')
    ).toBe('index-a1b2c3.js');
    expect(parseTypstWorkerAssetName('folea-worker://assets/compiler.wasm')).toBe('compiler.wasm');
    expect(parseTypstWorkerAssetName('folea-worker://assets/font.otf')).toBe('font.otf');
  });

  it('rejects traversal, nested paths, foreign origins, and unrelated file types', () => {
    expect(() => parseTypstWorkerAssetName('folea-worker://assets/%2e%2e%2fsecret.js')).toThrow();
    expect(() => parseTypstWorkerAssetName('folea-worker://assets/nested/worker.js')).toThrow();
    expect(() => parseTypstWorkerAssetName('folea-worker://other/worker.js')).toThrow();
    expect(() => parseTypstWorkerAssetName('folea-worker://assets/config.json')).toThrow();
  });
});
