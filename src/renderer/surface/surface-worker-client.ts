import {
  parseTypstWorkerResult,
  type CompileRequest,
  type CompileResult,
  type CompileSourceFiles
} from '../../shared/worker/typst';

export interface SurfaceWorkerClient {
  syncSnapshot(version: number, files: CompileSourceFiles): Promise<void>;
  updateFiles(
    version: number,
    changed: CompileSourceFiles,
    deleted: readonly string[]
  ): Promise<readonly string[]>;
  registerDependencies(noteId: string, dependencies: readonly string[]): void;
  compile(noteId: string): void;
  prefetch(noteId: string): void;
  invalidate(noteId: string): void;
  dispose(): void;
}

interface SurfaceWorkerClientOptions {
  readonly createWorker: () => Worker;
  readonly onResult: (result: CompileResult) => void;
  readonly onError: (error: Error) => void;
}

export const createSurfaceWorkerClient = ({
  createWorker,
  onResult,
  onError
}: SurfaceWorkerClientOptions): SurfaceWorkerClient => {
  const worker = createWorker();
  let disposed = false;
  let sourceVersion = 0;
  const snapshotResolvers = new Map<
    number,
    { resolve: () => void; reject: (error: Error) => void }
  >();
  const updateResolvers = new Map<
    number,
    { resolve: (affected: readonly string[]) => void; reject: (error: Error) => void }
  >();

  const rejectPending = (error: Error): void => {
    for (const pending of snapshotResolvers.values()) pending.reject(error);
    for (const pending of updateResolvers.values()) pending.reject(error);
    snapshotResolvers.clear();
    updateResolvers.clear();
  };
  const fail = (value: unknown): void => {
    const error = value instanceof Error ? value : new Error('Typst worker failed');
    rejectPending(error);
    onError(error);
  };
  const onMessage = (event: MessageEvent<unknown>): void => {
    try {
      const result = parseTypstWorkerResult(event.data);
      if (result.type === 'snapshotSynced') {
        sourceVersion = result.version;
        snapshotResolvers.get(result.version)?.resolve();
        snapshotResolvers.delete(result.version);
      } else if (result.type === 'filesUpdated') {
        sourceVersion = result.version;
        updateResolvers.get(result.version)?.resolve(result.affectedNoteIds);
        updateResolvers.delete(result.version);
      } else if (result.version === sourceVersion) {
        onResult(result);
      }
    } catch (error) {
      fail(error);
    }
  };
  const onWorkerError = (event: ErrorEvent): void => fail(event.error ?? new Error(event.message));
  worker.addEventListener('message', onMessage);
  worker.addEventListener('error', onWorkerError);

  const post = (request: CompileRequest): void => {
    if (!disposed) worker.postMessage(request);
  };

  return {
    syncSnapshot(version, files): Promise<void> {
      if (disposed) return Promise.reject(new Error('Surface worker is disposed'));
      return new Promise((resolve, reject) => {
        snapshotResolvers.set(version, { resolve, reject });
        post({ type: 'syncSnapshot', version, files });
      });
    },
    updateFiles(version, changed, deleted): Promise<readonly string[]> {
      if (disposed) return Promise.reject(new Error('Surface worker is disposed'));
      return new Promise((resolve, reject) => {
        updateResolvers.set(version, { resolve, reject });
        post({ type: 'updateFiles', version, changed, deleted });
      });
    },
    registerDependencies: (noteId, dependencies) =>
      post({ type: 'registerDependencies', noteId, dependencies }),
    compile: (noteId) => post({ type: 'compile', noteId, version: sourceVersion }),
    prefetch: (noteId) => post({ type: 'prefetch', noteId, version: sourceVersion }),
    invalidate: (noteId) => post({ type: 'invalidate', noteId }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      rejectPending(new Error('Surface worker is disposed'));
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onWorkerError);
      worker.terminate();
    }
  };
};
