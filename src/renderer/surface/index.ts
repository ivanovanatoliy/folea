import {
  type OutlineEntry,
  parseTypstWorkerResult,
  type CompileRequest,
  type CompileResult,
  type CompileSourceFiles,
  type Diagnostic
} from '../../shared/worker/typst';
import type { RenderCacheEntryV1 } from '../../shared/ipc/vault-state';
import type { CaretEngine, LinkTarget } from './caret';
import { createCaretEngine } from './caret';
import type { ContentBounds, ZoomState } from './zoom';
import { createZoomController } from './zoom';
import { createTypstWorker } from '../shared/create-typst-worker';

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

export interface SurfacePageStatusDetail {
  readonly current: number;
  readonly total: number;
}

export interface SurfaceLinkClickDetail {
  readonly target: LinkTarget;
}

export interface SurfaceCacheWriteDetail {
  readonly noteId: string;
  readonly result: Extract<CompileResult, { type: 'rendered' }>;
}

export interface SurfaceSearchTarget {
  readonly query: string;
  readonly line?: number;
  readonly preview?: string;
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

const LINE_SCROLL_PX = 40;
const HORIZONTAL_SCROLL_PX = 80;

interface SurfaceOptions {
  readonly createWorker?: () => Worker;
}

const createDefaultWorker = createTypstWorker;

export const createSurface = (
  container: HTMLElement,
  options: SurfaceOptions = {}
): SurfaceController => {
  const worker = (options.createWorker ?? createDefaultWorker)();
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
  let lastSearchQuery: string | undefined;
  let lastSearchIndex = -1;
  let searchHighlight: HTMLDivElement | undefined;
  let rerenderSnapshot: string[] | null = null;
  let textLayerTsels: readonly HTMLElement[] = [];
  let pageStatusFrame: number | undefined;
  let sourceVersion = 0;
  const snapshotResolvers = new Map<
    number,
    { resolve: () => void; reject: (error: Error) => void }
  >();
  const updateResolvers = new Map<
    number,
    { resolve: (affected: readonly string[]) => void; reject: (error: Error) => void }
  >();

  const post = (request: CompileRequest): void => {
    worker.postMessage(request);
  };

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

  const getPageStatus = (): SurfacePageStatusDetail => {
    if (container.clientHeight <= 0 || container.scrollHeight <= 0) {
      return { current: 0, total: 0 };
    }

    const total = Math.max(1, Math.ceil(container.scrollHeight / container.clientHeight));
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const current =
      maxScrollTop === 0
        ? 1
        : Math.min(
            total,
            Math.max(1, Math.round((container.scrollTop / maxScrollTop) * (total - 1)) + 1)
          );

    return { current, total };
  };

  const emitPageStatus = (): void => {
    if (pageStatusFrame !== undefined) return;
    pageStatusFrame = requestAnimationFrame(() => {
      pageStatusFrame = undefined;
      window.dispatchEvent(
        new CustomEvent<SurfacePageStatusDetail>('folea:surface-page-status', {
          detail: getPageStatus()
        })
      );
    });
  };

  const removeSearchHighlight = (): void => {
    searchHighlight?.remove();
    searchHighlight = undefined;
  };

  const clearSearchHighlight = (): void => {
    removeSearchHighlight();
    lastSearchIndex = -1;
  };

  const getTextLayer = (): import('../../shared/worker/typst').TextLayerModel | undefined =>
    latestTextLayer;

  const getTextLayerTsels = (): readonly HTMLElement[] => textLayerTsels;

  const rebuildTextLayerIndex = (): void => {
    textLayerTsels = [...container.querySelectorAll<HTMLElement>('.typst-document .tsel')];
  };

  const setSearchHighlight = (index: number): boolean => {
    const documentNode = container.querySelector<HTMLElement>('.typst-document');
    const tsel = getTextLayerTsels()[index];
    if (!documentNode || !tsel) {
      return false;
    }

    removeSearchHighlight();

    const rect = tsel.getBoundingClientRect();
    const docRect = documentNode.getBoundingClientRect();
    const highlight = document.createElement('div');
    highlight.className = 'surface-search-highlight';
    highlight.dataset.testid = 'surface-search-highlight';
    highlight.style.left = `${rect.left - docRect.left}px`;
    highlight.style.top = `${rect.top - docRect.top}px`;
    highlight.style.width = `${Math.max(4, rect.width)}px`;
    highlight.style.height = `${Math.max(12, rect.height)}px`;
    documentNode.append(highlight);
    searchHighlight = highlight;
    lastSearchIndex = index;
    return true;
  };

  const searchSpans = (forward: boolean): boolean => {
    const query = lastSearchQuery?.trim().toLowerCase();
    const tsels = getTextLayerTsels();
    if (!query || tsels.length === 0) {
      return false;
    }

    const count = tsels.length;
    const start =
      lastSearchIndex >= 0 ? lastSearchIndex + (forward ? 1 : -1) : forward ? 0 : count - 1;
    const normalizedStart = ((start % count) + count) % count;

    for (let offset = 0; offset < count; offset += 1) {
      const index = forward
        ? (normalizedStart + offset) % count
        : (normalizedStart - offset + count) % count;
      const tsel = tsels[index];
      if (tsel?.textContent?.toLowerCase().includes(query)) {
        if (!setSearchHighlight(index)) {
          return false;
        }

        const rect = tsel.getBoundingClientRect();
        container.scrollTop = Math.max(
          0,
          rect.top -
            container.getBoundingClientRect().top +
            container.scrollTop -
            container.clientHeight * 0.35
        );
        emitPageStatus();

        return true;
      }
    }

    return false;
  };

  const paintRendered = (result: Extract<CompileResult, { type: 'rendered' }>): void => {
    const durationMs = performance.now() - latestStartedAt;

    // Preserve proportional scroll position when re-rendering content that was
    // already visible (i.e. a save-triggered rerender, not a navigation render).
    // Navigation renders set state to 'loading' first, so wasRendered is false.
    const wasRendered = container.dataset.state === 'rendered';
    const prevScrollTop = wasRendered ? container.scrollTop : 0;
    const prevScrollHeight = wasRendered ? container.scrollHeight : 0;

    const svgElement = parseSvgElement(result.artifact.svg);
    const documentNode = document.createElement('div');
    documentNode.className = 'typst-document';
    documentNode.dataset.testid = 'typst-rendered-document';
    documentNode.style.width = `${result.artifact.width}px`;
    documentNode.style.minHeight = `${result.artifact.height}px`;
    documentNode.replaceChildren(svgElement);
    container.replaceChildren(documentNode);
    rebuildTextLayerIndex();
    container.dataset.cacheKey = result.cacheKey;
    container.dataset.fromCache = String(result.fromCache);
    container.dataset.durationMs = String(durationMs);
    latestOutline = result.outline;
    latestTextLayer = result.textLayer;
    caretEngine.setTextLayer(result.textLayer, container, latestNoteId);
    clearSearchHighlight();
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

      const newTsels = getTextLayerTsels();
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
    emitPageStatus();

    emitRendered({
      noteId: result.noteId,
      cacheKey: result.cacheKey,
      fromCache: result.fromCache,
      durationMs
    });
  };

  const showError = (diagnostics: readonly Diagnostic[], noteId = latestNoteId): void => {
    const errorNode = document.createElement('div');
    errorNode.className = 'typst-error';
    errorNode.dataset.testid = 'typst-render-error';
    errorNode.setAttribute('role', 'alert');

    const title = document.createElement('div');
    title.className = 'typst-error-title';
    title.textContent = 'Typst compile error';
    errorNode.append(title);

    const list = document.createElement('ol');
    list.className = 'typst-error-list';

    const renderedDiagnostics =
      diagnostics.length > 0
        ? diagnostics
        : [{ severity: 'error' as const, message: 'Unknown Typst compile error' }];

    for (const diagnostic of renderedDiagnostics) {
      const item = document.createElement('li');
      const location =
        diagnostic.path || diagnostic.range
          ? `${diagnostic.path ?? ''}${diagnostic.range ? ` ${diagnostic.range}` : ''}: `
          : '';
      item.textContent = `${diagnostic.severity}: ${location}${diagnostic.message}`;
      list.append(item);
    }

    errorNode.append(list);
    container.replaceChildren(errorNode);
    textLayerTsels = [];
    latestOutline = [];
    latestTextLayer = undefined;
    clearSearchHighlight();
    container.dataset.fromCache = 'false';
    container.dataset.durationMs = String(performance.now() - latestStartedAt);
    delete container.dataset.cacheKey;
    setState('error');
    emitPageStatus();

    if (noteId) {
      emitError({ noteId, diagnostics: renderedDiagnostics });
    }
  };

  const onMessage = (event: MessageEvent<unknown>): void => {
    const result = parseTypstWorkerResult(event.data);

    if (result.type === 'snapshotSynced') {
      sourceVersion = result.version;
      snapshotResolvers.get(result.version)?.resolve();
      snapshotResolvers.delete(result.version);
      return;
    }

    if (result.type === 'filesUpdated') {
      sourceVersion = result.version;
      updateResolvers.get(result.version)?.resolve(result.affectedNoteIds);
      updateResolvers.delete(result.version);
      return;
    }

    if (result.version !== sourceVersion) return;

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

  const dispatchLinkHref = (href: string): void => {
    let target: LinkTarget;
    if (href.startsWith('#')) {
      target = { kind: 'anchor', id: href.slice(1) };
    } else if (href.startsWith('http://') || href.startsWith('https://')) {
      target = { kind: 'external', url: href };
    } else {
      // Relative link. Typst #link() hrefs are relative to the linking note's directory,
      // not the page base URL, and may omit the .typ extension. Resolution needs the note
      // list, which only App has — carry the raw href + source note and resolve there.
      target = { kind: 'note', rawHref: href, fromRelPath: latestNoteId ?? '' };
    }
    window.dispatchEvent(
      new CustomEvent<SurfaceLinkClickDetail>('folea:surface-link-click', { detail: { target } })
    );
  };

  // Typst SVG uses xlink:href (SVG 1.1), not bare href. CSS [href] selectors still
  // match in Blink (namespace-unaware), but getAttribute('href') returns null.
  const svgAnchorHref = (anchor: Element): string =>
    anchor.getAttribute('href') ?? anchor.getAttribute('xlink:href') ?? '';

  // Single capture-phase listener handles all link clicks regardless of which child
  // element is the target. Capture fires before Chromium processes SVG <a> link activation;
  // stopImmediatePropagation kills other handlers so the new-window path never runs.
  // 'auxclick' covers middle-button clicks which fire auxclick, not click, in Chromium.
  const interceptLinkClick = (event: Event): void => {
    const target = event.target as Element | null;
    if (!target) return;

    // Walk up from click target to find the nearest <a> ancestor.
    let anchor: Element | null = target.closest('a');

    // Fallback: if clicked element is not a DOM descendant of <a> but is
    // geometrically over a link area (can happen with tsel divs in foreignObject),
    // find the <a> by checking bounding rects.
    if (!anchor) {
      const { clientX: x, clientY: y } = event as MouseEvent;
      for (const a of container.querySelectorAll<Element>('a')) {
        const r = a.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          anchor = a;
          break;
        }
      }
    }

    if (!anchor) return;
    const href = svgAnchorHref(anchor);
    if (!href) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    dispatchLinkHref(href);
  };
  container.addEventListener('click', interceptLinkClick, { capture: true });
  container.addEventListener('auxclick', interceptLinkClick, { capture: true });

  worker.addEventListener('message', onMessage);
  container.addEventListener('scroll', emitPageStatus);
  const handleResize = (): void => {
    emitPageStatus();
    zoomController.reapply();
  };
  const handleZoomChanged = (): void => {
    if (lastSearchIndex >= 0) {
      void setSearchHighlight(lastSearchIndex);
    }
  };
  window.addEventListener('resize', handleResize);
  window.addEventListener('folea:zoom-changed', handleZoomChanged);

  controller = {
    syncSnapshot(version: number, sourceFiles: CompileSourceFiles): Promise<void> {
      if (disposed) return Promise.reject(new Error('Surface is disposed'));
      return new Promise((resolve, reject) => {
        snapshotResolvers.set(version, { resolve, reject });
        post({ type: 'syncSnapshot', version, files: sourceFiles });
      });
    },

    updateFiles(
      version: number,
      changed: CompileSourceFiles,
      deleted: readonly string[]
    ): Promise<readonly string[]> {
      if (disposed) return Promise.reject(new Error('Surface is disposed'));
      return new Promise((resolve, reject) => {
        updateResolvers.set(version, { resolve, reject });
        post({ type: 'updateFiles', version, changed, deleted });
      });
    },

    registerDependencies(noteId: string, dependencies: readonly string[]): void {
      if (!disposed) post({ type: 'registerDependencies', noteId, dependencies });
    },

    recompile(noteIds: readonly string[]): void {
      if (disposed) return;
      for (const noteId of noteIds) post({ type: 'compile', noteId, version: sourceVersion });
    },

    render(noteId: string): void {
      if (disposed) {
        return;
      }

      latestNoteId = noteId;
      latestStartedAt = performance.now();
      rerenderSnapshot = null;
      setState('loading');
      emitPageStatus();
      post({ type: 'compile', noteId, version: sourceVersion });
    },

    renderFromCache(noteId: string, cacheKey: string, entry: RenderCacheEntryV1): boolean {
      if (disposed) return false;

      try {
        const svgElement = parseSvgElement(entry.artifact.svg);
        const documentNode = document.createElement('div');
        documentNode.className = 'typst-document';
        documentNode.dataset.testid = 'typst-rendered-document';
        documentNode.style.width = `${entry.artifact.width}px`;
        documentNode.style.minHeight = `${entry.artifact.height}px`;
        documentNode.replaceChildren(svgElement);

        latestNoteId = noteId;
        latestStartedAt = performance.now();
        rerenderSnapshot = null;
        container.replaceChildren(documentNode);
        rebuildTextLayerIndex();
        container.dataset.cacheKey = cacheKey;
        container.dataset.fromCache = 'true';
        container.dataset.durationMs = '0';
        latestOutline = entry.outline;
        latestTextLayer = entry.textLayer;
        caretEngine.setTextLayer(entry.textLayer, container, noteId);
        clearSearchHighlight();
        zoomController.setArtifact(
          documentNode,
          svgElement,
          entry.artifact.width,
          entry.artifact.height,
          entry.textLayer.pages.length,
          getDomContentBounds(documentNode)
        );
        setState('rendered');
        emitPageStatus();
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
      rerenderSnapshot = getTextLayerTsels().map((el) => el.textContent ?? '');
      // No loading state, no content replacement — existing render stays visible
      // until paintRendered() swaps in the new result.
      post({ type: 'compile', noteId, version: sourceVersion });
    },

    prefetch(noteId: string): void {
      if (!disposed) {
        post({ type: 'prefetch', noteId, version: sourceVersion });
      }
    },

    invalidate(noteId: string): void {
      if (!disposed) {
        post({ type: 'invalidate', noteId });
      }
    },

    getOutline(): readonly OutlineEntry[] {
      return latestOutline;
    },

    getTextLayer(): import('../../shared/worker/typst').TextLayerModel | undefined {
      return getTextLayer();
    },

    revealSearchTarget(target: SurfaceSearchTarget): boolean {
      lastSearchQuery = target.query.trim();
      const match = findRenderedSearchMatch(container, target, getTextLayerTsels());
      if (!match) {
        clearSearchHighlight();
        return false;
      }

      const success = setSearchHighlight(match.index);
      if (!success) {
        return false;
      }

      container.scrollTop = Math.max(0, match.top - container.clientHeight * 0.35);
      emitPageStatus();
      return true;
    },

    clearSearchHighlight,

    setLastSearchQuery(query: string): void {
      lastSearchQuery = query.trim();
    },

    nextMatch(): boolean {
      return searchSpans(true);
    },

    prevMatch(): boolean {
      return searchSpans(false);
    },

    showError,

    clear(): void {
      latestNoteId = undefined;
      latestOutline = [];
      latestTextLayer = undefined;
      caretEngine.dispose();
      clearSearchHighlight();
      container.replaceChildren();
      textLayerTsels = [];
      container.dataset.fromCache = 'false';
      delete container.dataset.durationMs;
      delete container.dataset.cacheKey;
      setState('empty');
      emitPageStatus();
    },

    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      const disposedError = new Error('Surface is disposed');
      for (const pending of snapshotResolvers.values()) pending.reject(disposedError);
      for (const pending of updateResolvers.values()) pending.reject(disposedError);
      snapshotResolvers.clear();
      updateResolvers.clear();
      if (pageStatusFrame !== undefined) cancelAnimationFrame(pageStatusFrame);
      pageStatusFrame = undefined;
      caretEngine.dispose();
      worker.removeEventListener('message', onMessage);
      container.removeEventListener('scroll', emitPageStatus);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('folea:zoom-changed', handleZoomChanged);
      worker.terminate();
      container.replaceChildren();
    },

    scrollByLines(n: number): void {
      container.scrollTop += n * LINE_SCROLL_PX;
      emitPageStatus();
    },

    scrollByViewport(fraction: number): void {
      container.scrollTop += container.clientHeight * fraction;
      emitPageStatus();
    },

    scrollToStart(): void {
      container.scrollTop = 0;
      emitPageStatus();
    },

    scrollToEnd(): void {
      container.scrollTop = container.scrollHeight;
      emitPageStatus();
    },

    scrollToOffset(y: number): void {
      container.scrollTop = Math.max(0, y);
      emitPageStatus();
    },

    scrollLeft(): void {
      container.scrollLeft = Math.max(0, container.scrollLeft - HORIZONTAL_SCROLL_PX);
      emitPageStatus();
    },

    scrollRight(): void {
      const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      container.scrollLeft = Math.min(maxScrollLeft, container.scrollLeft + HORIZONTAL_SCROLL_PX);
      emitPageStatus();
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

const parseSvgElement = (svg: string): SVGElement => {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const parserError = parsed.querySelector('parsererror');
  const root = parsed.documentElement;

  if (
    parserError ||
    root.namespaceURI !== 'http://www.w3.org/2000/svg' ||
    root.localName !== 'svg'
  ) {
    throw new Error('Typst renderer returned invalid SVG');
  }

  return document.adoptNode(root) as unknown as SVGElement;
};

const getDomContentBounds = (documentNode: HTMLElement): ContentBounds | null => {
  const documentRect = documentNode.getBoundingClientRect();
  let bounds: ContentBounds | null = null;

  for (const element of documentNode.querySelectorAll<HTMLElement>('.tsel')) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }

    bounds = unionContentBounds(bounds, {
      x: rect.left - documentRect.left,
      y: rect.top - documentRect.top,
      width: rect.width,
      height: rect.height
    });
  }

  return bounds;
};

const unionContentBounds = (left: ContentBounds | null, right: ContentBounds): ContentBounds => {
  if (!left) {
    return right;
  }

  const x1 = Math.min(left.x, right.x);
  const y1 = Math.min(left.y, right.y);
  const x2 = Math.max(left.x + left.width, right.x + right.width);
  const y2 = Math.max(left.y + left.height, right.y + right.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
};

export interface ChangedTargetRevealInput {
  readonly viewportTop: number;
  readonly viewportHeight: number;
  readonly currentScrollTop: number;
  readonly targetTop: number;
  readonly targetBottom: number;
}

export interface RestoredRerenderScrollInput {
  readonly previousScrollTop: number;
  readonly previousScrollHeight: number;
  readonly nextScrollHeight: number;
}

export const getRestoredRerenderScrollTop = ({
  previousScrollTop,
  previousScrollHeight,
  nextScrollHeight
}: RestoredRerenderScrollInput): number | null => {
  if (previousScrollHeight <= 0 || nextScrollHeight <= 0) {
    return null;
  }

  return Math.round((previousScrollTop / previousScrollHeight) * nextScrollHeight);
};

export const getScrollTopForChangedTarget = ({
  viewportTop,
  viewportHeight,
  currentScrollTop,
  targetTop,
  targetBottom
}: ChangedTargetRevealInput): number | null => {
  const viewportBottom = viewportTop + viewportHeight;
  const isVisible = targetBottom > viewportTop && targetTop < viewportBottom;
  if (isVisible) {
    return null;
  }

  const targetTopInContent = targetTop - viewportTop + currentScrollTop;
  return Math.max(0, Math.round(targetTopInContent - viewportHeight * 0.4));
};

interface RenderedSearchMatch {
  readonly index: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const findRenderedSearchMatch = (
  container: HTMLElement,
  target: SurfaceSearchTarget,
  candidates: readonly HTMLElement[] = [
    ...container.querySelectorAll<HTMLElement>('.typst-document .tsel')
  ]
): RenderedSearchMatch | undefined => {
  const documentNode = container.querySelector<HTMLElement>('.typst-document');
  if (!documentNode) {
    return undefined;
  }

  const query = normalizeSearchText(target.query);
  const preview = normalizeSearchText(stripTypstMarkup(target.preview ?? ''));
  if (query.length === 0) {
    return undefined;
  }

  const matchIndex =
    findTextCandidateIndex(candidates, preview) ??
    findTextCandidateIndex(candidates, query) ??
    findTextCandidateIndex(
      candidates,
      normalizeSearchText((target.preview ?? '').replace(/^=+\s*/, ''))
    );

  if (matchIndex === undefined) {
    return undefined;
  }

  const match = candidates[matchIndex];
  if (!match) {
    return undefined;
  }

  const matchRect = match.getBoundingClientRect();
  const documentRect = documentNode.getBoundingClientRect();

  return {
    index: matchIndex,
    left: Math.max(0, matchRect.left - documentRect.left),
    top: Math.max(0, matchRect.top - documentRect.top),
    width: Math.max(4, matchRect.width),
    height: Math.max(12, matchRect.height)
  };
};

const findTextCandidateIndex = (
  candidates: readonly HTMLElement[],
  needle: string
): number | undefined => {
  if (needle.length === 0) {
    return undefined;
  }

  const index = candidates.findIndex((candidate) =>
    normalizeSearchText(candidate.textContent ?? '').includes(needle)
  );
  return index >= 0 ? index : undefined;
};

const stripTypstMarkup = (value: string): string =>
  value
    .replace(/^=+\s*/, '')
    .replace(/#(?:\w|-)+/g, '')
    .trim();

const normalizeSearchText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().toLowerCase();
