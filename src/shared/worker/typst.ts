import { assertSafeRelativePosixPath } from '../path';

export interface CompileSourceFile {
  readonly path: string;
  readonly source: string;
}

export type CompileSourceFiles = ReadonlyMap<string, string>;

export type CompileRequest =
  | {
      readonly type: 'compile';
      readonly noteId: string;
      readonly source: string;
      readonly sourceFiles?: CompileSourceFiles;
    }
  | {
      readonly type: 'prefetch';
      readonly noteId: string;
      readonly source: string;
      readonly sourceFiles?: CompileSourceFiles;
    }
  | { readonly type: 'invalidate'; readonly noteId: string };

export interface RenderArtifact {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
}

export interface TextLayerSpan {
  readonly text: string;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TextLayerPage {
  readonly page: number;
  readonly width: number;
  readonly height: number;
}

export interface OutlinePosition {
  readonly page: number;
  readonly y: number;
}

export interface OutlineEntry {
  readonly level: number;
  readonly text: string;
  readonly position: OutlinePosition;
}

export interface TextLayerModel {
  readonly version: 1;
  readonly text: string;
  readonly spans: readonly TextLayerSpan[];
  readonly pages: readonly TextLayerPage[];
}

export interface Diagnostic {
  readonly severity: 'error' | 'warning' | 'info' | 'hint';
  readonly message: string;
  readonly path?: string;
  readonly range?: string;
}

export interface CompileInputFile {
  readonly path: string;
  readonly sha256: string;
}

export type CompileResult =
  | {
      readonly type: 'rendered';
      readonly noteId: string;
      readonly cacheKey: string;
      readonly artifact: RenderArtifact;
      readonly textLayer: TextLayerModel;
      readonly outline: readonly OutlineEntry[];
      readonly fromCache: boolean;
      readonly inputFiles: readonly CompileInputFile[];
    }
  | {
      readonly type: 'error';
      readonly noteId: string;
      readonly diagnostics: readonly Diagnostic[];
    }
  | {
      readonly type: 'prefetched';
      readonly noteId: string;
      readonly cacheKey: string;
      readonly fromCache: boolean;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
};

const isFiniteNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const parseNonEmptyString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new TypeError(`${label} must be a non-empty string`);
  }

  return value;
};

const parseSource = (value: unknown): string => {
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new TypeError('source must be a string');
  }

  return value;
};

const parseSourcePath = (value: unknown): string => {
  const path = parseNonEmptyString(value, 'source path');

  try {
    return assertSafeRelativePosixPath(path, {
      label: 'source path',
      allowedSuffixes: ['.typ', '/typst.toml']
    });
  } catch (error) {
    if (error instanceof TypeError && error.message.endsWith('must use an allowed file suffix')) {
      throw new TypeError('source path must be a relative POSIX Typst project path', {
        cause: error
      });
    }

    throw new TypeError('source path must be a relative POSIX Typst project path', {
      cause: error
    });
  }
};

const parseCompileSourceFile = (value: unknown): CompileSourceFile => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['path', 'source'])) {
    throw new TypeError('Malformed typst source file');
  }

  return {
    path: parseSourcePath(value.path),
    source: parseSource(value.source)
  };
};

const parseCompileSourceFiles = (value: unknown): CompileSourceFiles | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value instanceof Map) {
    return new Map(
      [...value.entries()].map(([path, source]) => {
        if (typeof source !== 'string') {
          throw new TypeError('source file source must be a string');
        }

        return [parseSourcePath(path), parseSource(source)] as const;
      })
    );
  }

  if (Array.isArray(value)) {
    return new Map(
      value.map((sourceFile) => {
        const parsed = parseCompileSourceFile(sourceFile);
        return [parsed.path, parsed.source] as const;
      })
    );
  }

  throw new TypeError('sourceFiles must be a map or array');
};

export const parseCompileRequest = (value: unknown): CompileRequest => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new TypeError('Malformed typst worker request');
  }

  switch (value.type) {
    case 'compile':
    case 'prefetch': {
      if (!hasOnlyKeys(value, ['type', 'noteId', 'source', 'sourceFiles'])) {
        throw new TypeError('Malformed typst compile request');
      }

      const sourceFiles = parseCompileSourceFiles(value.sourceFiles);

      return {
        type: value.type,
        noteId: parseNonEmptyString(value.noteId, 'noteId'),
        source: parseSource(value.source),
        ...(sourceFiles === undefined ? {} : { sourceFiles })
      };
    }

    case 'invalidate': {
      if (!hasOnlyKeys(value, ['type', 'noteId'])) {
        throw new TypeError('Malformed typst invalidate request');
      }

      return {
        type: 'invalidate',
        noteId: parseNonEmptyString(value.noteId, 'noteId')
      };
    }

    default:
      throw new TypeError('Malformed typst worker request');
  }
};

export const isCompileRequest = (value: unknown): value is CompileRequest => {
  try {
    parseCompileRequest(value);
    return true;
  } catch {
    return false;
  }
};

export const parseDiagnostic = (value: unknown): Diagnostic => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['severity', 'message', 'path', 'range'])) {
    throw new TypeError('Malformed typst diagnostic');
  }

  const severity = value.severity;
  if (
    severity !== 'error' &&
    severity !== 'warning' &&
    severity !== 'info' &&
    severity !== 'hint'
  ) {
    throw new TypeError('Malformed typst diagnostic');
  }

  if (typeof value.message !== 'string' || value.message.length === 0) {
    throw new TypeError('Malformed typst diagnostic');
  }

  if (value.path !== undefined && typeof value.path !== 'string') {
    throw new TypeError('Malformed typst diagnostic');
  }

  if (value.range !== undefined && typeof value.range !== 'string') {
    throw new TypeError('Malformed typst diagnostic');
  }

  return {
    severity,
    message: value.message,
    ...(value.path === undefined ? {} : { path: value.path }),
    ...(value.range === undefined ? {} : { range: value.range })
  };
};

export const parseRenderArtifact = (value: unknown): RenderArtifact => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['svg', 'width', 'height'])) {
    throw new TypeError('Malformed typst render artifact');
  }

  if (
    typeof value.svg !== 'string' ||
    value.svg.length === 0 ||
    !isFiniteNonNegativeNumber(value.width) ||
    !isFiniteNonNegativeNumber(value.height)
  ) {
    throw new TypeError('Malformed typst render artifact');
  }

  return { svg: value.svg, width: value.width, height: value.height };
};

const parseTextLayerSpan = (value: unknown): TextLayerSpan => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['text', 'page', 'x', 'y', 'width', 'height'])) {
    throw new TypeError('Malformed typst text layer span');
  }

  if (
    typeof value.text !== 'string' ||
    !isFiniteNonNegativeNumber(value.page) ||
    !isFiniteNonNegativeNumber(value.x) ||
    !isFiniteNonNegativeNumber(value.y) ||
    !isFiniteNonNegativeNumber(value.width) ||
    !isFiniteNonNegativeNumber(value.height)
  ) {
    throw new TypeError('Malformed typst text layer span');
  }

  return {
    text: value.text,
    page: value.page,
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height
  };
};

const parseTextLayerPage = (value: unknown): TextLayerPage => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['page', 'width', 'height'])) {
    throw new TypeError('Malformed typst text layer page');
  }

  if (
    !isFiniteNonNegativeNumber(value.page) ||
    !isFiniteNonNegativeNumber(value.width) ||
    !isFiniteNonNegativeNumber(value.height)
  ) {
    throw new TypeError('Malformed typst text layer page');
  }

  return { page: value.page, width: value.width, height: value.height };
};

const parseOutlinePosition = (value: unknown): OutlinePosition => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['page', 'y'])) {
    throw new TypeError('Malformed typst outline position');
  }

  if (!isFiniteNonNegativeNumber(value.page) || !isFiniteNonNegativeNumber(value.y)) {
    throw new TypeError('Malformed typst outline position');
  }

  return { page: value.page, y: value.y };
};

const parseOutlineEntry = (value: unknown): OutlineEntry => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['level', 'text', 'position'])) {
    throw new TypeError('Malformed typst outline entry');
  }

  if (
    !isFiniteNonNegativeNumber(value.level) ||
    typeof value.text !== 'string' ||
    value.text.length === 0
  ) {
    throw new TypeError('Malformed typst outline entry');
  }

  return {
    level: value.level,
    text: value.text,
    position: parseOutlinePosition(value.position)
  };
};

export const parseTextLayerModel = (value: unknown): TextLayerModel => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['version', 'text', 'spans', 'pages'])) {
    throw new TypeError('Malformed typst text layer model');
  }

  if (value.version !== 1 || typeof value.text !== 'string') {
    throw new TypeError('Malformed typst text layer model');
  }

  if (!Array.isArray(value.spans) || !Array.isArray(value.pages)) {
    throw new TypeError('Malformed typst text layer model');
  }

  return {
    version: 1,
    text: value.text,
    spans: value.spans.map(parseTextLayerSpan),
    pages: value.pages.map(parseTextLayerPage)
  };
};

export const parseCompileResult = (value: unknown): CompileResult => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new TypeError('Malformed typst worker result');
  }

  switch (value.type) {
    case 'rendered': {
      if (
        !hasOnlyKeys(value, [
          'type',
          'noteId',
          'cacheKey',
          'artifact',
          'textLayer',
          'outline',
          'fromCache',
          'inputFiles'
        ])
      ) {
        throw new TypeError('Malformed typst rendered result');
      }

      if (typeof value.fromCache !== 'boolean') {
        throw new TypeError('Malformed typst rendered result');
      }

      const outlineValue = (value as Record<string, unknown>).outline;
      const inputFilesValue = (value as Record<string, unknown>).inputFiles;

      const inputFiles: CompileInputFile[] = [];
      if (Array.isArray(inputFilesValue)) {
        for (const entry of inputFilesValue) {
          if (
            isRecord(entry) &&
            typeof entry.path === 'string' &&
            typeof entry.sha256 === 'string'
          ) {
            inputFiles.push({ path: entry.path, sha256: entry.sha256 });
          }
        }
      }

      return {
        type: 'rendered',
        noteId: parseNonEmptyString(value.noteId, 'noteId'),
        cacheKey: parseNonEmptyString(value.cacheKey, 'cacheKey'),
        artifact: parseRenderArtifact(value.artifact),
        textLayer: parseTextLayerModel(value.textLayer),
        outline: Array.isArray(outlineValue) ? outlineValue.map(parseOutlineEntry) : [],
        fromCache: value.fromCache,
        inputFiles
      };
    }

    case 'error': {
      if (
        !hasOnlyKeys(value, ['type', 'noteId', 'diagnostics']) ||
        !Array.isArray(value.diagnostics)
      ) {
        throw new TypeError('Malformed typst error result');
      }

      return {
        type: 'error',
        noteId: parseNonEmptyString(value.noteId, 'noteId'),
        diagnostics: value.diagnostics.map(parseDiagnostic)
      };
    }

    case 'prefetched': {
      if (!hasOnlyKeys(value, ['type', 'noteId', 'cacheKey', 'fromCache'])) {
        throw new TypeError('Malformed typst prefetch result');
      }

      if (typeof value.fromCache !== 'boolean') {
        throw new TypeError('Malformed typst prefetch result');
      }

      return {
        type: 'prefetched',
        noteId: parseNonEmptyString(value.noteId, 'noteId'),
        cacheKey: parseNonEmptyString(value.cacheKey, 'cacheKey'),
        fromCache: value.fromCache
      };
    }

    default:
      throw new TypeError('Malformed typst worker result');
  }
};

export const isCompileResult = (value: unknown): value is CompileResult => {
  try {
    parseCompileResult(value);
    return true;
  } catch {
    return false;
  }
};
