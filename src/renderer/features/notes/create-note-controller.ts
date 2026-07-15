import type { Accessor, Setter } from 'solid-js';

import type { NoteMeta } from '../../../shared/ipc/vault';
import type {
  NotePositionState,
  NoteZoomMode,
  RecentNoteEntry,
  VaultStateFileV1
} from '../../../shared/ipc/vault-state';
import type { CompileResult } from '../../../shared/worker/typst';
import type { SurfaceController } from '../../surface';
import type { ZoomState } from '../../surface/zoom';
import { buildWriteCacheRequest, createPositionDebounce } from '../../vault-state';

const PREFETCH_DEBOUNCE_MS = 120;

interface PendingZoomRestore {
  readonly relPath: string;
  readonly state: ZoomState;
}

interface NoteControllerOptions {
  readonly notes: Accessor<readonly NoteMeta[]>;
  readonly selectedRelPath: Accessor<string>;
  readonly setSelectedRelPath: Setter<string>;
  readonly setCurrentSource: Setter<string>;
  readonly setRecentNotes: Setter<readonly RecentNoteEntry[]>;
  readonly getSurface: () => SurfaceController | undefined;
  readonly getSurfaceElement: () => HTMLElement | undefined;
  readonly setPendingZoomRestore: (value: PendingZoomRestore | undefined) => void;
  readonly setPendingPositionRestore: (value: NotePositionState | undefined) => void;
  readonly clearOutline: () => void;
  readonly loadVaultState: () => Promise<VaultStateFileV1>;
  readonly showError: (message: string) => void;
}

export interface NoteController {
  beginNavigation(): number;
  isCurrent(generation: number): boolean;
  openWithState(relPath: string, generation: number, state?: VaultStateFileV1): Promise<void>;
  renderSelected(generation: number, notes?: readonly NoteMeta[]): Promise<void>;
  select(relPath: string): Promise<void>;
  open(relPath: string): void;
  savePosition(): void;
  flushPosition(): Promise<void>;
  clearPrefetch(): void;
  schedulePrefetch(relPath: string): void;
  persistRenderCache(
    relPath: string,
    result: Extract<CompileResult, { type: 'rendered' }>
  ): Promise<void>;
  reset(): void;
}

export const createNoteController = (options: NoteControllerOptions): NoteController => {
  let generation = 0;
  let prefetchTimer: ReturnType<typeof setTimeout> | undefined;
  let prefetchInFlight = false;
  let queuedPrefetchRelPath: string | undefined;

  const capturePosition = (): NotePositionState | undefined => {
    const relPath = options.selectedRelPath();
    const surface = options.getSurface();
    const element = options.getSurfaceElement();
    if (!relPath || !surface || !element) return undefined;
    const zoom = surface.getZoomState();
    const state: NotePositionState = {
      relPath,
      scrollTop: element.scrollTop,
      scrollLeft: element.scrollLeft,
      viewportHeight: element.clientHeight,
      contentHeight: element.scrollHeight,
      scrollRatio:
        element.scrollHeight > element.clientHeight
          ? Math.min(1, element.scrollTop / (element.scrollHeight - element.clientHeight))
          : 0,
      zoomMode: zoom.mode as NoteZoomMode,
      zoomLevel: zoom.level,
      caretSpanIndex: null,
      updatedAt: new Date().toISOString()
    };
    return state;
  };
  const positionDebounce = createPositionDebounce(async (position) => {
    await window.folea.vaultState.update({ type: 'positionChanged', position });
  });

  const savePosition = (): void => {
    const position = capturePosition();
    if (position) positionDebounce.schedule(position);
  };
  const flushPosition = async (): Promise<void> => {
    const position = capturePosition();
    if (!position) return;
    try {
      await window.folea.vaultState.update({ type: 'positionChanged', position });
    } catch {
      // The vault may already be closed.
    }
  };
  const tryPersistentCache = async (relPath: string, current: number): Promise<boolean> => {
    try {
      const response = await window.folea.vaultState.readRenderCache({ relPath });
      if (current !== generation || !response.hit) return false;
      options.getSurface()?.registerDependencies(
        relPath,
        response.inputFiles.map((input) => input.relPath)
      );
      return (
        options.getSurface()?.renderFromCache(relPath, response.cacheKey, response.entry) ?? false
      );
    } catch {
      return false;
    }
  };
  const openWithState = async (
    relPath: string,
    current: number,
    state?: VaultStateFileV1
  ): Promise<void> => {
    await flushPosition();
    if (current !== generation) return;
    positionDebounce.dispose();
    const vaultState = state ?? (await options.loadVaultState());
    if (current !== generation) return;
    const position = vaultState.notePositions[relPath];
    options.setPendingZoomRestore({
      relPath,
      state: position
        ? { mode: position.zoomMode, level: position.zoomLevel }
        : { mode: 'fitWidth', level: 1 }
    });
    options.setSelectedRelPath(relPath);
    options.setCurrentSource('');
    options.clearOutline();
    options.setPendingPositionRestore(position);
    const metadata = options.notes().find((note) => note.relPath === relPath);
    try {
      const updated = await window.folea.vaultState.update({
        type: 'noteOpened',
        relPath,
        title: metadata?.title ?? relPath,
        openedAt: new Date().toISOString()
      });
      if (current === generation) options.setRecentNotes(updated.recentNotes);
    } catch {
      // The vault may not be ready yet.
    }
    if (current !== generation) return;
    const cacheHit = await tryPersistentCache(relPath, current);
    if (current !== generation) return;
    try {
      const source = await window.folea.vault.read({ relPath });
      if (current !== generation || options.selectedRelPath() !== relPath) return;
      options.setCurrentSource(source);
      if (!cacheHit) options.getSurface()?.render(relPath);
    } catch {
      if (current === generation && !cacheHit) options.showError('Unable to read selected note');
    }
  };
  const renderSelected = async (
    current: number,
    availableNotes = options.notes()
  ): Promise<void> => {
    const currentPath = options.selectedRelPath();
    const nextPath = availableNotes.some((note) => note.relPath === currentPath)
      ? currentPath
      : (availableNotes[0]?.relPath ?? '');
    options.setSelectedRelPath(nextPath);
    options.setCurrentSource('');
    options.clearOutline();
    if (!nextPath) {
      options.getSurface()?.clear();
      return;
    }
    const source = await window.folea.vault.read({ relPath: nextPath });
    if (current !== generation || options.selectedRelPath() !== nextPath) return;
    options.getSurface()?.render(nextPath);
    options.setCurrentSource(source);
  };
  const select = async (relPath: string): Promise<void> => {
    const current = ++generation;
    if (!options.notes().some((note) => note.relPath === relPath)) {
      await renderSelected(current);
      return;
    }
    await openWithState(relPath, current);
  };
  const clearPrefetch = (): void => {
    if (prefetchTimer !== undefined) clearTimeout(prefetchTimer);
    prefetchTimer = undefined;
  };
  const runPrefetch = async (relPath: string): Promise<void> => {
    if (prefetchInFlight) {
      queuedPrefetchRelPath = relPath;
      return;
    }
    prefetchInFlight = true;
    try {
      if (options.selectedRelPath() !== relPath) options.getSurface()?.prefetch(relPath);
    } catch (error) {
      console.debug('Unable to prefetch highlighted note', error);
    } finally {
      prefetchInFlight = false;
      const next = queuedPrefetchRelPath;
      queuedPrefetchRelPath = undefined;
      if (next !== undefined && next !== relPath) void runPrefetch(next);
    }
  };

  return {
    beginNavigation: () => ++generation,
    isCurrent: (candidate) => candidate === generation,
    openWithState,
    renderSelected,
    select,
    open(relPath): void {
      void select(relPath);
    },
    savePosition,
    flushPosition,
    clearPrefetch,
    schedulePrefetch(relPath): void {
      clearPrefetch();
      prefetchTimer = setTimeout(() => {
        prefetchTimer = undefined;
        void runPrefetch(relPath);
      }, PREFETCH_DEBOUNCE_MS);
    },
    async persistRenderCache(relPath, result): Promise<void> {
      if (result.fromCache || result.inputFiles.length === 0) return;
      try {
        await window.folea.vaultState.writeRenderCache(buildWriteCacheRequest(relPath, result));
      } catch (error) {
        console.debug('Unable to persist render cache', error);
      }
    },
    reset(): void {
      clearPrefetch();
      positionDebounce.dispose();
    }
  };
};
