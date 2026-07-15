import type {
  CompileRequest,
  CompileResult,
  CompileSourceFiles,
  TypstWorkerResult
} from '../../shared/worker/typst';
import { parseTypstReferences, resolveTypstReferencePath } from '../../shared/typst-links';

import { ArtifactCache, hashSource, type CachedDependency } from './cache';
import type { TypstEngine } from './engine';

export class TypstCompileService {
  private compileQueue = Promise.resolve();
  private requestQueue = Promise.resolve();
  private sourceFiles = new Map<string, string>();
  private sourceVersion: number | undefined;
  private readonly dependenciesByNote = new Map<string, Set<string>>();
  private readonly notesByDependency = new Map<string, Set<string>>();
  private readonly sourceHashByNote = new Map<string, string>();

  constructor(
    private readonly engine: TypstEngine,
    private readonly cache = new ArtifactCache()
  ) {}

  handle(request: CompileRequest): Promise<TypstWorkerResult | undefined> {
    const result = this.requestQueue.then(() => this.handleSerial(request));
    this.requestQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private async handleSerial(request: CompileRequest): Promise<TypstWorkerResult | undefined> {
    if (request.type === 'syncSnapshot') {
      this.sourceFiles = new Map(request.files);
      this.sourceVersion = request.version;
      this.dependenciesByNote.clear();
      this.notesByDependency.clear();
      this.sourceHashByNote.clear();
      this.cache.clear();
      this.engine.syncSnapshot?.(this.sourceFiles);
      return { type: 'snapshotSynced', version: request.version };
    }

    if (request.type === 'updateFiles') {
      if (this.sourceVersion === undefined || request.version <= this.sourceVersion) {
        throw new Error('Typst source delta version must advance the synchronized snapshot');
      }
      const affected = this.affectedNotes([...request.changed.keys(), ...request.deleted]);
      for (const [path, source] of request.changed) this.sourceFiles.set(path, source);
      for (const path of request.deleted) this.sourceFiles.delete(path);
      this.engine.updateFiles?.(request.changed, request.deleted);
      this.sourceVersion = request.version;
      for (const noteId of affected) this.cache.invalidate(noteId);
      return {
        type: 'filesUpdated',
        version: request.version,
        affectedNoteIds: [...affected].sort((left, right) => left.localeCompare(right))
      };
    }

    if (request.type === 'invalidate') {
      this.cache.invalidate(request.noteId);
      return undefined;
    }

    if (request.type === 'registerDependencies') {
      this.registerDependencies(request.noteId, request.dependencies);
      return undefined;
    }

    if (this.sourceVersion === undefined) {
      throw new Error('Typst source snapshot is not synchronized');
    }
    if (request.version !== this.sourceVersion) {
      return {
        type: 'error',
        noteId: request.noteId,
        version: request.version,
        diagnostics: [{ severity: 'error', message: 'Typst source snapshot is stale' }]
      };
    }
    const source = this.sourceFiles.get(request.noteId);
    if (source === undefined) {
      return {
        type: 'error',
        noteId: request.noteId,
        version: request.version,
        diagnostics: [{ severity: 'error', message: 'Typst note is missing from the snapshot' }]
      };
    }

    const result = this.compile(request.noteId, source, this.sourceFiles, request.version, true);

    if (request.type === 'prefetch') {
      return result.then((prefetchResult) => {
        if (prefetchResult.type === 'error') {
          return undefined;
        }

        return {
          type: 'prefetched',
          noteId: prefetchResult.noteId,
          version: prefetchResult.version,
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
    sourceFiles: CompileSourceFiles = new Map<string, string>(),
    version = 0,
    useSynchronizedEngine = false
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
      this.registerDependencies(
        noteId,
        cached.dependencies.map((dependency) => dependency.path)
      );
      this.sourceHashByNote.set(noteId, contentHash);
      return {
        type: 'rendered',
        noteId,
        version,
        cacheKey,
        artifact: cached.artifact,
        textLayer: cached.textLayer,
        outline: cached.outline,
        fromCache: true,
        inputFiles: cached.dependencies.map((dep) => ({ path: dep.path, sha256: dep.contentHash }))
      };
    }

    return this.enqueueCompile(
      noteId,
      source,
      sourceFiles,
      version,
      contentHash,
      cacheKey,
      sourceLookup,
      useSynchronizedEngine
    );
  }

  private enqueueCompile(
    noteId: string,
    source: string,
    sourceFiles: CompileSourceFiles,
    version: number,
    contentHash: string,
    cacheKey: string,
    sourceLookup: SourceLookup,
    useSynchronizedEngine: boolean
  ): Promise<CompileResult> {
    const result = this.compileQueue.then(() =>
      this.compileUncached(
        noteId,
        source,
        sourceFiles,
        version,
        contentHash,
        cacheKey,
        sourceLookup,
        useSynchronizedEngine
      )
    );
    this.compileQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private async compileUncached(
    noteId: string,
    source: string,
    sourceFiles: CompileSourceFiles,
    version: number,
    contentHash: string,
    cacheKey: string,
    sourceLookup: SourceLookup,
    useSynchronizedEngine: boolean
  ): Promise<CompileResult> {
    const output = await this.engine.compile({
      mainPath: noteId,
      source,
      ...(useSynchronizedEngine ? {} : { sourceFiles })
    });

    if (output.type === 'error') {
      return { type: 'error', noteId, version, diagnostics: output.diagnostics };
    }

    const dependencies = new Set([
      ...output.dependencies,
      ...collectStaticDependencies(noteId, sourceLookup)
    ]);
    if (this.sourceHashByNote.get(noteId) === contentHash) {
      for (const dependency of this.dependenciesByNote.get(noteId) ?? []) {
        if (sourceLookup.get(dependency) !== undefined) dependencies.add(dependency);
      }
    }

    const render = {
      artifact: output.artifact,
      textLayer: output.textLayer,
      outline: output.outline,
      dependencies: await hashDependencies([...dependencies], sourceLookup)
    };
    this.cache.put(noteId, cacheKey, render);
    this.registerDependencies(noteId, [...dependencies]);
    this.sourceHashByNote.set(noteId, contentHash);

    return {
      type: 'rendered',
      noteId,
      version,
      cacheKey,
      artifact: render.artifact,
      textLayer: render.textLayer,
      outline: render.outline,
      fromCache: false,
      inputFiles: render.dependencies.map((dep) => ({ path: dep.path, sha256: dep.contentHash }))
    };
  }

  private registerDependencies(noteId: string, dependencies: readonly string[]): void {
    const previous = this.dependenciesByNote.get(noteId);
    for (const path of previous ?? []) {
      const notes = this.notesByDependency.get(path);
      notes?.delete(noteId);
      if (notes?.size === 0) this.notesByDependency.delete(path);
    }

    const next = new Set(dependencies);
    this.dependenciesByNote.set(noteId, next);
    for (const path of next) {
      const notes = this.notesByDependency.get(path) ?? new Set<string>();
      notes.add(noteId);
      this.notesByDependency.set(path, notes);
    }
  }

  private affectedNotes(changedPaths: readonly string[]): Set<string> {
    const affected = new Set<string>();
    const pending = [...changedPaths];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const path = pending.shift()!;
      if (visited.has(path)) continue;
      visited.add(path);
      if (path.endsWith('.typ')) affected.add(path);
      for (const noteId of this.notesByDependency.get(path) ?? []) {
        if (!affected.has(noteId)) {
          affected.add(noteId);
          pending.push(noteId);
        }
      }
    }
    return affected;
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

const collectStaticDependencies = (
  noteId: string,
  sourceLookup: SourceLookup
): readonly string[] => {
  const dependencies = new Set<string>();
  const pending = [noteId];
  while (pending.length > 0) {
    const path = pending.pop()!;
    if (dependencies.has(path)) continue;
    const source = sourceLookup.get(path);
    if (source === undefined) continue;
    dependencies.add(path);
    for (const reference of parseTypstReferences(source)) {
      if (reference.kind === 'link') continue;
      const resolved = resolveTypstReferencePath(reference.rawTarget, path);
      if (!resolved) continue;
      const dependency =
        sourceLookup.get(resolved) !== undefined
          ? resolved
          : sourceLookup.get(`${resolved}.typ`) !== undefined
            ? `${resolved}.typ`
            : undefined;
      if (dependency && !dependencies.has(dependency)) pending.push(dependency);
    }
  }
  return [...dependencies];
};
