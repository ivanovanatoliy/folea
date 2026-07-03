import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { ArtifactCache } from '../../src/workers/typst-compile/cache';
import { createTypstEngine, type TypstEngine } from '../../src/workers/typst-compile/engine';
import { TypstCompileService } from '../../src/workers/typst-compile/service';

const fontUrl = new URL(
  '../../src/workers/typst-compile/assets/NotoSerif-Regular.ttf',
  import.meta.url
);
const newCmMathUrl = new URL(
  '../../src/workers/typst-compile/assets/NewCMMath-Regular.otf',
  import.meta.url
);
const newCm10RegularUrl = new URL(
  '../../src/workers/typst-compile/assets/NewCM10-Regular.otf',
  import.meta.url
);
const newCm10BoldUrl = new URL(
  '../../src/workers/typst-compile/assets/NewCM10-Bold.otf',
  import.meta.url
);
const newCm10ItalicUrl = new URL(
  '../../src/workers/typst-compile/assets/NewCM10-Italic.otf',
  import.meta.url
);
const newCm10BoldItalicUrl = new URL(
  '../../src/workers/typst-compile/assets/NewCM10-BoldItalic.otf',
  import.meta.url
);
const libertinusSerifRegularUrl = new URL(
  '../../src/workers/typst-compile/assets/LibertinusSerif-Regular.otf',
  import.meta.url
);
const libertinusSerifBoldUrl = new URL(
  '../../src/workers/typst-compile/assets/LibertinusSerif-Bold.otf',
  import.meta.url
);
const libertinusSerifItalicUrl = new URL(
  '../../src/workers/typst-compile/assets/LibertinusSerif-Italic.otf',
  import.meta.url
);
const libertinusSerifBoldItalicUrl = new URL(
  '../../src/workers/typst-compile/assets/LibertinusSerif-BoldItalic.otf',
  import.meta.url
);
const libertinusMathRegularUrl = new URL(
  '../../src/workers/typst-compile/assets/LibertinusMath-Regular.otf',
  import.meta.url
);
const compilerWasmUrl = new URL(
  '../../node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm',
  import.meta.url
);
const rendererWasmUrl = new URL(
  '../../node_modules/@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm',
  import.meta.url
);

let enginePromise: Promise<TypstEngine> | undefined;
let legacyEnginePromise: Promise<TypstEngine> | undefined;

const getEngine = (): Promise<TypstEngine> => {
  if (!enginePromise) {
    enginePromise = Promise.all([
      readFile(fontUrl),
      readFile(newCmMathUrl),
      readFile(newCm10RegularUrl),
      readFile(newCm10BoldUrl),
      readFile(newCm10ItalicUrl),
      readFile(newCm10BoldItalicUrl),
      readFile(libertinusSerifRegularUrl),
      readFile(libertinusSerifBoldUrl),
      readFile(libertinusSerifItalicUrl),
      readFile(libertinusSerifBoldItalicUrl),
      readFile(libertinusMathRegularUrl),
      readFile(compilerWasmUrl),
      readFile(rendererWasmUrl)
    ]).then((values) => {
      const [
        fontData,
        newCmMathData,
        newCm10RegularData,
        newCm10BoldData,
        newCm10ItalicData,
        newCm10BoldItalicData,
        libertinusSerifRegularData,
        libertinusSerifBoldData,
        libertinusSerifItalicData,
        libertinusSerifBoldItalicData,
        libertinusMathRegularData,
        compilerWasm,
        rendererWasm
      ] = values;

      return createTypstEngine({
        compilerWasmModule: () => new Uint8Array(compilerWasm),
        rendererWasmModule: () => new Uint8Array(rendererWasm),
        fontData: async () => [
          new Uint8Array(fontData),
          new Uint8Array(newCmMathData),
          new Uint8Array(newCm10RegularData),
          new Uint8Array(newCm10BoldData),
          new Uint8Array(newCm10ItalicData),
          new Uint8Array(newCm10BoldItalicData),
          new Uint8Array(libertinusSerifRegularData),
          new Uint8Array(libertinusSerifBoldData),
          new Uint8Array(libertinusSerifItalicData),
          new Uint8Array(libertinusSerifBoldItalicData),
          new Uint8Array(libertinusMathRegularData)
        ]
      });
    });
  }

  return enginePromise;
};

const getLegacyEngine = (): Promise<TypstEngine> => {
  if (!legacyEnginePromise) {
    legacyEnginePromise = Promise.all([
      readFile(fontUrl),
      readFile(libertinusSerifRegularUrl),
      readFile(libertinusSerifBoldUrl),
      readFile(libertinusSerifItalicUrl),
      readFile(libertinusSerifBoldItalicUrl),
      readFile(libertinusMathRegularUrl),
      readFile(compilerWasmUrl),
      readFile(rendererWasmUrl)
    ]).then((values) => {
      const [
        fontData,
        libertinusSerifRegularData,
        libertinusSerifBoldData,
        libertinusSerifItalicData,
        libertinusSerifBoldItalicData,
        libertinusMathRegularData,
        compilerWasm,
        rendererWasm
      ] = values;

      return createTypstEngine({
        compilerWasmModule: () => new Uint8Array(compilerWasm),
        rendererWasmModule: () => new Uint8Array(rendererWasm),
        fontData: async () => [
          new Uint8Array(fontData),
          new Uint8Array(libertinusSerifRegularData),
          new Uint8Array(libertinusSerifBoldData),
          new Uint8Array(libertinusSerifItalicData),
          new Uint8Array(libertinusSerifBoldItalicData),
          new Uint8Array(libertinusMathRegularData)
        ]
      });
    });
  }

  return legacyEnginePromise;
};

describe('typst worker engine integration', () => {
  it('compiles a Typst note to SVG with text', async () => {
    const output = await (
      await getEngine()
    ).compile({
      mainPath: 'alpha.typ',
      source: '= Alpha\n\nHello from Typst.'
    });

    expect(output.type).toBe('rendered');
    if (output.type !== 'rendered') {
      return;
    }

    expect(output.artifact.width).toBeGreaterThan(0);
    expect(output.artifact.height).toBeGreaterThan(0);
    expect(output.artifact.svg).toContain('<svg');
    expect(output.artifact.svg).toContain('Alpha');
    expect(output.artifact.svg).toContain('Hello from Typst');
    expect(output.textLayer.text).toContain('Alpha');
    expect(output.textLayer.text).toContain('Hello from Typst');
    expect(output.textLayer.pages).toHaveLength(1);
  }, 20_000);

  it('renders default math differently with the bundled New Computer Modern fonts', async () => {
    const source = '= Math\n\n$1 + 2 = 3$';
    const [withNewCm, withoutNewCm] = await Promise.all([
      (await getEngine()).compile({
        mainPath: 'math.typ',
        source
      }),
      (await getLegacyEngine()).compile({
        mainPath: 'math.typ',
        source
      })
    ]);

    expect(withNewCm.type).toBe('rendered');
    expect(withoutNewCm.type).toBe('rendered');
    if (withNewCm.type !== 'rendered' || withoutNewCm.type !== 'rendered') {
      return;
    }

    expect(withNewCm.textLayer.text).toBe(withoutNewCm.textLayer.text);
    expect(withNewCm.artifact.svg).not.toBe(withoutNewCm.artifact.svg);
  }, 20_000);

  it('returns diagnostics for broken Typst source', async () => {
    const output = await (
      await getEngine()
    ).compile({
      mainPath: 'broken.typ',
      source: '#let x ='
    });

    expect(output.type).toBe('error');
    if (output.type !== 'error') {
      return;
    }

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('expected expression')
      })
    );
  }, 20_000);

  it('compiles relative imports from the virtual vault source bundle', async () => {
    const output = await (
      await getEngine()
    ).compile({
      mainPath: 'nested/alpha.typ',
      source: '#import "../shared.typ": shared\n= Alpha\n#shared',
      sourceFiles: new Map([
        ['shared.typ', '#let shared = [Imported text]'],
        ['unrelated.typ', '= Unrelated']
      ])
    });

    expect(output.type).toBe('rendered');
    if (output.type !== 'rendered') {
      return;
    }

    expect(output.artifact.svg).toContain('Imported text');
    expect(output.textLayer.text).toContain('Imported text');
    expect(output.dependencies).toEqual(['nested/alpha.typ', 'shared.typ']);
  }, 20_000);

  it('returns an honest diagnostic for missing Typst packages', async () => {
    const output = await (
      await getEngine()
    ).compile({
      mainPath: 'package.typ',
      source: '#import "@preview/example:0.1.0": *'
    });

    expect(output.type).toBe('error');
    if (output.type !== 'error') {
      return;
    }

    expect(output.diagnostics[0]?.message).toBe(
      "@preview/example:0.1.0 not found in the vault's Typst package cache"
    );
  }, 20_000);

  it('compiles package imports from the local Obsidian package cache snapshot', async () => {
    const output = await (
      await getEngine()
    ).compile({
      mainPath: 'package.typ',
      source: '#import "@preview/localpkg:0.1.0": local-message\n= Package\n#local-message',
      sourceFiles: new Map([
        [
          '.obsidian/plugins/typst-for-obsidian/packages/preview/localpkg/0.1.0/typst.toml',
          '[package]\nname = "localpkg"\nversion = "0.1.0"\nentrypoint = "lib.typ"\n'
        ],
        [
          '.obsidian/plugins/typst-for-obsidian/packages/preview/localpkg/0.1.0/lib.typ',
          '#let local-message = [Local package text]'
        ]
      ])
    });

    expect(output.type).toBe('rendered');
    if (output.type !== 'rendered') {
      return;
    }

    expect(output.artifact.svg).toContain('Local package text');
    expect(output.dependencies).toEqual([
      '.obsidian/plugins/typst-for-obsidian/packages/preview/localpkg/0.1.0/lib.typ',
      '.obsidian/plugins/typst-for-obsidian/packages/preview/localpkg/0.1.0/typst.toml',
      'package.typ'
    ]);
  }, 20_000);

  it('resolves Obsidian template import placeholders to the vault template file', async () => {
    const output = await (
      await getEngine()
    ).compile({
      mainPath: '_templates/topic.typ',
      source: '#import "__TEMPLATE_IMPORT__": helper\n= Template\n#helper',
      sourceFiles: new Map([['_typst/template.typ', '#let helper = [Template helper]']])
    });

    expect(output.type).toBe('rendered');
    if (output.type !== 'rendered') {
      return;
    }

    expect(output.artifact.svg).toContain('Template helper');
    expect(output.dependencies).toEqual(['_templates/topic.typ', '_typst/template.typ']);
  }, 20_000);

  it('returns a clear diagnostic when an Obsidian template placeholder target is missing', async () => {
    const output = await (
      await getEngine()
    ).compile({
      mainPath: '_templates/topic.typ',
      source: '#import "__TEMPLATE_IMPORT__": helper\n= Template\n#helper'
    });

    expect(output.type).toBe('error');
    if (output.type !== 'error') {
      return;
    }

    expect(output.diagnostics[0]?.message).toContain(
      'expected _typst/template.typ in the vault snapshot'
    );
  }, 20_000);

  it('returns fromCache on the second identical compile through the service', async () => {
    const service = new TypstCompileService(
      await getEngine(),
      new ArtifactCache(4, 'integration-version')
    );

    const first = await service.compile('alpha.typ', '= Cached\n');
    const second = await service.compile('alpha.typ', '= Cached\n');

    expect(first.type).toBe('rendered');
    expect(second.type).toBe('rendered');
    expect(first.type === 'rendered' ? first.fromCache : undefined).toBe(false);
    expect(second.type === 'rendered' ? second.fromCache : undefined).toBe(true);
  }, 20_000);
});
