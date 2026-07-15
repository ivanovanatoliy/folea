import {
  type OutlineEntry,
  type CompileResult,
  type CompileSourceFiles,
  type Diagnostic
} from '../../shared/worker/typst';
import type { RenderCacheEntryV1 } from '../../shared/ipc/vault-state';
import type { CaretEngine } from './caret';
import { createCaretEngine } from './caret';
import type { ZoomState } from './zoom';
import { createZoomController } from './zoom';
import { createTypstWorker } from '../shared/create-typst-worker';
import { createSurfaceSearch } from './surface-search';
import { createSurfaceScroll, type SurfacePageStatus } from './surface-scroll';
import { installSurfaceLinkInterceptor } from './surface-links';
import { createSurfaceWorkerClient } from './surface-worker-client';
import {
  createErrorDocument,
  createRenderedDocument,
  getDomContentBounds,
  getRestoredRerenderScrollTop,
  getScrollTopForChangedTarget
} from './surface-renderer';
export type { SurfaceLinkClickDetail } from './surface-links';
export { getRestoredRerenderScrollTop, getScrollTopForChangedTarget } from './surface-renderer';
export type { ChangedTargetRevealInput, RestoredRerenderScrollInput } from './surface-renderer';

export interface SurfaceRenderedDetail {
  readonly noteId: string;
  readonly cacheKey: string;
  readonly fromCache: boolean;
  readonly durationMs: number;
}

export interface SurfaceErrorDetail {
  readonly noteId: string;
  readonly diagnostics: readonly Diagnostic[];
}

export interface SurfacePrefetchedDetail {
  readonly noteId: string;
  readonly cacheKey: string;
  readonly fromCache: boolean;
}

export type SurfacePageStatusDetail = SurfacePageStatus;

export interface SurfaceCacheWriteDetail {
  readonly noteId: string;
  readonly result: Extract<CompileResult, { type: 'rendered' }>;
}

export interface SurfaceSearchTarget {
  readonly query: string;
  readonly line?: number;
  readonly preview?: string;
  readonly previewOccurrence?: number;
  readonly queryOccurrence?: number;
}

export interface SurfaceController {
  syncSnapshot(version: number, sourceFiles: CompileSourceFiles): Promise<void>;
  updateFiles(
    version: number,
    changed: CompileSourceFiles,
    deleted: readonly string[]
  ): Promise<readonly string[]>;
  registerDependencies(noteId: string, dependencies: readonly string[]): void;
  recompile(noteIds: readonly string[]): void;
  render(noteId: string): void;
  renderFromCache(noteId: string, cacheKey: string, entry: RenderCacheEntryV1): boolean;
  rerender(noteId: string): void;
  prefetch(noteId: string): void;
  invalidate(noteId: string): void;
  getOutline(): readonly OutlineEntry[];
  getTextLayer(): import('../../shared/worker/typst').TextLayerModel | undefined;
  revealSearchTarget(target: SurfaceSearchTarget): boolean;
  clearSearchHighlight(): void;
  setLastSearchQuery(query: string): void;
  nextMatch(): boolean;
  prevMatch(): boolean;
  showError(diagnostics: readonly Diagnostic[], noteId?: string): void;
  clear(): void;
  dispose(): void;
  scrollByLines(n: number): void;
  scrollByViewport(fraction: number): void;
  scrollToStart(): void;
  scrollToEnd(): void;
  scrollToOffset(y: number): void;
  scrollLeft(): void;
  scrollRight(): void;
  zoomIn(): void;
  zoomOut(): void;
  fitWidth(): void;
  fitContentWidth(): void;
  fitPage(): void;
  getZoomState(): ZoomState;
  setZoomState(state: ZoomState): void;
  getCaretEngine(): CaretEngine;
}

interface SurfaceOptions {
  readonly createWorker?: () => Worker;
}

const createDefaultWorker = createTypstWorker;

export const createSurface = (
  container: HTMLElement,
  options: SurfaceOptions = {}
): SurfaceController => {
  let controller!: SurfaceController;
  const zoomController = createZoomController(container);
  const caretEngine = createCaretEngine(
    container,
    (y: number) => controller.scrollToOffset(y),
    (target) => controller.revealSearchTarget(target)
  );
  let latestNoteId: string | undefined;
  let latestStartedAt = 0;
  let disposed = false;
  let latestOutline: readonly OutlineEntry[] = [];
  let latestTextLayer: import('../../shared/worker/typst').TextLayerModel | undefined;
  let rerenderSnapshot: string[] | null = null;

  const setState = (state: string): void => {
    container.dataset.state = state;
  };

  const emitRendered = (detail: SurfaceRenderedDetail): void => {
    window.dispatchEvent(
      new CustomEvent<SurfaceRenderedDetail>('folea:surface-rendered', { detail })
    );
  };

  const emitError = (detail: SurfaceErrorDetail): void => {
    window.dispatchEvent(new CustomEvent<SurfaceErrorDetail>('folea:surface-error', { detail }));
  };

  const emitPrefetched = (detail: SurfacePrefetchedDetail): void => {
    window.dispatchEvent(
      new CustomEvent<SurfacePrefetchedDetail>('folea:surface-prefetched', { detail })
    );
  };

  const scroll = createSurfaceScroll(container);
  const search = createSurfaceSearch(container, scroll.emitStatus);

  const getTextLayer = (): import('../../shared/worker/typst').TextLayerModel | undefined =>
    latestTextLayer;

  const paintRendered = (result: Extract<CompileResult, { type: 'rendered' }>): void => {
    const durationMs = performance.now() - latestStartedAt;

    // Preserve proportional scroll position when re-rendering content that was
    // already visible (i.e. a save-triggered rerender, not a navigation render).
    // Navigation renders set state to 'loading' first, so wasRendered is false.
    const wasRendered = container.dataset.state === 'rendered';
    const prevScrollTop = wasRendered ? container.scrollTop : 0;
    const prevScrollHeight = wasRendered ? container.scrollHeight : 0;

    const { documentNode, svgElement } = createRenderedDocument(result.artifact);
    container.replaceChildren(documentNode);
    search.rebuildIndex();
    container.dataset.cacheKey = result.cacheKey;
    container.dataset.fromCache = String(result.fromCache);
    container.dataset.durationMs = String(durationMs);
    latestOutline = result.outline;
    latestTextLayer = result.textLayer;
    caretEngine.setTextLayer(result.textLayer, container, latestNoteId);
    search.clearHighlight();
    zoomController.setArtifact(
      documentNode,
      svgElement,
      result.artifact.width,
      result.artifact.height,
      result.textLayer.pages.length,
      getDomContentBounds(documentNode)
    );

    const snapshot = rerenderSnapshot;
    rerenderSnapshot = null;
    const restoredScrollTop = getRestoredRerenderScrollTop({
      previousScrollTop: prevScrollTop,
      previousScrollHeight: prevScrollHeight,
      nextScrollHeight: container.scrollHeight
    });

    if (snapshot !== null) {
      // Find the first text span that differs from the pre-save snapshot and
      // reveal it only if it is outside the currently visible viewport.
      if (restoredScrollTop !== null) {
        container.scrollTop = restoredScrollTop;
      }

      const newTsels = [...container.querySelectorAll<HTMLElement>('.typst-document .tsel')];
      let changeEl: HTMLElement | undefined;
      const limit = Math.max(snapshot.length, newTsels.length);
      for (let i = 0; i < limit; i++) {
        const oldText = snapshot[i] ?? '';
        const el = newTsels[i];
        if (!el || el.textContent !== oldText) {
          changeEl = el ?? newTsels[newTsels.length - 1];
          break;
        }
      }

      if (changeEl) {
        const containerRect = container.getBoundingClientRect();
        const elRect = changeEl.getBoundingClientRect();
        const scrollTop = getScrollTopForChangedTarget({
          viewportTop: containerRect.top,
          viewportHeight: container.clientHeight,
          currentScrollTop: container.scrollTop,
          targetTop: elRect.top,
          targetBottom: elRect.bottom
        });
        if (scrollTop !== null) {
          container.scrollTop = scrollTop;
        }
      } else if (restoredScrollTop !== null) {
        container.scrollTop = restoredScrollTop;
      }
    } else if (restoredScrollTop !== null) {
      container.scrollTop = restoredScrollTop;
    }

    setState('rendered');
    scroll.emitStatus();

    emitRendered({
      noteId: result.noteId,
      cacheKey: result.cacheKey,
      fromCache: result.fromCache,
      durationMs
    });
  };

  const showError = (diagnostics: readonly Diagnostic[], noteId = latestNoteId): void => {
    const renderedDiagnostics =
      diagnostics.length > 0
        ? diagnostics
        : [{ severity: 'error' as const, message: 'Unknown Typst compile error' }];
    container.replaceChildren(createErrorDocument(renderedDiagnostics));
    search.clearIndex();
    latestOutline = [];
    latestTextLayer = undefined;
    container.dataset.fromCache = 'false';
    container.dataset.durationMs = String(performance.now() - latestStartedAt);
    delete container.dataset.cacheKey;
    setState('error');
    scroll.emitStatus();

    if (noteId) {
      emitError({ noteId, diagnostics: renderedDiagnostics });
    }
  };

  const onWorkerResult = (result: CompileResult): void => {
    if (result.type === 'prefetched') {
      emitPrefetched({
        noteId: result.noteId,
        cacheKey: result.cacheKey,
        fromCache: result.fromCache
      });
      return;
    }

    if (result.type === 'rendered' && !result.fromCache) {
      window.dispatchEvent(
        new CustomEvent<SurfaceCacheWriteDetail>('folea:surface-cache-write', {
          detail: { noteId: result.noteId, result }
        })
      );
    }

    if (result.noteId !== latestNoteId) {
      return;
    }

    if (result.type === 'error') {
      // During a save-triggered rerender, suppress errors so the last good
      // render stays on screen while the user is mid-edit.
      // rerenderSnapshot is non-null only when rerender() started this compile.
      if (rerenderSnapshot !== null) {
        rerenderSnapshot = null;
        return;
      }
      showError(result.diagnostics, result.noteId);
      return;
    }

    try {
      paintRendered(result);
    } catch (error) {
      showError(
        [
          {
            severity: 'error',
            message: error instanceof Error ? error.message : 'Typst renderer returned invalid SVG'
          }
        ],
        result.noteId
      );
    }
  };

  const workerClient = createSurfaceWorkerClient({
    createWorker: options.createWorker ?? createDefaultWorker,
    onResult: onWorkerResult,
    onError: (error) =>
      showError([{ severity: 'error', message: `Typst worker error: ${error.message}` }])
  });

  const removeLinkInterceptor = installSurfaceLinkInterceptor(container, () => latestNoteId);

  container.addEventListener('scroll', scroll.emitStatus);
  const handleResize = (): void => {
    scroll.emitStatus();
    zoomController.reapply();
  };
  const handleZoomChanged = (): void => search.reapplyHighlight();
  window.addEventListener('resize', handleResize);
  window.addEventListener('folea:zoom-changed', handleZoomChanged);

  controller = {
    syncSnapshot(version: number, sourceFiles: CompileSourceFiles): Promise<void> {
      return workerClient.syncSnapshot(version, sourceFiles);
    },

    updateFiles(
      version: number,
      changed: CompileSourceFiles,
      deleted: readonly string[]
    ): Promise<readonly string[]> {
      return workerClient.updateFiles(version, changed, deleted);
    },

    registerDependencies(noteId: string, dependencies: readonly string[]): void {
      if (!disposed) workerClient.registerDependencies(noteId, dependencies);
    },

    recompile(noteIds: readonly string[]): void {
      if (disposed) return;
      for (const noteId of noteIds) workerClient.compile(noteId);
    },

    render(noteId: string): void {
      if (disposed) {
        return;
      }

      latestNoteId = noteId;
      latestStartedAt = performance.now();
      rerenderSnapshot = null;
      setState('loading');
      scroll.emitStatus();
      workerClient.compile(noteId);
    },

    renderFromCache(noteId: string, cacheKey: string, entry: RenderCacheEntryV1): boolean {
      if (disposed) return false;

      try {
        const { documentNode, svgElement } = createRenderedDocument(entry.artifact);

        latestNoteId = noteId;
        latestStartedAt = performance.now();
        rerenderSnapshot = null;
        container.replaceChildren(documentNode);
        search.rebuildIndex();
        container.dataset.cacheKey = cacheKey;
        container.dataset.fromCache = 'true';
        container.dataset.durationMs = '0';
        latestOutline = entry.outline;
        latestTextLayer = entry.textLayer;
        caretEngine.setTextLayer(entry.textLayer, container, noteId);
        search.clearHighlight();
        zoomController.setArtifact(
          documentNode,
          svgElement,
          entry.artifact.width,
          entry.artifact.height,
          entry.textLayer.pages.length,
          getDomContentBounds(documentNode)
        );
        setState('rendered');
        scroll.emitStatus();
        emitRendered({
          noteId,
          cacheKey,
          fromCache: true,
          durationMs: performance.now() - latestStartedAt
        });
        return true;
      } catch {
        return false;
      }
    },

    rerender(noteId: string): void {
      if (disposed) return;

      latestNoteId = noteId;
      latestStartedAt = performance.now();
      // Snapshot text spans for change-location detection in paintRendered().
      rerenderSnapshot = search.snapshotText();
      // No loading state, no content replacement — existing render stays visible
      // until paintRendered() swaps in the new result.
      workerClient.compile(noteId);
    },

    prefetch(noteId: string): void {
      if (!disposed) {
        workerClient.prefetch(noteId);
      }
    },

    invalidate(noteId: string): void {
      if (!disposed) {
        workerClient.invalidate(noteId);
      }
    },

    getOutline(): readonly OutlineEntry[] {
      return latestOutline;
    },

    getTextLayer(): import('../../shared/worker/typst').TextLayerModel | undefined {
      return getTextLayer();
    },

    revealSearchTarget(target: SurfaceSearchTarget): boolean {
      return search.revealTarget(target);
    },

    clearSearchHighlight: search.clearHighlight,

    setLastSearchQuery(query: string): void {
      search.setQuery(query);
    },

    nextMatch(): boolean {
      return search.nextMatch();
    },

    prevMatch(): boolean {
      return search.prevMatch();
    },

    showError,

    clear(): void {
      latestNoteId = undefined;
      latestOutline = [];
      latestTextLayer = undefined;
      caretEngine.dispose();
      search.clearIndex();
      container.replaceChildren();
      container.dataset.fromCache = 'false';
      delete container.dataset.durationMs;
      delete container.dataset.cacheKey;
      setState('empty');
      scroll.emitStatus();
    },

    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      workerClient.dispose();
      scroll.dispose();
      caretEngine.dispose();
      container.removeEventListener('scroll', scroll.emitStatus);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('folea:zoom-changed', handleZoomChanged);
      removeLinkInterceptor();
      container.replaceChildren();
    },

    scrollByLines(n: number): void {
      scroll.byLines(n);
    },

    scrollByViewport(fraction: number): void {
      scroll.byViewport(fraction);
    },

    scrollToStart(): void {
      scroll.toStart();
    },

    scrollToEnd(): void {
      scroll.toEnd();
    },

    scrollToOffset(y: number): void {
      scroll.toOffset(y);
    },

    scrollLeft(): void {
      scroll.left();
    },

    scrollRight(): void {
      scroll.right();
    },

    zoomIn(): void {
      zoomController.zoomIn();
    },

    zoomOut(): void {
      zoomController.zoomOut();
    },

    fitWidth(): void {
      zoomController.fitWidth();
    },

    fitContentWidth(): void {
      zoomController.fitContentWidth();
    },

    fitPage(): void {
      zoomController.fitPage();
    },

    getZoomState(): ZoomState {
      return zoomController.getState();
    },

    setZoomState(state: ZoomState): void {
      zoomController.setState(state);
    },

    getCaretEngine(): CaretEngine {
      return caretEngine;
    }
  };

  controller.clear();
  return controller;
};
