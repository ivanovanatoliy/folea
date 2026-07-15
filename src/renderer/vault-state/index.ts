import type { NotePositionState, WriteRenderCacheRequest } from '../../shared/ipc/vault-state';
import {
  parseTypstWorkerResult,
  type CompileResult,
  type CompileSourceFiles,
  type TypstWorkerResult
} from '../../shared/worker/typst';
import { TYPST_COMPILER_VERSION_TAG } from '../../workers/typst-compile/cache';
import { createTypstWorker } from '../shared/create-typst-worker';

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
  start(version: number, sourceFiles: CompileSourceFiles, noteRelPaths: readonly string[]): void;
  cancel(): void;
  dispose(): void;
}

interface WarmupQueueOptions {
  readonly createWorker?: () => Worker;
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
  onDependencies: (noteId: string, dependencies: readonly string[]) => void,
  options: WarmupQueueOptions = {}
): WarmupQueue => {
  let cancelled = false;
  let worker: Worker | undefined;
  let resolveWorkerResult: ((result: TypstWorkerResult | null) => void) | undefined;

  const ensureWorker = (): Worker => {
    if (!worker) {
      worker = (options.createWorker ?? createTypstWorker)();
      worker.addEventListener('message', (event: MessageEvent<unknown>) => {
        try {
          const result = parseTypstWorkerResult(event.data);
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

  const request = (value: unknown): Promise<TypstWorkerResult | null> => {
    return new Promise((resolve) => {
      resolveWorkerResult = resolve;
      ensureWorker().postMessage(value);
    });
  };

  const stopWorker = (): void => {
    worker?.terminate();
    worker = undefined;
  };

  const run = async (
    version: number,
    sourceFiles: CompileSourceFiles,
    noteRelPaths: readonly string[]
  ): Promise<void> => {
    const total = noteRelPaths.length;
    let done = 0;

    onStatus({ done, total });

    const syncResult = await request({ type: 'syncSnapshot', version, files: sourceFiles });
    if (syncResult?.type !== 'snapshotSynced' || syncResult.version !== version || cancelled) {
      stopWorker();
      return;
    }

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
          onDependencies(
            relPath,
            cacheResponse.inputFiles.map((input) => input.relPath)
          );
          done++;
          const now = Date.now();
          if (now - lastStatusAt > WARMUP_STATUS_THROTTLE_MS) {
            onStatus({ done, total });
            lastStatusAt = now;
          }
          continue;
        }

        const result = await request({ type: 'compile', noteId: relPath, version });

        if (result && result.type === 'rendered' && !cancelled) {
          onDependencies(
            relPath,
            result.inputFiles.map((input) => input.path)
          );
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
    stopWorker();
  };

  return {
    start(version: number, sourceFiles: CompileSourceFiles, noteRelPaths: readonly string[]): void {
      stopWorker();
      cancelled = false;
      void run(version, sourceFiles, noteRelPaths);
    },

    cancel(): void {
      cancelled = true;
      resolveWorkerResult?.(null);
      resolveWorkerResult = undefined;
      stopWorker();
    },

    dispose(): void {
      cancelled = true;
      resolveWorkerResult?.(null);
      resolveWorkerResult = undefined;
      stopWorker();
    }
  };
};
