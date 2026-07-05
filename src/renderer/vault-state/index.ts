import type { NotePositionState, WriteRenderCacheRequest } from '../../shared/ipc/vault-state';
import { parseCompileResult, type CompileResult } from '../../shared/worker/typst';
import { TYPST_COMPILER_VERSION_TAG } from '../../workers/typst-compile/cache';

export const POSITION_DEBOUNCE_MS = 500;
export const WARMUP_STATUS_THROTTLE_MS = 250;

// ── Position debounce ──────────────────────────────────────────────────────────

export interface PositionDebounce {
  schedule(position: NotePositionState): void;
  flush(): Promise<void>;
  dispose(): void;
}

export const createPositionDebounce = (
  onFlush: (position: NotePositionState) => Promise<void>
): PositionDebounce => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: NotePositionState | undefined;
  let flushing: Promise<void> | undefined;

  const doFlush = async (): Promise<void> => {
    const position = pending;
    pending = undefined;
    if (!position) return;

    try {
      await onFlush(position);
    } catch (error) {
      console.debug('[vault-state] position save error:', error);
    }
  };

  return {
    schedule(position: NotePositionState): void {
      pending = position;

      if (timer !== undefined) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        timer = undefined;
        flushing = doFlush();
      }, POSITION_DEBOUNCE_MS);
    },

    async flush(): Promise<void> {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }

      if (flushing) {
        await flushing;
      }

      await doFlush();
    },

    dispose(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }

      pending = undefined;
    }
  };
};

// ── Warmup queue ───────────────────────────────────────────────────────────────

export interface WarmupStatus {
  readonly done: number;
  readonly total: number;
}

export interface WarmupQueue {
  start(noteRelPaths: readonly string[]): void;
  cancel(): void;
  dispose(): void;
}

const RENDERER_VERSION = '1';

export const buildWriteCacheRequest = (
  relPath: string,
  result: Extract<CompileResult, { type: 'rendered' }>
): WriteRenderCacheRequest => {
  const now = new Date().toISOString();
  const inputFiles = result.inputFiles.map((f) => ({ relPath: f.path, sha256: f.sha256 }));

  // Build input hash from sorted file hashes
  const sortedHashes = [...result.inputFiles]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `${f.path}:${f.sha256}`)
    .join('\n');

  const entryJson = JSON.stringify({
    schemaVersion: 1,
    cacheKey: result.cacheKey,
    relPath,
    artifact: result.artifact,
    textLayer: result.textLayer,
    outline: result.outline
  });

  const manifestEntry = {
    cacheKey: result.cacheKey,
    relPath,
    entryPath: `${result.cacheKey}.json`,
    rendererVersion: RENDERER_VERSION,
    compilerVersion: TYPST_COMPILER_VERSION_TAG,
    inputHash: sortedHashes,
    inputFiles,
    createdAt: now,
    lastUsedAt: now,
    byteSize: new TextEncoder().encode(entryJson).length
  };

  const entry = {
    schemaVersion: 1 as const,
    cacheKey: result.cacheKey,
    relPath,
    artifact: result.artifact,
    textLayer: result.textLayer,
    outline: result.outline
  };

  return { manifestEntry, entry };
};

export const createWarmupQueue = (
  onStatus: (status: WarmupStatus) => void,
  onComplete: () => void,
  getSourceFiles: () => Promise<ReadonlyMap<string, string>>
): WarmupQueue => {
  let cancelled = false;
  let worker: Worker | undefined;
  let resolveWorkerResult: ((result: CompileResult | null) => void) | undefined;

  const ensureWorker = (): Worker => {
    if (!worker) {
      worker = new Worker(new URL('../../workers/typst-compile/index.ts', import.meta.url), {
        type: 'module'
      });
      worker.addEventListener('message', (event: MessageEvent<unknown>) => {
        try {
          const result = parseCompileResult(event.data);
          resolveWorkerResult?.(result);
          resolveWorkerResult = undefined;
        } catch {
          resolveWorkerResult?.(null);
          resolveWorkerResult = undefined;
        }
      });
      worker.addEventListener('error', () => {
        resolveWorkerResult?.(null);
        resolveWorkerResult = undefined;
      });
    }

    return worker;
  };

  const compileNote = (
    relPath: string,
    source: string,
    sourceFiles: ReadonlyMap<string, string>
  ): Promise<CompileResult | null> => {
    return new Promise((resolve) => {
      resolveWorkerResult = resolve;
      ensureWorker().postMessage({ type: 'compile', noteId: relPath, source, sourceFiles });
    });
  };

  const run = async (noteRelPaths: readonly string[]): Promise<void> => {
    const total = noteRelPaths.length;
    let done = 0;

    onStatus({ done, total });

    let lastStatusAt = 0;

    for (const relPath of noteRelPaths) {
      if (cancelled) {
        break;
      }

      // Yield to main thread between notes
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      if (cancelled) {
        break;
      }

      try {
        // Check if already cached
        const cacheResponse = await window.folea.vaultState.readRenderCache({ relPath });
        if (cacheResponse.hit) {
          done++;
          const now = Date.now();
          if (now - lastStatusAt > WARMUP_STATUS_THROTTLE_MS) {
            onStatus({ done, total });
            lastStatusAt = now;
          }
          continue;
        }

        // Read source and compile
        const [source, sourceFiles] = await Promise.all([
          window.folea.vault.read({ relPath }),
          getSourceFiles()
        ]);

        if (cancelled) {
          break;
        }

        const result = await compileNote(relPath, source, sourceFiles);

        if (result && result.type === 'rendered' && !cancelled) {
          try {
            const cacheRequest = buildWriteCacheRequest(relPath, result);
            await window.folea.vaultState.writeRenderCache(cacheRequest);
          } catch (error) {
            console.debug('[warmup] cache write error:', error);
          }
        }
      } catch (error) {
        console.debug('[warmup] note error:', relPath, error);
      }

      done++;
      const now = Date.now();
      if (now - lastStatusAt > WARMUP_STATUS_THROTTLE_MS) {
        onStatus({ done, total });
        lastStatusAt = now;
      }
    }

    if (!cancelled) {
      onComplete();
    }
  };

  return {
    start(noteRelPaths: readonly string[]): void {
      cancelled = false;
      void run(noteRelPaths);
    },

    cancel(): void {
      cancelled = true;
      resolveWorkerResult?.(null);
      resolveWorkerResult = undefined;
    },

    dispose(): void {
      cancelled = true;
      resolveWorkerResult?.(null);
      resolveWorkerResult = undefined;
      worker?.terminate();
      worker = undefined;
    }
  };
};
