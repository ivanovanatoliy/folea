import type { NoteMeta, VaultChange } from '../../../shared/ipc/vault';
import type { CompileSourceFiles } from '../../../shared/worker/typst';
import {
  createLinkGraphIndex,
  resolveNoteHref,
  type LinkGraph,
  type LinkGraphIndex
} from '../../nav/link-graph';

interface LinkControllerOptions {
  readonly getNotes: () => readonly NoteMeta[];
  readonly readSourceFiles: () => Promise<CompileSourceFiles>;
  readonly setGraph: (graph: LinkGraph | null) => void;
}

export interface LinkController {
  rebuild(): Promise<void>;
  updateFromDeltas(
    events: readonly VaultChange[],
    changed: ReadonlyMap<string, string>
  ): Promise<void>;
  resolveHref(rawHref: string, fromRelPath: string): string | null;
  clear(): void;
}

export const createLinkController = (options: LinkControllerOptions): LinkController => {
  let index: LinkGraphIndex | undefined;
  const emitBuilt = (startedAt: number, mode: 'full' | 'incremental'): void => {
    window.dispatchEvent(
      new CustomEvent('folea:graph-built', {
        detail: {
          durationMs: performance.now() - startedAt,
          noteCount: options.getNotes().length,
          mode
        }
      })
    );
  };

  const rebuild = async (): Promise<void> => {
    try {
      const files = await options.readSourceFiles();
      const startedAt = performance.now();
      index = createLinkGraphIndex(files, options.getNotes());
      options.setGraph(index.snapshot());
      emitBuilt(startedAt, 'full');
    } catch (error) {
      console.debug('Unable to rebuild the Typst link graph', error);
    }
  };

  return {
    rebuild,
    async updateFromDeltas(events, changed): Promise<void> {
      if (!index || events.some((event) => event.kind !== 'changed')) {
        await rebuild();
        return;
      }
      const startedAt = performance.now();
      for (const [relPath, source] of changed) index.updateSource(relPath, source);
      options.setGraph(index.snapshot());
      emitBuilt(startedAt, 'incremental');
    },
    resolveHref(rawHref, fromRelPath): string | null {
      return resolveNoteHref(
        rawHref,
        fromRelPath,
        new Set(options.getNotes().map((note) => note.relPath))
      );
    },
    clear(): void {
      index = undefined;
      options.setGraph(null);
    }
  };
};
