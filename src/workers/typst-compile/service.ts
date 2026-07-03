import type { CompileRequest, CompileResult, CompileSourceFiles } from '../../shared/worker/typst';

import { ArtifactCache, hashSource, type CachedDependency } from './cache';
import type { TypstEngine } from './engine';

export class TypstCompileService {
  private queue = Promise.resolve();

  constructor(
    private readonly engine: TypstEngine,
    private readonly cache = new ArtifactCache()
  ) {}

  handle(request: CompileRequest): Promise<CompileResult | undefined> {
    if (request.type === 'invalidate') {
      this.cache.invalidate(request.noteId);
      return Promise.resolve(undefined);
    }

    const result = this.compile(
      request.noteId,
      request.source,
      request.sourceFiles ?? new Map<string, string>()
    );

    if (request.type === 'prefetch') {
      return result.then((prefetchResult) => {
        if (prefetchResult.type === 'error') {
          return undefined;
        }

        return {
          type: 'prefetched',
          noteId: prefetchResult.noteId,
          cacheKey: prefetchResult.cacheKey,
          fromCache: prefetchResult.fromCache
        };
      });
    }

    return result;
  }

  async compile(
    noteId: string,
    source: string,
    sourceFiles: CompileSourceFiles = new Map<string, string>()
  ): Promise<CompileResult> {
    const sourceLookup = createSourceLookup(noteId, source, sourceFiles);
    // Key on noteId + source, not source alone: two notes can share byte-identical source yet
    // resolve different vault-relative imports, and the dependency check below cannot tell them
    // apart because the whole-vault snapshot contains both notes' neighbours. The NUL separator
    // cannot appear in a validated relPath, so distinct (noteId, source) pairs cannot collide.
    // Dependency content hashes stay keyed on file contents only.
    const contentHash = await hashSource(`${noteId}\0${source}`);
    const cacheKey = this.cache.keyForContentHash(contentHash);
    const cached = this.cache.get(noteId, cacheKey);

    if (cached && (await dependenciesMatch(cached.dependencies, sourceLookup))) {
      return {
        type: 'rendered',
        noteId,
        cacheKey,
        artifact: cached.artifact,
        textLayer: cached.textLayer,
        outline: cached.outline,
        fromCache: true,
        inputFiles: cached.dependencies.map((dep) => ({ path: dep.path, sha256: dep.contentHash }))
      };
    }

    return this.enqueueCompile(noteId, source, sourceFiles, cacheKey, sourceLookup);
  }

  private enqueueCompile(
    noteId: string,
    source: string,
    sourceFiles: CompileSourceFiles,
    cacheKey: string,
    sourceLookup: SourceLookup
  ): Promise<CompileResult> {
    const result = this.queue.then(() =>
      this.compileUncached(noteId, source, sourceFiles, cacheKey, sourceLookup)
    );
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private async compileUncached(
    noteId: string,
    source: string,
    sourceFiles: CompileSourceFiles,
    cacheKey: string,
    sourceLookup: SourceLookup
  ): Promise<CompileResult> {
    const output = await this.engine.compile({ mainPath: noteId, source, sourceFiles });

    if (output.type === 'error') {
      return { type: 'error', noteId, diagnostics: output.diagnostics };
    }

    const render = {
      artifact: output.artifact,
      textLayer: output.textLayer,
      outline: output.outline,
      dependencies: await hashDependencies(output.dependencies, sourceLookup)
    };
    this.cache.put(noteId, cacheKey, render);

    return {
      type: 'rendered',
      noteId,
      cacheKey,
      artifact: render.artifact,
      textLayer: render.textLayer,
      outline: render.outline,
      fromCache: false,
      inputFiles: render.dependencies.map((dep) => ({ path: dep.path, sha256: dep.contentHash }))
    };
  }
}

interface SourceLookup {
  get(path: string): string | undefined;
}

const createSourceLookup = (
  noteId: string,
  source: string,
  sourceFiles: CompileSourceFiles
): SourceLookup => {
  return {
    get: (path: string) => (path === noteId ? source : sourceFiles.get(path))
  };
};

const dependenciesMatch = async (
  dependencies: readonly CachedDependency[],
  sourceLookup: SourceLookup
): Promise<boolean> => {
  for (const dependency of dependencies) {
    const currentSource = sourceLookup.get(dependency.path);
    if (currentSource === undefined) {
      return false;
    }

    if ((await hashSource(currentSource)) !== dependency.contentHash) {
      return false;
    }
  }

  return true;
};

const hashDependencies = async (
  paths: readonly string[],
  sourceLookup: SourceLookup
): Promise<readonly CachedDependency[]> => {
  const dependencies: CachedDependency[] = [];

  for (const path of [...new Set(paths)].sort((left, right) => left.localeCompare(right))) {
    const source = sourceLookup.get(path);
    if (source === undefined) {
      throw new Error(`Compiled dependency is missing from the render snapshot: ${path}`);
    }

    dependencies.push({ path, contentHash: await hashSource(source) });
  }

  return dependencies;
};
