import type { NoteMeta, VaultChange } from '../../../shared/ipc/vault';
import type { CompileSourceFiles } from '../../../shared/worker/typst';
import type { SurfaceController } from '../../surface';

interface SourceSyncOptions {
  readonly getSurface: () => SurfaceController | undefined;
  readonly getNotes: () => readonly NoteMeta[];
  readonly getSelectedRelPath: () => string;
  readonly refreshStructural: () => Promise<void>;
  readonly selectFallbackAfterDelete: () => Promise<void>;
  readonly setCurrentSource: (source: string) => void;
  readonly updateLinks: (
    events: readonly VaultChange[],
    changed: ReadonlyMap<string, string>
  ) => Promise<void>;
}

export interface SourceSyncController {
  readSourceFiles(): Promise<CompileSourceFiles>;
  syncSnapshot(): Promise<{ readonly version: number; readonly files: CompileSourceFiles }>;
  schedule(event: VaultChange): void;
  clear(): void;
  dispose(): void;
}

export const createSourceSyncController = (options: SourceSyncOptions): SourceSyncController => {
  let files: Map<string, string> | undefined;
  let version = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tail = Promise.resolve();
  const pending = new Map<string, VaultChange>();

  const readSourceFiles = async (): Promise<CompileSourceFiles> => {
    if (files) return files;
    try {
      files = new Map(
        (await window.folea.vault.renderFiles()).map((file) => [file.relPath, file.contents])
      );
      return files;
    } catch (error) {
      console.debug('Unable to read Typst render dependency snapshot', error);
      return new Map<string, string>();
    }
  };

  const applyBatch = async (events: readonly VaultChange[]): Promise<void> => {
    if (!files || events.some((event) => event.kind === 'structural')) {
      await options.refreshStructural();
      return;
    }
    const changed = new Map<string, string>();
    const deleted: string[] = [];
    for (const event of events) {
      if (event.kind === 'deleted') deleted.push(event.relPath);
      else if (event.kind === 'created' || event.kind === 'changed') {
        try {
          changed.set(
            event.note.relPath,
            await window.folea.vault.read({ relPath: event.note.relPath })
          );
        } catch (error) {
          console.debug(`Unable to read changed Typst source ${event.note.relPath}`, error);
          deleted.push(event.note.relPath);
        }
      }
    }
    for (const [path, source] of changed) files.set(path, source);
    for (const path of deleted) files.delete(path);
    const nextVersion = ++version;
    const surface = options.getSurface();
    const affected =
      (await surface?.updateFiles(nextVersion, changed, deleted)) ?? ([] as readonly string[]);
    window.dispatchEvent(
      new CustomEvent('folea:source-synced', {
        detail: {
          kind: 'delta',
          version: nextVersion,
          changedCount: changed.size,
          deletedCount: deleted.length,
          totalFileCount: files.size,
          affectedNoteIds: affected
        }
      })
    );
    const current = options.getSelectedRelPath();
    const currentSource = changed.get(current);
    if (currentSource !== undefined) {
      options.setCurrentSource(currentSource);
      surface?.rerender(current);
    } else if (deleted.includes(current)) {
      await options.selectFallbackAfterDelete();
    } else if (affected.includes(current)) {
      surface?.rerender(current);
    }
    const available = new Set(options.getNotes().map((note) => note.relPath));
    surface?.recompile(affected.filter((note) => note !== current && available.has(note)));
    await options.updateLinks(events, changed);
  };

  return {
    readSourceFiles,
    async syncSnapshot() {
      files = undefined;
      const snapshot = await readSourceFiles();
      const nextVersion = ++version;
      await options.getSurface()?.syncSnapshot(nextVersion, snapshot);
      window.dispatchEvent(
        new CustomEvent('folea:source-synced', {
          detail: {
            kind: 'snapshot',
            version: nextVersion,
            changedCount: snapshot.size,
            deletedCount: 0,
            totalFileCount: snapshot.size
          }
        })
      );
      return { version: nextVersion, files: snapshot };
    },
    schedule(event): void {
      const path =
        event.kind === 'structural' || event.kind === 'deleted'
          ? event.relPath
          : event.note.relPath;
      pending.set(path, event);
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        const events = [...pending.values()];
        pending.clear();
        tail = tail
          .then(() => applyBatch(events))
          .catch((error) => console.debug('Unable to apply Typst source delta', error));
      }, 80);
    },
    clear(): void {
      files = undefined;
      pending.clear();
    },
    dispose(): void {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      pending.clear();
    }
  };
};
