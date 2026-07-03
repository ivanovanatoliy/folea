import compilerWasmInit, {
  TypstCompilerBuilder
} from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs';
import rendererWasmInit, {
  TypstRendererBuilder
} from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer.mjs';
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/wasm?url';
import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/wasm?url';

import type {
  CompileSourceFiles,
  Diagnostic,
  OutlineEntry,
  RenderArtifact,
  TextLayerModel
} from '../../shared/worker/typst';

import defaultFontUrl from './assets/NotoSerif-Regular.ttf?url';
import newCmMathRegularUrl from './assets/NewCMMath-Regular.otf?url';
import newCm10RegularUrl from './assets/NewCM10-Regular.otf?url';
import newCm10BoldUrl from './assets/NewCM10-Bold.otf?url';
import newCm10ItalicUrl from './assets/NewCM10-Italic.otf?url';
import newCm10BoldItalicUrl from './assets/NewCM10-BoldItalic.otf?url';
import libertinusSerifRegularUrl from './assets/LibertinusSerif-Regular.otf?url';
import libertinusSerifBoldUrl from './assets/LibertinusSerif-Bold.otf?url';
import libertinusSerifItalicUrl from './assets/LibertinusSerif-Italic.otf?url';
import libertinusSerifBoldItalicUrl from './assets/LibertinusSerif-BoldItalic.otf?url';
import libertinusMathRegularUrl from './assets/LibertinusMath-Regular.otf?url';
import {
  diagnosticFromThrown,
  fallbackDiagnostic,
  FoleaTypstDiagnosticError,
  normalizeDiagnostics,
  parseCompileOutput
} from './diagnostics';
import {
  assertObsidianTemplateImportAvailable,
  hasObsidianCompatFile,
  readObsidianCompatFile,
  resolveObsidianPackageRoot
} from './obsidian-compat';
import { fromVirtualTypstPath, toVirtualTypstPath } from './path';
import { extractOutlineEntries } from './outline';
import { extractTextLayerModel } from './text-layer';

const DIAGNOSTICS_FULL = 3;
const SVG_BODY_DEFS_CSS = (1 << 0) | (1 << 1) | (1 << 2);

export interface TypstCompileInput {
  readonly mainPath: string;
  readonly source: string;
  readonly sourceFiles?: CompileSourceFiles;
}

export interface TypstRenderSuccess {
  readonly type: 'rendered';
  readonly artifact: RenderArtifact;
  readonly textLayer: TextLayerModel;
  readonly outline: readonly OutlineEntry[];
  readonly dependencies: readonly string[];
}

export interface TypstRenderFailure {
  readonly type: 'error';
  readonly diagnostics: readonly Diagnostic[];
}

export type TypstRenderOutput = TypstRenderSuccess | TypstRenderFailure;

export interface TypstEngine {
  compile(input: TypstCompileInput): Promise<TypstRenderOutput>;
}

type WasmModuleReference =
  | string
  | URL
  | Response
  | ArrayBuffer
  | Uint8Array
  | WebAssembly.Module
  | undefined;

export interface TypstEngineAssets {
  readonly compilerWasmModule: () => WasmModuleReference | Promise<WasmModuleReference>;
  readonly rendererWasmModule: () => WasmModuleReference | Promise<WasmModuleReference>;
  readonly fontData: () => Promise<readonly Uint8Array[]>;
}

interface TypstAccessModel {
  files: Map<string, Uint8Array>;
  dependencyPaths: Set<string>;
}

const defaultFontUrls = [
  defaultFontUrl,
  newCmMathRegularUrl,
  newCm10RegularUrl,
  newCm10BoldUrl,
  newCm10ItalicUrl,
  newCm10BoldItalicUrl,
  libertinusSerifRegularUrl,
  libertinusSerifBoldUrl,
  libertinusSerifItalicUrl,
  libertinusSerifBoldItalicUrl,
  libertinusMathRegularUrl
] as const;

const defaultAssets: TypstEngineAssets = {
  compilerWasmModule: () => compilerWasmUrl,
  rendererWasmModule: () => rendererWasmUrl,
  fontData: async () => {
    const fontResponses = await Promise.all(
      defaultFontUrls.map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Unable to load bundled Typst font: ${response.status}`);
        }

        return new Uint8Array(await response.arrayBuffer());
      })
    );

    return fontResponses;
  }
};

let initializedCompilerWasm = false;
let initializedRendererWasm = false;

const initializeCompilerWasm = async (moduleReference: WasmModuleReference): Promise<void> => {
  if (initializedCompilerWasm) {
    return;
  }

  if (moduleReference === undefined) {
    await compilerWasmInit();
  } else {
    await compilerWasmInit({ module_or_path: moduleReference });
  }

  initializedCompilerWasm = true;
};

const initializeRendererWasm = async (moduleReference: WasmModuleReference): Promise<void> => {
  if (initializedRendererWasm) {
    return;
  }

  if (moduleReference === undefined) {
    await rendererWasmInit();
  } else {
    await rendererWasmInit({ module_or_path: moduleReference });
  }

  initializedRendererWasm = true;
};

export const createTypstEngine = async (
  assets: TypstEngineAssets = defaultAssets
): Promise<TypstEngine> => {
  const fontData = await assets.fontData();
  const accessModel: TypstAccessModel = { files: new Map(), dependencyPaths: new Set() };

  await initializeCompilerWasm(await assets.compilerWasmModule());
  const compilerBuilder = new TypstCompilerBuilder();
  await compilerBuilder.set_access_model(
    accessModel,
    () => 0,
    (path: string) => {
      const normalizedPath = normalizeVirtualPath(path);
      return (
        accessModel.files.has(normalizedPath) ||
        hasObsidianCompatFile(accessModel.files, normalizedPath)
      );
    },
    (path: string) => normalizeVirtualPath(path),
    (path: string) => {
      const normalizedPath = normalizeVirtualPath(path);
      const compatFile = readObsidianCompatFile(accessModel.files, normalizedPath);
      if (compatFile) {
        accessModel.dependencyPaths.add(compatFile.path);
        return compatFile.contents;
      }

      const file = accessModel.files.get(normalizedPath);
      if (!file) {
        throw new FoleaTypstDiagnosticError(
          `Typst file not found in vault snapshot: ${normalizedPath}`
        );
      }

      accessModel.dependencyPaths.add(normalizedPath);
      return file;
    }
  );
  await compilerBuilder.set_package_registry(accessModel, (spec: unknown) =>
    resolveObsidianPackageRoot(accessModel.files, spec)
  );
  for (const font of fontData) {
    await compilerBuilder.add_raw_font(font);
  }
  const compiler = await compilerBuilder.build();

  await initializeRendererWasm(await assets.rendererWasmModule());
  const renderer = await new TypstRendererBuilder().build();

  return {
    compile: async (input: TypstCompileInput): Promise<TypstRenderOutput> => {
      compiler.reset();
      const mainFilePath = toVirtualTypstPath(input.mainPath);
      accessModel.files = buildSourceFileMap(input, mainFilePath);
      accessModel.dependencyPaths = new Set([mainFilePath]);
      try {
        assertObsidianTemplateImportAvailable(accessModel.files, mainFilePath, input.source);
      } catch (error) {
        return {
          type: 'error',
          diagnostics: [diagnosticFromThrown(error)]
        };
      }

      compiler.add_source(mainFilePath, input.source);

      let rawCompileOutput: unknown;
      try {
        rawCompileOutput = compiler.compile(mainFilePath, null, 'vector', DIAGNOSTICS_FULL);
      } catch (error) {
        return {
          type: 'error',
          diagnostics: [diagnosticFromThrown(error)]
        };
      }

      const compileOutput = parseCompileOutput(rawCompileOutput);
      const diagnostics = normalizeDiagnostics(compileOutput.diagnostics);

      if (compileOutput.hasError === true || compileOutput.result === undefined) {
        return {
          type: 'error',
          diagnostics: diagnostics.length > 0 ? diagnostics : [fallbackDiagnostic('compile failed')]
        };
      }

      const session = renderer.session_from_artifact(compileOutput.result, 'vector');
      try {
        const width = Math.ceil(session.doc_width);
        const height = Math.ceil(session.doc_height);
        const svg = renderer.svg_data(session, SVG_BODY_DEFS_CSS);
        const artifact: RenderArtifact = { svg, width, height };
        const outline = extractOutlineEntries(compiler.query(mainFilePath, null, 'heading'), svg);

        return {
          type: 'rendered',
          artifact,
          textLayer: extractTextLayerModel(svg, artifact),
          outline,
          dependencies: [...accessModel.dependencyPaths]
            .map(fromVirtualTypstPath)
            .sort((left, right) => left.localeCompare(right))
        };
      } finally {
        session.free();
      }
    }
  };
};

const textEncoder = new TextEncoder();

const buildSourceFileMap = (
  input: TypstCompileInput,
  mainFilePath: string
): Map<string, Uint8Array> => {
  const files = new Map<string, Uint8Array>();

  for (const [path, source] of input.sourceFiles ?? new Map()) {
    const virtualPath = toVirtualTypstPath(path);
    files.set(virtualPath, textEncoder.encode(source));
  }

  files.set(mainFilePath, textEncoder.encode(input.source));
  return files;
};

const normalizeVirtualPath = (path: string): string => toVirtualTypstPath(path);
