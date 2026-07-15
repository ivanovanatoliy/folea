import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js';

import { LinksOverlay } from './LinksOverlay';
import { Logo } from './Logo';
import { OutlineOverlay } from './OutlineOverlay';
import { OperationNotice, type OperationNoticeValue } from './OperationNotice';
import { PaletteOverlay } from './PaletteOverlay';
import { QuickOpenOverlay, type QuickOpenMode } from './QuickOpenOverlay';
import { StatusLine } from './StatusLine';
import { filterPaletteCommands } from './palette-model';
import { SearchOverlay } from './SearchOverlay';
import { TreeOverlay } from './TreeOverlay';
import { TemplateManagerOverlay } from './TemplateManagerOverlay';
import {
  buildTree,
  clampTreeIndex,
  flattenTree,
  getParentFolderPath,
  pruneTreeMarks,
  toggleTreeMark,
  type TreeRow
} from './tree-model';
import {
  VaultOperationDialog,
  type VaultOperationDialogActions,
  type VaultOperationDialogRequest
} from './VaultOperationDialog';
import { listCommands } from '../input';
import {
  attachKeyListener,
  type CaretView,
  createContextStack,
  createDispatcher,
  type Keymap,
  CARET_KEYMAP,
  DOCUMENT_KEYMAP,
  GLOBAL_KEYMAP,
  LINKS_KEYMAP,
  OUTLINE_KEYMAP,
  PALETTE_KEYMAP,
  SEARCH_KEYMAP,
  QUICK_OPEN_KEYMAP,
  TREE_SEARCH_KEYMAP,
  TEMPLATES_KEYMAP,
  VAULT_DIALOG_KEYMAP,
  VISUAL_KEYMAP,
  TREE_KEYMAP
} from '../input';
import type {
  Command,
  CommandContext,
  DocumentView,
  EditorView,
  LinksView,
  OutlineView,
  PaletteView,
  QuickOpenView,
  SearchView,
  ThemeView,
  TreeView,
  VaultDialogView,
  VaultView
} from '../input';
import { buildBindingIndex, type BindingIndex } from '../input/binding-index';
import {
  applyKeysConfigOverrides,
  parseKeysConfig,
  type KeymapSet
} from '../../shared/keys-config';
import { dispatchSmartJump } from '../nav';
import { createLinkGraphIndex, resolveNoteHref } from '../nav/link-graph';
import type { LinkGraph, LinkGraphIndex, NoteRef } from '../nav/link-graph';
import { findLocalSearchHits, type SearchScope } from '../search';
import {
  createSurface,
  type SurfaceCacheWriteDetail,
  type SurfaceController,
  type SurfaceLinkClickDetail,
  type SurfacePageStatusDetail,
  type SurfaceRenderedDetail,
  type SurfaceSearchTarget
} from '../surface';
import type { ZoomState } from '../surface/zoom';
import { type CaretEngine } from '../surface/caret';
import { VaultIndex } from '../vault';
import { assertSafeRelativePosixPath } from '../../shared/path';
import { rewriteTypstReferences } from '../../shared/typst-links';
import type { SearchHit } from '../../shared/ipc/search';
import {
  parseVaultEntryName,
  type NoteMeta,
  type VaultChange,
  type VaultDirectory,
  type VaultTemplate
} from '../../shared/ipc/vault';
import type { CompileSourceFiles, OutlineEntry } from '../../shared/worker/typst';
import type {
  FoleaPrefs,
  FoleaThemePreference,
  NotePositionState,
  NoteZoomMode,
  RecentNoteEntry,
  VaultStateFileV1
} from '../../shared/ipc/vault-state';
import { DEFAULT_PREFS } from '../../shared/ipc/vault-state';
import {
  createPositionDebounce,
  createWarmupQueue,
  buildWriteCacheRequest,
  type WarmupStatus
} from '../vault-state';

const PREFETCH_DEBOUNCE_MS = 120;
const SEARCH_DEBOUNCE_MS = 140;

type ResolvedTheme = 'light' | 'dark';

const systemThemeFromMedia = (): ResolvedTheme =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

type StartupState = 'loading' | 'start-menu' | 'vault-open';

const cloneDefaultKeymaps = (): KeymapSet => ({
  document: new Map(DOCUMENT_KEYMAP),
  caret: new Map(CARET_KEYMAP),
  visual: new Map(VISUAL_KEYMAP),
  tree: new Map(TREE_KEYMAP),
  treeSearch: new Map(TREE_SEARCH_KEYMAP),
  palette: new Map(PALETTE_KEYMAP),
  search: new Map(SEARCH_KEYMAP),
  outline: new Map(OUTLINE_KEYMAP),
  links: new Map(LINKS_KEYMAP),
  quickOpen: new Map(QUICK_OPEN_KEYMAP),
  global: new Map(GLOBAL_KEYMAP),
  templates: new Map(TEMPLATES_KEYMAP)
});

const keymapList = (keymaps: KeymapSet): readonly Keymap[] => [
  keymaps.document,
  keymaps.caret,
  keymaps.visual,
  keymaps.global,
  keymaps.tree,
  keymaps.treeSearch,
  keymaps.palette,
  keymaps.search,
  keymaps.outline,
  keymaps.links,
  keymaps.quickOpen,
  keymaps.templates ?? TEMPLATES_KEYMAP
];

const replaceKeymapContents = (target: Keymap, source: Keymap): void => {
  target.clear();
  for (const [chord, commandId] of source) {
    target.set(chord, commandId);
  }
};

const replaceKeymaps = (target: KeymapSet, source: KeymapSet): void => {
  replaceKeymapContents(target.document, source.document);
  replaceKeymapContents(target.caret, source.caret);
  replaceKeymapContents(target.visual, source.visual);
  replaceKeymapContents(target.tree, source.tree);
  replaceKeymapContents(target.treeSearch, source.treeSearch);
  replaceKeymapContents(target.palette, source.palette);
  replaceKeymapContents(target.search, source.search);
  replaceKeymapContents(target.outline, source.outline);
  replaceKeymapContents(target.links, source.links);
  replaceKeymapContents(target.quickOpen, source.quickOpen);
  replaceKeymapContents(target.global, source.global);
  if (target.templates && source.templates) {
    replaceKeymapContents(target.templates, source.templates);
  }
};

export const App = () => {
  const [startupState, setStartupState] = createSignal<StartupState>('loading');
  const [version, setVersion] = createSignal('');
  const [notes, setNotes] = createSignal<NoteMeta[]>([]);
  const [directories, setDirectories] = createSignal<VaultDirectory[]>([]);
  const [treeMarks, setTreeMarks] = createSignal<ReadonlySet<string>>(new Set());
  const [selectedRelPath, setSelectedRelPath] = createSignal('');
  const [selectedTreeIndex, setSelectedTreeIndex] = createSignal(0);
  const [collapsedFolders, setCollapsedFolders] = createSignal<ReadonlySet<string>>(new Set());
  const docName = createMemo(() => {
    const relPath = selectedRelPath();
    if (!relPath) return '';
    return notes().find((n) => n.relPath === relPath)?.basename ?? '';
  });
  const [vaultStatus, setVaultStatus] = createSignal('no vault');
  const [activeContext, setActiveContext] = createSignal('document');
  const [currentSource, setCurrentSource] = createSignal('');
  const [paletteQuery, setPaletteQuery] = createSignal('');
  const [paletteSelectedIndex, setPaletteSelectedIndex] = createSignal(0);
  const [outlineEntries, setOutlineEntries] = createSignal<readonly OutlineEntry[]>([]);
  const [outlineSelectedIndex, setOutlineSelectedIndex] = createSignal(0);
  const [linkGraph, setLinkGraph] = createSignal<LinkGraph | null>(null);
  const [linksBacklinks, setLinksBacklinks] = createSignal<readonly NoteRef[]>([]);
  const [linksOutgoing, setLinksOutgoing] = createSignal<readonly NoteRef[]>([]);
  const [linksSelectedIndex, setLinksSelectedIndex] = createSignal(0);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [searchScope, setSearchScope] = createSignal<SearchScope>('local');
  const [searchHits, setSearchHits] = createSignal<readonly SearchHit[]>([]);
  const [searchSelectedIndex, setSearchSelectedIndex] = createSignal(0);
  const [searching, setSearching] = createSignal(false);
  const [searchTruncated, setSearchTruncated] = createSignal(false);
  const [searchError, setSearchError] = createSignal<string>();
  const [pageStatus, setPageStatus] = createSignal('[0/0]');
  const [warmupMessage, setWarmupMessage] = createSignal<string | undefined>();
  const [recentNotes, setRecentNotes] = createSignal<readonly RecentNoteEntry[]>([]);
  const [commandHistory, setCommandHistory] = createSignal<readonly string[]>([]);
  const [quickOpenQuery, setQuickOpenQuery] = createSignal('');
  const [quickOpenMode, setQuickOpenMode] = createSignal<QuickOpenMode>('recent');
  const [quickOpenSelectedIndex, setQuickOpenSelectedIndex] = createSignal(0);
  const [quickOpenHits, setQuickOpenHits] = createSignal<readonly SearchHit[]>([]);
  const [quickOpenSearching, setQuickOpenSearching] = createSignal(false);
  const [prefs, setPrefs] = createSignal<FoleaPrefs>(DEFAULT_PREFS);
  const [systemTheme, setSystemTheme] = createSignal<ResolvedTheme>('light');
  const [configWarnings, setConfigWarnings] = createSignal<readonly string[]>([]);
  const [bindingIndex, setBindingIndex] = createSignal<BindingIndex>(new Map());
  const [recentVaults, setRecentVaults] = createSignal<readonly string[]>([]);
  const [treeSearchQuery, setTreeSearchQuery] = createSignal('');
  const [lastCreationTemplate, setLastCreationTemplate] = createSignal<string | null>(null);
  const [managedTemplates, setManagedTemplates] = createSignal<readonly VaultTemplate[]>([]);
  const [selectedTemplateIndex, setSelectedTemplateIndex] = createSignal(0);
  const [vaultDialogRequest, setVaultDialogRequest] = createSignal<VaultOperationDialogRequest>();
  const [vaultDialogParentContext, setVaultDialogParentContext] = createSignal<string>();
  const [operationNotice, setOperationNotice] = createSignal<OperationNoticeValue>();
  const [treeContextMenuOpen, setTreeContextMenuOpen] = createSignal(false);
  const [templateContextMenuOpen, setTemplateContextMenuOpen] = createSignal(false);

  const vaultIndex = new VaultIndex();
  let surfaceMount: HTMLDivElement | undefined;
  let surface: SurfaceController | undefined;
  let caretEngine: CaretEngine | undefined;
  let renderSourceFiles: Map<string, string> | undefined;
  let renderSourceVersion = 0;
  let linkGraphIndex: LinkGraphIndex | undefined;
  let detachKeyListener: (() => void) | undefined;
  let prefetchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let quickOpenSearchTimer: ReturnType<typeof setTimeout> | undefined;
  let sourceDeltaTimer: ReturnType<typeof setTimeout> | undefined;
  let sourceDeltaTail: Promise<void> = Promise.resolve();
  const pendingSourceChanges = new Map<string, VaultChange>();
  let prefetchInFlight = false;
  let queuedPrefetchRelPath: string | undefined;
  let pendingSearchTarget: (SurfaceSearchTarget & { readonly relPath: string }) | undefined;
  let pendingPositionRestore: NotePositionState | undefined;
  let pendingZoomRestore: { readonly relPath: string; readonly state: ZoomState } | undefined;
  let navigationGeneration = 0;

  // Action refs — set inside onMount, consumed by JSX click handlers
  let paletteAcceptRow: (index: number) => void = () => {};
  let treeAcceptRow: (index: number) => void = () => {};
  let treeContextAction: (
    action:
      | 'create-note'
      | 'create-directory'
      | 'open'
      | 'editor'
      | 'mark'
      | 'move'
      | 'rename'
      | 'delete',
    index?: number
  ) => void = () => {};
  let treeDrop: (source: string, index?: number) => void = () => {};
  let treeCloseRequest: () => void = () => {};
  let openTemplateManagerContext: () => void = () => {};
  let quickOpenInputHandler: (query: string) => void = () => {};
  let quickOpenAcceptRow: (index: number) => void = () => {};
  let resolveVaultDialog: ((value: string | null | boolean | undefined) => void) | undefined;
  let openVaultDialogContext: () => void = () => {};
  let closeVaultDialogContext: () => void = () => {};
  let dismissTreeContextMenu: () => void = () => {};
  let dismissTemplateContextMenu: () => void = () => {};
  let vaultDialogActions: VaultOperationDialogActions = {
    cancel: () => {},
    submit: () => {},
    next: () => {},
    previous: () => {}
  };

  // Capture outline/links/search view refs so JSX can call accept(index)
  let outlineViewRef: OutlineView | undefined;
  let linksViewRef: LinksView | undefined;
  let searchViewRef: SearchView | undefined;

  const positionDebounce = createPositionDebounce(async (position) => {
    try {
      await window.folea.vaultState.update({ type: 'positionChanged', position });
    } catch {
      // vault may be closed
    }
  });

  const warmupQueue = createWarmupQueue(
    (status: WarmupStatus) => {
      setWarmupMessage(`render cache ${status.done}/${status.total}`);
    },
    () => {
      setWarmupMessage(undefined);
    },
    (noteId, dependencies) => surface?.registerDependencies(noteId, dependencies)
  );

  const resolvedTheme = createMemo<ResolvedTheme>(() => {
    const theme = prefs().theme;
    return theme === 'system' ? systemTheme() : theme;
  });

  createEffect(() => {
    const theme = resolvedTheme();
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = prefs().theme;
    document.documentElement.style.colorScheme = theme;
  });

  const paletteVisible = createMemo(() => activeContext() === 'palette');
  const searchVisible = createMemo(() => activeContext() === 'search');
  const outlineVisible = createMemo(() => activeContext() === 'outline');
  const linksVisible = createMemo(() => activeContext() === 'links');
  const treeOverlayVisible = createMemo(
    () =>
      activeContext() === 'tree' ||
      activeContext() === 'tree-search' ||
      (activeContext() === 'vault-dialog' &&
        (vaultDialogParentContext() === 'tree' || vaultDialogParentContext() === 'tree-search'))
  );
  const templateManagerVisible = createMemo(
    () =>
      activeContext() === 'templates' ||
      (activeContext() === 'vault-dialog' && vaultDialogParentContext() === 'templates')
  );
  const quickOpenVisible = createMemo(() => activeContext() === 'quick-open');
  const treeRoot = createMemo(() => buildTree(notes(), directories()));
  const treeRows = createMemo(() => flattenTree(treeRoot(), collapsedFolders()));
  const visibleTreeRows = createMemo(() => {
    const query = treeSearchQuery().trim().toLowerCase();
    if (query.length === 0) {
      return treeRows();
    }

    return notes()
      .filter((note) => {
        const haystack = `${note.title} ${note.relPath}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((left, right) => left.relPath.localeCompare(right.relPath))
      .map<TreeRow>((note) => ({
        kind: 'note',
        relPath: note.relPath,
        name: note.title || note.relPath.split('/').pop() || note.relPath,
        depth: 0,
        note
      }));
  });
  const selectedTreeRow = createMemo<TreeRow | undefined>(
    () => visibleTreeRows()[clampTreeIndex(selectedTreeIndex(), visibleTreeRows())]
  );
  const paletteMatches = createMemo(() =>
    filterPaletteCommands(listCommands(), paletteQuery(), commandHistory())
  );

  const disposeSurface = (): void => {
    surface?.dispose();
    surface = undefined;
    caretEngine = undefined;
  };

  const clearPrefetchTimer = (): void => {
    if (prefetchTimer !== undefined) {
      clearTimeout(prefetchTimer);
      prefetchTimer = undefined;
    }
  };

  const clearSearchTimer = (): void => {
    if (searchTimer !== undefined) {
      clearTimeout(searchTimer);
      searchTimer = undefined;
    }
  };

  const clearQuickOpenSearchTimer = (): void => {
    if (quickOpenSearchTimer !== undefined) {
      clearTimeout(quickOpenSearchTimer);
      quickOpenSearchTimer = undefined;
    }
  };

  const readTypstSourceFiles = async (): Promise<CompileSourceFiles> => {
    if (renderSourceFiles) {
      return renderSourceFiles;
    }

    try {
      renderSourceFiles = new Map(
        (await window.folea.vault.renderFiles()).map((file) => [file.relPath, file.contents])
      );
      return renderSourceFiles;
    } catch (error) {
      console.debug('Unable to read Typst render dependency snapshot', error);
      return new Map<string, string>();
    }
  };

  const applySourceDeltaBatch = async (events: readonly VaultChange[]): Promise<void> => {
    const sourceFiles = renderSourceFiles;
    if (!sourceFiles || events.some((event) => event.kind === 'structural')) {
      await refreshVault();
      return;
    }

    const changed = new Map<string, string>();
    const deleted: string[] = [];
    for (const event of events) {
      if (event.kind === 'deleted') {
        deleted.push(event.relPath);
        continue;
      }
      if (event.kind === 'created' || event.kind === 'changed') {
        try {
          changed.set(
            event.note.relPath,
            await window.folea.vault.read({ relPath: event.note.relPath })
          );
        } catch {
          deleted.push(event.note.relPath);
        }
      }
    }

    for (const [path, source] of changed) sourceFiles.set(path, source);
    for (const path of deleted) sourceFiles.delete(path);
    const version = ++renderSourceVersion;
    const affected =
      (await surface?.updateFiles(version, changed, deleted)) ?? ([] as readonly string[]);
    window.dispatchEvent(
      new CustomEvent('folea:source-synced', {
        detail: {
          kind: 'delta',
          version,
          changedCount: changed.size,
          deletedCount: deleted.length,
          totalFileCount: sourceFiles.size,
          affectedNoteIds: affected
        }
      })
    );
    const currentRelPath = selectedRelPath();
    const currentSource = changed.get(currentRelPath);
    if (currentSource !== undefined) {
      setCurrentSource(currentSource);
      surface?.rerender(currentRelPath);
    } else if (deleted.includes(currentRelPath)) {
      const generation = ++navigationGeneration;
      await renderSelectedNote(generation, notes());
    } else if (affected.includes(currentRelPath)) {
      surface?.rerender(currentRelPath);
    }

    const availableNotes = new Set(notes().map((note) => note.relPath));
    surface?.recompile(
      affected.filter((noteId) => noteId !== currentRelPath && availableNotes.has(noteId))
    );
    await updateLinkGraphFromDeltas(events, changed);
  };

  const scheduleSourceDelta = (event: VaultChange): void => {
    const path =
      event.kind === 'structural'
        ? event.relPath
        : event.kind === 'deleted'
          ? event.relPath
          : event.note.relPath;
    pendingSourceChanges.set(path, event);
    if (sourceDeltaTimer !== undefined) clearTimeout(sourceDeltaTimer);
    sourceDeltaTimer = setTimeout(() => {
      sourceDeltaTimer = undefined;
      const events = [...pendingSourceChanges.values()];
      pendingSourceChanges.clear();
      sourceDeltaTail = sourceDeltaTail
        .then(() => applySourceDeltaBatch(events))
        .catch((error) => console.debug('Unable to apply Typst source delta', error));
    }, 80);
  };

  const refreshOutline = (): void => {
    const nextEntries = surface?.getOutline() ?? [];
    setOutlineEntries(nextEntries);
    setOutlineSelectedIndex((index) =>
      nextEntries.length === 0 ? 0 : Math.min(index, nextEntries.length - 1)
    );
  };

  const captureCurrentPosition = (): NotePositionState | undefined => {
    const relPath = selectedRelPath();
    if (!relPath || !surfaceMount) return undefined;

    const scrollTop = surfaceMount.scrollTop;
    const scrollLeft = surfaceMount.scrollLeft;
    const viewportHeight = surfaceMount.clientHeight;
    const contentHeight = surfaceMount.scrollHeight;
    const maxScrollTop = Math.max(0, contentHeight - viewportHeight);
    const scrollRatio = maxScrollTop > 0 ? Math.min(1, scrollTop / maxScrollTop) : 0;
    const zoom = surface?.getZoomState() ?? { mode: 'fitWidth' as const, level: 1 };

    return {
      relPath,
      scrollTop,
      scrollLeft,
      viewportHeight,
      contentHeight,
      scrollRatio,
      zoomMode: zoom.mode as NoteZoomMode,
      zoomLevel: zoom.level,
      caretSpanIndex: null,
      updatedAt: new Date().toISOString()
    };
  };

  const savePositionNow = (): void => {
    const pos = captureCurrentPosition();
    if (pos) {
      positionDebounce.schedule(pos);
    }
  };

  const flushPosition = async (): Promise<void> => {
    const pos = captureCurrentPosition();
    if (pos) {
      try {
        await window.folea.vaultState.update({ type: 'positionChanged', position: pos });
      } catch {
        // vault may be closed
      }
    }
  };

  const recordCommandExecution = (commandId: string): void => {
    setCommandHistory((history) => [commandId, ...history.filter((id) => id !== commandId)]);
    void window.folea.vaultState
      .update({ type: 'commandExecuted', commandId })
      .then((state) => setCommandHistory(state.commandHistory))
      .catch(() => {});
  };

  const runPaletteCommand = (command: Command, context: CommandContext): void => {
    recordCommandExecution(command.id);
    command.run(context);
  };

  const applyLoadedPrefs = (loadedPrefs: FoleaPrefs): void => {
    setPrefs(loadedPrefs);
    setConfigWarnings((current) => [...current, ...loadedPrefs.warnings]);
  };

  const setThemePreference = async (theme: FoleaThemePreference): Promise<void> => {
    try {
      applyLoadedPrefs(await window.folea.prefs.setTheme(theme));
    } catch (error) {
      console.debug('Unable to set theme', error);
      setConfigWarnings((current) => [...current, 'prefs.config: unable to save theme']);
    }
  };

  const restorePosition = (position: NotePositionState): void => {
    if (!surfaceMount) return;

    const currentScrollHeight = surfaceMount.scrollHeight;
    const currentClientHeight = surfaceMount.clientHeight;
    const currentMax = Math.max(0, currentScrollHeight - currentClientHeight);

    if (position.scrollTop <= currentMax + 1) {
      surfaceMount.scrollTop = position.scrollTop;
    } else {
      surfaceMount.scrollTop = Math.round(position.scrollRatio * currentMax);
    }

    if (position.scrollLeft > 0) {
      surfaceMount.scrollLeft = position.scrollLeft;
    }
  };

  const persistRenderCache = async (
    relPath: string,
    result: Extract<import('../../shared/worker/typst').CompileResult, { type: 'rendered' }>
  ): Promise<void> => {
    if (result.fromCache || result.inputFiles.length === 0) return;

    try {
      const request = buildWriteCacheRequest(relPath, result);
      await window.folea.vaultState.writeRenderCache(request);
    } catch (error) {
      console.debug('[render-cache] write error:', error);
    }
  };

  const tryPersistentCacheRender = async (
    relPath: string,
    generation: number
  ): Promise<boolean> => {
    if (!surface) return false;

    try {
      const response = await window.folea.vaultState.readRenderCache({ relPath });
      if (generation !== navigationGeneration || !response.hit) return false;
      return surface.renderFromCache(relPath, response.cacheKey, response.entry);
    } catch {
      return false;
    }
  };

  const openNoteWithState = async (
    relPath: string,
    generation: number,
    vaultState?: VaultStateFileV1
  ): Promise<void> => {
    await flushPosition();
    if (generation !== navigationGeneration) return;
    positionDebounce.dispose();
    const stateForRestore = vaultState ?? (await loadVaultStateOrDefault());
    if (generation !== navigationGeneration) return;
    const positionForRestore = stateForRestore.notePositions[relPath];
    pendingZoomRestore = {
      relPath,
      state: positionForRestore
        ? { mode: positionForRestore.zoomMode, level: positionForRestore.zoomLevel }
        : { mode: 'fitWidth', level: 1 }
    };

    setSelectedRelPath(relPath);
    setCurrentSource('');
    setOutlineEntries([]);
    setOutlineSelectedIndex(0);
    pendingPositionRestore = positionForRestore;

    const meta = notes().find((n) => n.relPath === relPath);
    try {
      await window.folea.vaultState.update({
        type: 'noteOpened',
        relPath,
        title: meta?.title ?? relPath,
        openedAt: new Date().toISOString()
      });
      const updatedState = await window.folea.vaultState.load();
      if (generation === navigationGeneration) {
        setRecentNotes(updatedState.recentNotes);
      }
    } catch {
      // vault may not be ready yet
    }

    if (generation !== navigationGeneration) return;
    const cacheHit = await tryPersistentCacheRender(relPath, generation);
    if (generation !== navigationGeneration) return;

    try {
      const source = await window.folea.vault.read({ relPath });

      if (generation !== navigationGeneration || selectedRelPath() !== relPath) return;

      setCurrentSource(source);
      if (!cacheHit) {
        surface?.render(relPath);
      }
    } catch {
      if (generation === navigationGeneration && !cacheHit) {
        surface?.showError([{ severity: 'error', message: 'Unable to read note' }]);
      }
    }
  };

  const renderSelectedNote = async (generation: number, nextNotes = notes()): Promise<void> => {
    const currentRelPath = selectedRelPath();
    const nextRelPath =
      nextNotes.find((note) => note.relPath === currentRelPath)?.relPath ??
      nextNotes[0]?.relPath ??
      '';

    setSelectedRelPath(nextRelPath);
    setCurrentSource('');
    setOutlineEntries([]);
    setOutlineSelectedIndex(0);

    if (nextRelPath.length === 0) {
      surface?.clear();
      return;
    }

    const source = await window.folea.vault.read({ relPath: nextRelPath });

    if (generation !== navigationGeneration || selectedRelPath() !== nextRelPath) {
      return;
    }

    surface?.render(nextRelPath);
    setCurrentSource(source);
  };

  const selectNote = async (relPath: string): Promise<void> => {
    const generation = ++navigationGeneration;
    if (relPath === selectedRelPath()) {
      await renderSelectedNote(generation);
      return;
    }

    await openNoteWithState(relPath, generation);
  };

  const openNote = (relPath: string, _currentNoteRelPath: string | undefined): void => {
    const safeRelPath = assertSafeRelativePosixPath(relPath, {
      label: 'note link',
      allowedSuffixes: ['.typ']
    });
    void selectNote(safeRelPath);
  };

  const resolveNoteHrefAgainstVault = (rawHref: string, fromRelPath: string): string | null =>
    resolveNoteHref(rawHref, fromRelPath, new Set(notes().map((n) => n.relPath)));

  const scrollToAnchor = (id: string): void => {
    if (!surfaceMount) return;

    const element = document.getElementById(id);
    if (!element || !surfaceMount.contains(element)) return;

    const containerRect = surfaceMount.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    surface?.scrollToOffset(rect.top - containerRect.top + surfaceMount.scrollTop);
  };

  const runPrefetch = async (relPath: string): Promise<void> => {
    if (prefetchInFlight) {
      queuedPrefetchRelPath = relPath;
      return;
    }

    prefetchInFlight = true;

    try {
      if (selectedRelPath() !== relPath) {
        surface?.prefetch(relPath);
      }
    } catch (error) {
      console.debug('Unable to prefetch highlighted note', error);
    } finally {
      prefetchInFlight = false;
      const nextRelPath = queuedPrefetchRelPath;
      queuedPrefetchRelPath = undefined;
      if (nextRelPath !== undefined && nextRelPath !== relPath) {
        void runPrefetch(nextRelPath);
      }
    }
  };

  const schedulePrefetch = (relPath: string): void => {
    clearPrefetchTimer();
    prefetchTimer = setTimeout(() => {
      prefetchTimer = undefined;
      void runPrefetch(relPath);
    }, PREFETCH_DEBOUNCE_MS);
  };

  const rebuildLinkGraph = async (): Promise<void> => {
    try {
      const files = await readTypstSourceFiles();
      const t0 = performance.now();
      linkGraphIndex = createLinkGraphIndex(files, notes());
      setLinkGraph(linkGraphIndex.snapshot());
      const durationMs = performance.now() - t0;
      window.dispatchEvent(
        new CustomEvent<{ durationMs: number; noteCount: number; mode: 'full' }>(
          'folea:graph-built',
          {
            detail: { durationMs, noteCount: notes().length, mode: 'full' }
          }
        )
      );
    } catch {
      // Graph remains stale until next vault change
    }
  };

  const updateLinkGraphFromDeltas = async (
    events: readonly VaultChange[],
    changed: ReadonlyMap<string, string>
  ): Promise<void> => {
    const canUpdateIncrementally =
      linkGraphIndex !== undefined && events.every((event) => event.kind === 'changed');
    if (!canUpdateIncrementally) {
      await rebuildLinkGraph();
      return;
    }

    const t0 = performance.now();
    for (const [relPath, source] of changed) {
      linkGraphIndex!.updateSource(relPath, source);
    }
    setLinkGraph(linkGraphIndex!.snapshot());
    window.dispatchEvent(
      new CustomEvent<{
        durationMs: number;
        noteCount: number;
        mode: 'incremental';
      }>('folea:graph-built', {
        detail: {
          durationMs: performance.now() - t0,
          noteCount: notes().length,
          mode: 'incremental'
        }
      })
    );
  };

  const loadVaultStateOrDefault = async (): Promise<VaultStateFileV1> => {
    try {
      return await window.folea.vaultState.load();
    } catch {
      return {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        lastOpenedNote: null,
        recentNotes: [],
        notePositions: {},
        commandHistory: [],
        lastCreationTemplate: null
      };
    }
  };

  const startWarmup = (
    allNotes: readonly NoteMeta[],
    vaultState: VaultStateFileV1,
    version: number,
    sourceFiles: CompileSourceFiles
  ): void => {
    const current = selectedRelPath();
    const recentPaths = new Set(vaultState.recentNotes.map((n) => n.relPath));

    const sorted = [...allNotes].sort((a, b) => {
      if (a.relPath === current) return -1;
      if (b.relPath === current) return 1;
      if (recentPaths.has(a.relPath) && !recentPaths.has(b.relPath)) return -1;
      if (recentPaths.has(b.relPath) && !recentPaths.has(a.relPath)) return 1;
      return a.relPath.localeCompare(b.relPath);
    });

    warmupQueue.cancel();
    warmupQueue.start(
      version,
      sourceFiles,
      sorted.map((n) => n.relPath)
    );
  };

  const refreshVault = async (vsParam?: VaultStateFileV1): Promise<void> => {
    const generation = ++navigationGeneration;
    try {
      renderSourceFiles = undefined;
      const snapshot = await window.folea.vault.snapshot();
      const listedNotes = vaultIndex.rebuild(snapshot.notes);
      setNotes(listedNotes);
      setDirectories([...snapshot.directories]);
      setVaultStatus(listedNotes.length === 0 ? 'empty vault' : 'vault open');
      const sourceFiles = await readTypstSourceFiles();
      const sourceVersion = ++renderSourceVersion;
      await surface?.syncSnapshot(sourceVersion, sourceFiles);
      window.dispatchEvent(
        new CustomEvent('folea:source-synced', {
          detail: {
            kind: 'snapshot',
            version: sourceVersion,
            changedCount: sourceFiles.size,
            deletedCount: 0,
            totalFileCount: sourceFiles.size
          }
        })
      );

      const vs = vsParam ?? (await loadVaultStateOrDefault());
      setRecentNotes(vs.recentNotes);
      setCommandHistory(vs.commandHistory);
      const availableTemplates = await window.folea.vault.templates().catch(() => []);
      const templateAvailable = availableTemplates.some(
        (template) => template.relPath === vs.lastCreationTemplate
      );
      setLastCreationTemplate(templateAvailable ? vs.lastCreationTemplate : null);
      if (vs.lastCreationTemplate && !templateAvailable) {
        void window.folea.vaultState.update({ type: 'templateSelected', relPath: null });
      }

      const noteSet = new Set(listedNotes.map((n) => n.relPath));
      const missingPaths = [...vs.recentNotes.map((n) => n.relPath), vs.lastOpenedNote].filter(
        (rp): rp is string => rp !== null && !noteSet.has(rp)
      );

      if (missingPaths.length > 0) {
        try {
          const updated = await window.folea.vaultState.update({
            type: 'removeMissingNotes',
            relPaths: missingPaths
          });
          setRecentNotes(updated.recentNotes);
        } catch {
          // best effort
        }
      }

      let targetRelPath: string | undefined;
      if (vs.lastOpenedNote && noteSet.has(vs.lastOpenedNote)) {
        targetRelPath = vs.lastOpenedNote;
      } else {
        targetRelPath = vs.recentNotes.find((n) => noteSet.has(n.relPath))?.relPath;
      }

      if (!targetRelPath) {
        targetRelPath = listedNotes[0]?.relPath;
      }

      if (targetRelPath && generation === navigationGeneration) {
        await openNoteWithState(targetRelPath, generation, vs);
      } else if (!targetRelPath && generation === navigationGeneration) {
        surface?.clear();
      }

      void rebuildLinkGraph();

      setTimeout(() => {
        void window.folea.vaultState.load().then((freshVs) => {
          startWarmup(listedNotes, freshVs, sourceVersion, sourceFiles);
        });
      }, 500);
    } catch {
      if (generation !== navigationGeneration) return;
      vaultIndex.rebuild([]);
      setNotes([]);
      setDirectories([]);
      setSelectedRelPath('');
      setCurrentSource('');
      setOutlineEntries([]);
      surface?.clear();
      setVaultStatus('no vault');
    }
  };

  const parentDirectory = (relPath: string): string => getParentFolderPath(relPath) ?? '';

  const creationDirectory = (row = selectedTreeRow()): string => {
    if (!row) return '';
    return row.kind === 'folder' ? row.relPath : parentDirectory(row.relPath);
  };

  const reportOperationError = (error: unknown): void => {
    setOperationNotice({
      tone: 'error',
      message: error instanceof Error ? error.message : String(error)
    });
  };

  const reportOperationWarnings = (warnings: readonly string[]): void => {
    if (warnings.length > 0) setOperationNotice({ tone: 'warning', message: warnings.join('\n') });
  };

  const requestVaultDialog = (
    request: VaultOperationDialogRequest
  ): Promise<string | null | boolean | undefined> =>
    new Promise((resolve) => {
      resolveVaultDialog?.(undefined);
      resolveVaultDialog = resolve;
      setOperationNotice(undefined);
      setVaultDialogRequest(request);
      openVaultDialogContext();
    });

  const finishVaultDialog = (value: string | null | boolean | undefined): void => {
    const resolve = resolveVaultDialog;
    resolveVaultDialog = undefined;
    setVaultDialogRequest(undefined);
    closeVaultDialogContext();
    resolve?.(value);
  };

  const requestText = (
    title: string,
    label: string,
    value: string,
    submitLabel: string,
    placeholder?: string
  ): Promise<string | undefined> =>
    requestVaultDialog({
      kind: 'text',
      title,
      label,
      value,
      submitLabel,
      ...(placeholder === undefined ? {} : { placeholder })
    }).then((result) => (typeof result === 'string' ? result : undefined));

  const requestConfirmation = (
    title: string,
    message: string,
    submitLabel: string,
    destructive = false
  ): Promise<boolean> =>
    requestVaultDialog({ kind: 'confirm', title, message, submitLabel, destructive }).then(
      (result) => result === true
    );

  const createNoteFlow = async (directory: string): Promise<void> => {
    const rawName = await requestText('Create note', 'Note name', '', 'Continue', 'Note name');
    if (rawName === undefined) return;
    try {
      const segment = parseVaultEntryName(rawName.trim(), 'Note name');
      const filename = segment.endsWith('.typ') ? segment : `${segment}.typ`;
      const templates = await window.folea.vault.templates();
      const previous = lastCreationTemplate();
      const selectedTemplatePath = await requestVaultDialog({
        kind: 'template',
        title: 'Choose template',
        templates,
        selectedRelPath: templates.some((template) => template.relPath === previous)
          ? previous
          : null,
        submitLabel: 'Create'
      });
      if (selectedTemplatePath === undefined) return;
      const template =
        typeof selectedTemplatePath === 'string'
          ? templates.find((candidate) => candidate.relPath === selectedTemplatePath)
          : undefined;
      const relPath = directory === '' ? filename : `${directory}/${filename}`;
      const contents = template
        ? rewriteTypstReferences(
            template.contents,
            template.relPath,
            relPath,
            new Map(),
            new Set(['import', 'include'] as const)
          ).source
        : '';
      await window.folea.vault.create({ relPath, contents });
      const templatePath = template?.relPath ?? null;
      const state = await window.folea.vaultState.update({
        type: 'templateSelected',
        relPath: templatePath
      });
      setLastCreationTemplate(state.lastCreationTemplate);
      await refreshVault(state);
      await selectNote(relPath);
    } catch (error) {
      reportOperationError(error);
    }
  };

  const createDirectoryFlow = async (directoryOverride?: string): Promise<void> => {
    const rawName = await requestText(
      'Create directory',
      'Directory name',
      '',
      'Create',
      'Directory name'
    );
    if (rawName === undefined) return;
    try {
      const name = parseVaultEntryName(rawName.trim(), 'Directory name');
      const directory = directoryOverride ?? creationDirectory();
      const relPath = directory === '' ? name : `${directory}/${name}`;
      await window.folea.vault.createDirectory({ relPath });
      await refreshVault();
    } catch (error) {
      reportOperationError(error);
    }
  };

  const renameSelectionFlow = async (): Promise<void> => {
    const row = selectedTreeRow();
    if (!row) return;
    const rawName = await requestText('Rename entry', 'New name', row.name, 'Rename');
    if (rawName === undefined) return;
    try {
      let name = parseVaultEntryName(rawName.trim(), 'New name');
      if (row.kind === 'note' && !name.endsWith('.typ')) name += '.typ';
      const parent = parentDirectory(row.relPath);
      const to = parent === '' ? name : `${parent}/${name}`;
      const impact = await window.folea.vault.analyzeOperation({
        operation: 'rename',
        sources: [row.relPath],
        destination: to
      });
      const updateReferences =
        impact.references.length === 0 ||
        (await requestConfirmation(
          'Update references',
          `${impact.references.length} references are affected. Update them?`,
          'Update'
        ));
      const result = await window.folea.vault.renameEntry({
        from: row.relPath,
        to,
        updateReferences
      });
      setTreeMarks((marks) => {
        const next = new Set(marks);
        next.delete(row.relPath);
        next.add(to);
        return next;
      });
      await refreshVault();
      if (row.kind === 'note' && selectedRelPath() === row.relPath) await selectNote(to);
      reportOperationWarnings(result.warnings);
    } catch (error) {
      reportOperationError(error);
    }
  };

  const moveMarksFlow = async (
    explicitSources?: readonly string[],
    targetRow = selectedTreeRow()
  ): Promise<void> => {
    const sources = explicitSources ?? [...treeMarks()];
    if (sources.length === 0) return;
    const destinationDirectory = targetRow
      ? targetRow.kind === 'folder'
        ? targetRow.relPath
        : parentDirectory(targetRow.relPath)
      : '';
    try {
      const impact = await window.folea.vault.analyzeOperation({
        operation: 'move',
        sources,
        destination: destinationDirectory
      });
      const updateReferences =
        impact.references.length === 0 ||
        (await requestConfirmation(
          'Update references',
          `${impact.references.length} references are affected. Update them?`,
          'Update'
        ));
      const result = await window.folea.vault.moveBatch({
        sources,
        destinationDirectory,
        updateReferences
      });
      setTreeMarks(new Set<string>());
      await refreshVault();
      const currentMapping = result.mappings.find(
        (mapping) =>
          selectedRelPath() === mapping.from || selectedRelPath().startsWith(`${mapping.from}/`)
      );
      if (currentMapping) {
        const mapped = `${currentMapping.to}${selectedRelPath().slice(currentMapping.from.length)}`;
        if (mapped.endsWith('.typ')) await selectNote(mapped);
      }
      reportOperationWarnings(result.warnings);
    } catch (error) {
      reportOperationError(error);
    }
  };

  const deleteSelectionFlow = async (explicitSources?: readonly string[]): Promise<void> => {
    const row = selectedTreeRow();
    const sources =
      explicitSources ?? (treeMarks().size > 0 ? [...treeMarks()] : row ? [row.relPath] : []);
    if (sources.length === 0) return;
    try {
      const impact = await window.folea.vault.analyzeOperation({ operation: 'trash', sources });
      const summary = `${impact.counts.notes} notes, ${impact.counts.directories} directories, ${impact.counts.otherFiles} other files`;
      if (
        !(await requestConfirmation(
          'Move to trash',
          `Move ${summary} to the system trash?`,
          'Move to trash',
          true
        ))
      )
        return;
      const removeReferences =
        impact.references.length > 0 &&
        (await requestConfirmation(
          'Remove references',
          `Remove ${impact.references.length} external references too?`,
          'Remove references',
          true
        ));
      const result = await window.folea.vault.trashBatch({ sources, removeReferences });
      const succeeded = new Set(
        result.results.filter((item) => item.success).map((item) => item.source)
      );
      setTreeMarks((marks) => new Set([...marks].filter((mark) => !succeeded.has(mark))));
      await refreshVault();
      const failures = result.results.filter((item) => !item.success);
      const messages = [
        ...failures.map((item) => `${item.source}: ${item.error ?? 'unable to trash'}`),
        ...result.warnings
      ];
      reportOperationWarnings(messages);
    } catch (error) {
      reportOperationError(error);
    }
  };

  const manageTemplatesFlow = async (): Promise<void> => {
    try {
      setManagedTemplates(await window.folea.vault.templates());
      setSelectedTemplateIndex(0);
      openTemplateManagerContext();
    } catch (error) {
      reportOperationError(error);
    }
  };

  const openManagedTemplate = async (index = selectedTemplateIndex()): Promise<void> => {
    const template = managedTemplates()[index];
    if (template) await window.folea.editor.open(template.relPath).catch(reportOperationError);
  };

  const renameManagedTemplate = async (index = selectedTemplateIndex()): Promise<void> => {
    const template = managedTemplates()[index];
    if (!template) return;
    const rawName = await requestText(
      'Rename template',
      'New template name',
      template.name,
      'Rename'
    );
    if (rawName === undefined) return;
    try {
      const name = parseVaultEntryName(rawName.trim(), 'Template name');
      const to = `_templates/${name.endsWith('.typ') ? name : `${name}.typ`}`;
      await window.folea.vault.renameEntry({
        from: template.relPath,
        to,
        updateReferences: false,
        templateMode: true
      });
      setManagedTemplates(await window.folea.vault.templates());
      setLastCreationTemplate((current) => (current === template.relPath ? to : current));
    } catch (error) {
      reportOperationError(error);
    }
  };

  const deleteManagedTemplate = async (index = selectedTemplateIndex()): Promise<void> => {
    const template = managedTemplates()[index];
    if (!template) return;
    if (
      !(await requestConfirmation(
        'Move template to trash',
        `Move template ${template.name} to the system trash?`,
        'Move to trash',
        true
      ))
    )
      return;
    try {
      const result = await window.folea.vault.trashBatch({
        sources: [template.relPath],
        templateMode: true
      });
      const failed = result.results.find((item) => !item.success);
      if (failed) throw new Error(failed.error ?? 'Unable to trash template');
      setManagedTemplates(await window.folea.vault.templates());
      setSelectedTemplateIndex((current) =>
        Math.min(current, Math.max(0, managedTemplates().length - 1))
      );
      if (lastCreationTemplate() === template.relPath) setLastCreationTemplate(null);
    } catch (error) {
      reportOperationError(error);
    }
  };

  const closeVault = async (): Promise<void> => {
    warmupQueue.cancel();
    window.folea.search.cancel();
    clearPrefetchTimer();
    clearSearchTimer();
    clearQuickOpenSearchTimer();
    await flushPosition();
    positionDebounce.dispose();

    try {
      await window.folea.vault.close();
    } catch {
      // best effort
    }

    vaultIndex.rebuild([]);
    setNotes([]);
    setSelectedRelPath('');
    setCurrentSource('');
    setOutlineEntries([]);
    setLinkGraph(null);
    linkGraphIndex = undefined;
    setLinksBacklinks([]);
    setLinksOutgoing([]);
    renderSourceFiles = undefined;
    surface?.clear();
    setVaultStatus('no vault');
    setWarmupMessage(undefined);
    setRecentNotes([]);
    setCommandHistory([]);
    setStartupState('start-menu');
    void window.folea.prefs
      .load()
      .then(applyLoadedPrefs)
      .catch(() => {});
    window.folea.appState
      .load()
      .then((s) => setRecentVaults(s.recentVaults))
      .catch(() => {});
  };

  const openVaultInteractive = async (rootPath?: string): Promise<void> => {
    try {
      if (rootPath !== undefined) {
        await window.folea.vault.openRecent(rootPath);
      } else {
        await window.folea.vault.open();
      }
      const [appState, vs, loadedPrefs] = await Promise.all([
        window.folea.appState.load(),
        window.folea.vaultState.load(),
        window.folea.prefs.load()
      ]);
      setRecentVaults(appState.recentVaults);
      applyLoadedPrefs(loadedPrefs);
      setStartupState('vault-open');
      await refreshVault(vs);
    } catch {
      // user cancelled or vault open failed
    }
  };

  const removeRecentVault = async (rootPath: string): Promise<void> => {
    try {
      const next = await window.folea.appState.removeRecentVault(rootPath);
      setRecentVaults(next.recentVaults);
    } catch {
      setRecentVaults((vaults) => vaults.filter((vault) => vault !== rootPath));
    }
  };

  const performStartup = async (): Promise<void> => {
    try {
      const appState = await window.folea.appState.load();
      setRecentVaults(appState.recentVaults);

      if (appState.lastOpenedVaultPath) {
        const handle = await window.folea.vault.openLast();
        if (handle) {
          const [vs, loadedPrefs] = await Promise.all([
            window.folea.vaultState.load(),
            window.folea.prefs.load()
          ]);
          applyLoadedPrefs(loadedPrefs);
          setStartupState('vault-open');
          await refreshVault(vs);
          return;
        }
      }

      setStartupState('start-menu');
    } catch {
      setStartupState('start-menu');
    }
  };

  onMount(() => {
    setSystemTheme(systemThemeFromMedia());
    const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
    const themeMediaListener = (): void => {
      setSystemTheme(systemThemeFromMedia());
    };
    themeMedia.addEventListener('change', themeMediaListener);

    if (surfaceMount) {
      surface = createSurface(surfaceMount);
      caretEngine = surface.getCaretEngine();
    }

    const contextStack = createContextStack();
    const pushContext = (name: string, keymap: Keymap): void => {
      if (contextStack.active()?.name === name) return;
      contextStack.push({ name, keymap });
      setActiveContext(contextStack.active()?.name ?? 'document');
    };
    const popContext = (name: string): void => {
      if (contextStack.active()?.name === name) {
        contextStack.pop();
      }

      setActiveContext(contextStack.active()?.name ?? 'document');
    };

    openVaultDialogContext = () => {
      setVaultDialogParentContext(contextStack.active()?.name);
      pushContext('vault-dialog', VAULT_DIALOG_KEYMAP);
    };
    closeVaultDialogContext = () => {
      popContext('vault-dialog');
      setVaultDialogParentContext(undefined);
    };

    const keymaps = cloneDefaultKeymaps();

    const loadKeyConfig = async (): Promise<void> => {
      try {
        const response = await window.folea.keysConfig.load();
        const knownCommands = new Set(listCommands().map((command) => command.id));
        const parsed = parseKeysConfig(response.content, knownCommands);
        const applied = applyKeysConfigOverrides(cloneDefaultKeymaps(), {
          overrides: parsed.overrides,
          warnings: [...response.warnings, ...parsed.warnings]
        });
        replaceKeymaps(keymaps, applied.keymaps);
        setBindingIndex(buildBindingIndex(keymapList(keymaps)));
        setConfigWarnings((current) => [...current, ...applied.warnings]);
      } catch {
        setConfigWarnings((current) => [...current, 'keys.config: unable to load, using defaults']);
      }
    };

    contextStack.push({ name: 'document', keymap: keymaps.document });
    setActiveContext('document');
    setBindingIndex(buildBindingIndex(keymapList(keymaps)));
    void loadKeyConfig();

    const documentView: DocumentView = {
      scrollByLines: (n) => {
        surface?.scrollByLines(n);
        savePositionNow();
      },
      scrollByViewport: (fraction) => {
        surface?.scrollByViewport(fraction);
        savePositionNow();
      },
      scrollToStart: () => {
        surface?.scrollToStart();
        savePositionNow();
      },
      scrollToEnd: () => {
        surface?.scrollToEnd();
        savePositionNow();
      },
      scrollToOffset: (y) => surface?.scrollToOffset(y),
      scrollLeft: () => {
        surface?.scrollLeft();
        savePositionNow();
      },
      scrollRight: () => {
        surface?.scrollRight();
        savePositionNow();
      },
      nextMatch: () => surface?.nextMatch() ?? false,
      prevMatch: () => surface?.prevMatch() ?? false,
      clearSearch: () => {
        surface?.clearSearchHighlight();
      }
    };

    const zoomView = {
      fitWidth: () => {
        surface?.fitWidth();
        savePositionNow();
      },
      fitContentWidth: () => {
        surface?.fitContentWidth();
        savePositionNow();
      },
      fitPage: () => {
        surface?.fitPage();
        savePositionNow();
      },
      zoomIn: () => {
        surface?.zoomIn();
        savePositionNow();
      },
      zoomOut: () => {
        surface?.zoomOut();
        savePositionNow();
      }
    };

    const toggleFolder = (relPath: string): void => {
      setCollapsedFolders((current) => {
        const next = new Set(current);
        if (next.has(relPath)) {
          next.delete(relPath);
        } else {
          next.add(relPath);
        }

        return next;
      });
    };

    const treeView: TreeView = {
      moveDown: () => setSelectedTreeIndex((index) => clampTreeIndex(index + 1, visibleTreeRows())),
      moveUp: () => setSelectedTreeIndex((index) => clampTreeIndex(index - 1, visibleTreeRows())),
      close: () => {
        if (treeContextMenuOpen()) {
          dismissTreeContextMenu();
          return;
        }
        setTreeSearchQuery('');
        popContext('tree-search');
        popContext('tree');
      },
      openSearch: () => {
        setTreeSearchQuery('');
        setSelectedTreeIndex(0);
        pushContext('tree-search', keymaps.treeSearch);
      },
      closeSearch: () => {
        if (treeContextMenuOpen()) {
          dismissTreeContextMenu();
          return;
        }
        setTreeSearchQuery('');
        setSelectedTreeIndex(0);
        popContext('tree-search');
      },
      appendSearchChar: (char) => {
        setTreeSearchQuery((query) => query + char);
        setSelectedTreeIndex(0);
      },
      backspaceSearch: () => {
        setTreeSearchQuery((query) => query.slice(0, -1));
        setSelectedTreeIndex(0);
      },
      collapse: () => {
        const row = selectedTreeRow();
        if (!row) return;

        if (row.kind === 'folder' && row.expanded) {
          setCollapsedFolders((current) => new Set(current).add(row.relPath));
          return;
        }

        const parentPath = getParentFolderPath(row.relPath);
        if (parentPath === undefined) return;

        const parentIndex = treeRows().findIndex(
          (candidate) => candidate.kind === 'folder' && candidate.relPath === parentPath
        );
        if (parentIndex >= 0) {
          setSelectedTreeIndex(parentIndex);
        }
      },
      expand: () => {
        const row = selectedTreeRow();
        if (!row || row.kind !== 'folder') return;

        if (!row.expanded) {
          setCollapsedFolders((current) => {
            const next = new Set(current);
            next.delete(row.relPath);
            return next;
          });
          return;
        }

        setSelectedTreeIndex((index) => clampTreeIndex(index + 1, treeRows()));
      },
      openSelection: () => {
        const row = selectedTreeRow();
        if (!row) return;

        if (row.kind === 'folder') {
          toggleFolder(row.relPath);
          return;
        }

        popContext('tree');
        popContext('tree-search');
        setTreeSearchQuery('');
        void selectNote(row.relPath);
      },
      toggleOverlay: () => {
        if (startupState() !== 'vault-open') return;
        const active = contextStack.active()?.name;
        if (active === 'tree' || active === 'tree-search') {
          if (treeContextMenuOpen()) dismissTreeContextMenu();
          setTreeSearchQuery('');
          popContext('tree-search');
          popContext('tree');
        } else {
          pushContext('tree', keymaps.tree);
        }
      },
      selectFirst: () => setSelectedTreeIndex(0),
      selectLast: () => setSelectedTreeIndex(Math.max(0, visibleTreeRows().length - 1)),
      createNote: () => void createNoteFlow(creationDirectory()),
      createNoteAtCurrent: () => {
        if (startupState() === 'vault-open')
          void createNoteFlow(parentDirectory(selectedRelPath()));
      },
      createDirectory: () => void createDirectoryFlow(),
      renameSelection: () => void renameSelectionFlow(),
      toggleMark: () => {
        const row = selectedTreeRow();
        if (row) setTreeMarks((marks) => toggleTreeMark(marks, row.relPath));
      },
      clearMarks: () => setTreeMarks(new Set()),
      moveMarks: () => void moveMarksFlow(),
      deleteSelection: () => void deleteSelectionFlow(),
      manageTemplates: () => void manageTemplatesFlow(),
      closeTemplates: () => {
        if (templateContextMenuOpen()) {
          dismissTemplateContextMenu();
          return;
        }
        popContext('templates');
      },
      nextTemplate: () =>
        setSelectedTemplateIndex((index) =>
          Math.min(index + 1, Math.max(0, managedTemplates().length - 1))
        ),
      previousTemplate: () => setSelectedTemplateIndex((index) => Math.max(0, index - 1)),
      openTemplate: () => void openManagedTemplate(),
      renameTemplate: () => void renameManagedTemplate(),
      deleteTemplate: () => void deleteManagedTemplate()
    };

    const paletteView: PaletteView = {
      open: () => {
        setPaletteQuery('');
        setPaletteSelectedIndex(0);
        pushContext('palette', keymaps.palette);
      },
      close: () => popContext('palette'),
      moveNext: () =>
        setPaletteSelectedIndex((index) =>
          Math.min(index + 1, Math.max(0, paletteMatches().length - 1))
        ),
      movePrevious: () => setPaletteSelectedIndex((index) => Math.max(0, index - 1)),
      accept: () => {
        const selected = paletteMatches()[paletteSelectedIndex()]?.command;
        popContext('palette');
        if (selected) {
          runPaletteCommand(selected, commandContext);
        }
      },
      setQuery: (query) => {
        setPaletteQuery(query);
        setPaletteSelectedIndex(0);
      }
    };

    const outlineView: OutlineView = {
      open: () => {
        if (startupState() !== 'vault-open') return;
        refreshOutline();
        setOutlineSelectedIndex(0);
        pushContext('outline', keymaps.outline);
      },
      close: () => popContext('outline'),
      moveNext: () =>
        setOutlineSelectedIndex((index) =>
          Math.min(index + 1, Math.max(0, outlineEntries().length - 1))
        ),
      movePrevious: () => setOutlineSelectedIndex((index) => Math.max(0, index - 1)),
      accept: (index?: number) => {
        const entry = outlineEntries()[index ?? outlineSelectedIndex()];
        popContext('outline');
        if (entry) {
          surface?.scrollToOffset(entry.position.y);
        }
      }
    };

    const resetSearchState = (): void => {
      clearSearchTimer();
      setSearchHits([]);
      setSearchSelectedIndex(0);
      setSearchTruncated(false);
      setSearchError(undefined);
      setSearching(false);
    };

    const searchView: SearchView = {
      open: () => {
        if (startupState() !== 'vault-open') return;
        setSearchScope('local');
        setSearchQuery('');
        resetSearchState();
        pushContext('search', keymaps.search);
      },
      openGlobal: () => {
        if (startupState() !== 'vault-open') return;
        setSearchScope('global');
        setSearchQuery('');
        resetSearchState();
        pushContext('search', keymaps.search);
      },
      close: () => {
        window.folea.search.cancel();
        popContext('search');
        resetSearchState();
      },
      moveNext: () =>
        setSearchSelectedIndex((index) =>
          Math.min(index + 1, Math.max(0, searchHits().length - 1))
        ),
      movePrevious: () => setSearchSelectedIndex((index) => Math.max(0, index - 1)),
      accept: (index?: number) => {
        const hit = searchHits()[index ?? searchSelectedIndex()];
        const targetQuery = searchQuery().trim();
        window.folea.search.cancel();
        popContext('search');
        if (hit) {
          surface?.setLastSearchQuery(targetQuery);
          caretEngine?.setLastQuery(targetQuery);
          pendingSearchTarget = {
            relPath: hit.relPath,
            query: targetQuery,
            line: hit.line,
            preview: hit.preview
          };
          void selectNote(hit.relPath);
        }
      },
      setQuery: (query) => {
        setSearchQuery(query);
        setSearchSelectedIndex(0);
        setSearchHits([]);
        setSearchTruncated(false);
        setSearchError(undefined);
      }
    };

    const quickOpenView: QuickOpenView = {
      open: () => {
        if (startupState() !== 'vault-open') return;
        setQuickOpenQuery('');
        setQuickOpenMode('recent');
        setQuickOpenSelectedIndex(0);
        setQuickOpenHits([]);
        setQuickOpenSearching(false);
        pushContext('quick-open', keymaps.quickOpen);
      },
      close: () => {
        window.folea.search.cancel();
        clearQuickOpenSearchTimer();
        setQuickOpenSearching(false);
        setQuickOpenHits([]);
        popContext('quick-open');
      },
      moveNext: () => {
        const count = quickOpenMode() === 'recent' ? recentNotes().length : quickOpenHits().length;
        setQuickOpenSelectedIndex((i) => Math.min(i + 1, Math.max(0, count - 1)));
      },
      movePrevious: () => setQuickOpenSelectedIndex((i) => Math.max(0, i - 1)),
      accept: (index?: number) => {
        const idx = index ?? quickOpenSelectedIndex();
        if (quickOpenMode() === 'recent') {
          const entry = recentNotes()[idx];
          if (entry) {
            quickOpenView.close();
            void selectNote(entry.relPath);
          }
        } else {
          const hit = quickOpenHits()[idx];
          if (hit) {
            quickOpenView.close();
            void selectNote(hit.relPath);
          }
        }
      },
      setQuery: (query) => {
        setQuickOpenQuery(query);
        setQuickOpenSelectedIndex(0);
        clearQuickOpenSearchTimer();

        if (query.trim().length === 0) {
          window.folea.search.cancel();
          setQuickOpenMode('recent');
          setQuickOpenHits([]);
          setQuickOpenSearching(false);
          return;
        }

        setQuickOpenMode('search');
        setQuickOpenHits([]);
        setQuickOpenSearching(true);

        quickOpenSearchTimer = setTimeout(() => {
          quickOpenSearchTimer = undefined;
          window.folea.search.start(query.trim(), {
            ignoreCase: !prefs().vaultCaseSensitive
          });
        }, SEARCH_DEBOUNCE_MS);
      }
    };

    const caretView: CaretView = {
      toggle: () => {
        const active = contextStack.active()?.name;
        if (active === 'caret' || active === 'visual') {
          if (active === 'visual') {
            caretEngine?.exitVisual();
            popContext('visual');
          }

          caretEngine?.disable();
          popContext('caret');
          return true;
        }

        caretEngine?.enable();
        pushContext('caret', keymaps.caret);
        return true;
      },
      exit: () => {
        const active = contextStack.active()?.name;
        let handled = false;
        if (active === 'visual') {
          caretEngine?.exitVisual();
          popContext('visual');
          handled = true;
        }

        if (contextStack.active()?.name === 'caret') {
          caretEngine?.disable();
          popContext('caret');
          handled = true;
        }

        return handled;
      },
      moveDown: () => {
        caretEngine?.moveDown();
        savePositionNow();
      },
      moveUp: () => {
        caretEngine?.moveUp();
        savePositionNow();
      },
      moveLeft: () => {
        caretEngine?.moveLeft();
        savePositionNow();
      },
      moveRight: () => {
        caretEngine?.moveRight();
        savePositionNow();
      },
      moveToStart: () => {
        caretEngine?.moveToStart();
        savePositionNow();
      },
      moveToEnd: () => {
        caretEngine?.moveToEnd();
        savePositionNow();
      },
      jumpParaForward: () => {
        caretEngine?.jumpParaForward();
        savePositionNow();
      },
      jumpParaBackward: () => {
        caretEngine?.jumpParaBackward();
        savePositionNow();
      },
      enterVisual: () => {
        if (contextStack.active()?.name !== 'caret') return false;
        const handled = caretEngine?.enterVisual() ?? false;
        if (handled) pushContext('visual', keymaps.visual);
        return handled;
      },
      exitVisual: () => {
        if (contextStack.active()?.name !== 'visual') return false;
        const handled = caretEngine?.exitVisual() ?? false;
        popContext('visual');
        return handled;
      },
      extendDown: () => caretEngine?.extendDown(),
      extendUp: () => caretEngine?.extendUp(),
      extendLeft: () => caretEngine?.extendLeft(),
      extendRight: () => caretEngine?.extendRight(),
      yank: () => {
        if (contextStack.active()?.name !== 'visual') return false;
        const handled = caretEngine?.yank() ?? false;
        popContext('visual');
        return handled;
      },
      setMark: (char) => caretEngine?.setMark(char),
      jumpMark: (char) => caretEngine?.jumpToMark(char) ?? false,
      nextMatch: () => caretEngine?.nextMatch() ?? false,
      prevMatch: () => caretEngine?.prevMatch() ?? false,
      smartJump: () => {
        const target = caretEngine?.smartJump();
        if (!target) return false;

        dispatchSmartJump(target, {
          openNote,
          scrollToAnchor,
          resolveNoteHref: resolveNoteHrefAgainstVault
        });
        return true;
      }
    };

    const editorView: EditorView = {
      openCurrentNote: async () => {
        const relPath = selectedRelPath();
        if (!relPath) return;
        try {
          await window.folea.editor.open(relPath);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to open editor';
          surface?.showError([{ severity: 'error', message: msg }]);
        }
      }
    };

    const themeView: ThemeView = {
      useSystem: () => setThemePreference('system'),
      useLight: () => setThemePreference('light'),
      useDark: () => setThemePreference('dark'),
      cycle: () => {
        const next: FoleaThemePreference =
          prefs().theme === 'system' ? 'light' : prefs().theme === 'light' ? 'dark' : 'system';
        return setThemePreference(next);
      }
    };

    const linksView: LinksView = {
      open: () => {
        if (startupState() !== 'vault-open') return;
        const graph = linkGraph();
        const relPath = selectedRelPath();
        if (graph && relPath) {
          setLinksBacklinks(graph.backlinks(relPath));
          setLinksOutgoing(graph.outgoing(relPath));
        } else {
          setLinksBacklinks([]);
          setLinksOutgoing([]);
        }

        setLinksSelectedIndex(0);
        pushContext('links', keymaps.links);
      },
      close: () => popContext('links'),
      moveNext: () =>
        setLinksSelectedIndex((i) =>
          Math.min(i + 1, Math.max(0, linksBacklinks().length + linksOutgoing().length - 1))
        ),
      movePrevious: () => setLinksSelectedIndex((i) => Math.max(0, i - 1)),
      accept: (index?: number) => {
        const allRefs = [...linksBacklinks(), ...linksOutgoing()];
        const selected = allRefs[index ?? linksSelectedIndex()];
        popContext('links');
        if (selected) {
          void selectNote(selected.relPath);
        }
      }
    };

    const vaultView: VaultView = {
      open: () => {
        void openVaultInteractive();
      },
      close: () => {
        void closeVault();
      }
    };

    const vaultDialogView: VaultDialogView = {
      cancel: () => vaultDialogActions.cancel(),
      submit: () => vaultDialogActions.submit(),
      next: () => vaultDialogActions.next(),
      previous: () => vaultDialogActions.previous(),
      ignore: () => {}
    };

    const commandContext: CommandContext = {
      document: documentView,
      contexts: contextStack,
      caret: caretView,
      editor: editorView,
      theme: themeView,
      zoom: zoomView,
      outline: outlineView,
      links: linksView,
      palette: paletteView,
      search: searchView,
      quickOpen: quickOpenView,
      tree: treeView,
      vault: vaultView,
      vaultDialog: vaultDialogView
    };

    // Wire action refs so JSX click handlers can call into onMount-scoped views
    paletteAcceptRow = (index: number) => {
      const selected = paletteMatches()[index]?.command;
      popContext('palette');
      if (selected) runPaletteCommand(selected, commandContext);
    };
    treeAcceptRow = (index: number) => {
      const row = visibleTreeRows()[index];
      if (!row) return;
      setSelectedTreeIndex(index);

      if (row.kind === 'folder') {
        toggleFolder(row.relPath);
        return;
      }

      void selectNote(row.relPath);
    };
    treeCloseRequest = () => treeView.close();
    openTemplateManagerContext = () =>
      pushContext('templates', keymaps.templates ?? TEMPLATES_KEYMAP);
    treeDrop = (source, index) => {
      const target = index === undefined ? undefined : visibleTreeRows()[index];
      const sources = treeMarks().has(source) ? [...treeMarks()] : [source];
      void moveMarksFlow(sources, target);
    };
    treeContextAction = (action, index) => {
      const row = index === undefined ? undefined : visibleTreeRows()[index];
      if (index !== undefined) setSelectedTreeIndex(index);
      if (action === 'create-note') void createNoteFlow(row ? creationDirectory(row) : '');
      else if (action === 'create-directory')
        void createDirectoryFlow(row ? creationDirectory(row) : '');
      else if (action === 'open' && row?.kind === 'note') void selectNote(row.relPath);
      else if (action === 'open' && row?.kind === 'folder') toggleFolder(row.relPath);
      else if (action === 'editor' && row?.kind === 'note')
        void window.folea.editor.open(row.relPath);
      else if (action === 'mark' && row)
        setTreeMarks((marks) => toggleTreeMark(marks, row.relPath));
      else if (action === 'move' && row) {
        void requestText(
          'Move entry',
          'Destination directory',
          '',
          'Move',
          'Leave empty for vault root'
        ).then((destination) => {
          if (destination === undefined) return;
          void window.folea.vault
            .moveBatch({
              sources: [row.relPath],
              destinationDirectory: destination.trim(),
              updateReferences: true
            })
            .then(() => refreshVault())
            .catch(reportOperationError);
        });
      } else if (action === 'rename') setTimeout(() => void renameSelectionFlow());
      else if (action === 'delete' && row) void deleteSelectionFlow([row.relPath]);
    };
    quickOpenInputHandler = (query: string) => quickOpenView.setQuery(query);
    quickOpenAcceptRow = (index: number) => quickOpenView.accept(index);
    outlineViewRef = outlineView;
    linksViewRef = linksView;
    searchViewRef = searchView;

    const dispatcher = createDispatcher(contextStack, keymaps.global, () => commandContext);
    detachKeyListener = attachKeyListener(window, dispatcher);

    void window.folea.app
      .version()
      .then(setVersion)
      .catch(() => setVersion('unavailable'));

    void window.folea.prefs
      .load()
      .then(applyLoadedPrefs)
      .catch(() => {});
    void performStartup();

    const unsubscribeVault = window.folea.vault.onChanged((event) => {
      if (event.kind === 'structural') {
        scheduleSourceDelta(event);
        return;
      }

      const nextNotes = vaultIndex.applyChange(event);
      setNotes(nextNotes);
      setVaultStatus(nextNotes.length === 0 ? 'empty vault' : 'vault open');
      scheduleSourceDelta(event);
    });

    const unsubscribeSearchResult = window.folea.search.onResult((event) => {
      if (quickOpenVisible()) {
        setQuickOpenHits((current) => [...current, ...event.hits]);
      } else {
        setSearchHits((current) => [...current, ...event.hits]);
        setSearching(true);
      }
    });
    const unsubscribeSearchDone = window.folea.search.onDone((event) => {
      if (quickOpenVisible()) {
        setQuickOpenSearching(false);
      } else {
        setSearching(false);
        setSearchTruncated(event.truncated);
      }
    });
    const unsubscribeSearchError = window.folea.search.onError((event) => {
      if (quickOpenVisible()) {
        setQuickOpenSearching(false);
      } else {
        setSearching(false);
        setSearchError(event.message);
      }
    });

    const refreshListener = (): void => {
      renderSourceFiles = undefined;
      void refreshVault();
    };
    const pageStatusListener = (event: Event): void => {
      const detail = (event as CustomEvent<SurfacePageStatusDetail>).detail;
      setPageStatus(`[${detail.current}/${detail.total}]`);
    };
    const surfaceRenderedListener = (event: Event): void => {
      refreshOutline();
      const detail = (event as CustomEvent<SurfaceRenderedDetail>).detail;

      if (pendingZoomRestore && pendingZoomRestore.relPath === detail.noteId) {
        const zoom = pendingZoomRestore;
        pendingZoomRestore = undefined;
        surface?.setZoomState(zoom.state);
      }

      if (pendingPositionRestore && pendingPositionRestore.relPath === detail.noteId) {
        const pos = pendingPositionRestore;
        pendingPositionRestore = undefined;
        restorePosition(pos);
      }

      if (pendingSearchTarget && pendingSearchTarget.relPath === detail.noteId) {
        surface?.revealSearchTarget(pendingSearchTarget);
        pendingSearchTarget = undefined;
      }
    };
    const linkClickListener = (event: Event): void => {
      const { target } = (event as CustomEvent<SurfaceLinkClickDetail>).detail;
      dispatchSmartJump(target, {
        openNote,
        scrollToAnchor,
        resolveNoteHref: resolveNoteHrefAgainstVault
      });
    };

    const surfaceCacheWriteListener = (event: Event): void => {
      const { noteId, result } = (event as CustomEvent<SurfaceCacheWriteDetail>).detail;
      void persistRenderCache(noteId, result);
    };

    const scrollListener = (): void => {
      savePositionNow();
    };

    surfaceMount?.addEventListener('scroll', scrollListener, { passive: true });

    window.addEventListener('folea:vault-refresh', refreshListener);
    window.addEventListener('folea:surface-page-status', pageStatusListener);
    window.addEventListener('folea:surface-rendered', surfaceRenderedListener);
    window.addEventListener('folea:surface-link-click', linkClickListener);
    window.addEventListener('folea:surface-cache-write', surfaceCacheWriteListener);
    window.addEventListener('pagehide', disposeSurface);
    window.addEventListener('beforeunload', disposeSurface);

    onCleanup(async () => {
      clearPrefetchTimer();
      clearSearchTimer();
      clearQuickOpenSearchTimer();
      if (sourceDeltaTimer !== undefined) clearTimeout(sourceDeltaTimer);
      pendingSourceChanges.clear();
      warmupQueue.dispose();
      positionDebounce.dispose();
      window.folea.search.cancel();
      detachKeyListener?.();
      themeMedia.removeEventListener('change', themeMediaListener);
      unsubscribeVault();
      unsubscribeSearchResult();
      unsubscribeSearchDone();
      unsubscribeSearchError();
      surfaceMount?.removeEventListener('scroll', scrollListener);
      window.removeEventListener('folea:vault-refresh', refreshListener);
      window.removeEventListener('folea:surface-page-status', pageStatusListener);
      window.removeEventListener('folea:surface-rendered', surfaceRenderedListener);
      window.removeEventListener('folea:surface-link-click', linkClickListener);
      window.removeEventListener('folea:surface-cache-write', surfaceCacheWriteListener);
      window.removeEventListener('pagehide', disposeSurface);
      window.removeEventListener('beforeunload', disposeSurface);
      disposeSurface();
    });
  });

  createEffect(() => {
    setSelectedTreeIndex((index) => clampTreeIndex(index, treeRows()));
    setTreeMarks((marks) => pruneTreeMarks(marks, treeRows()));
  });

  createEffect(() => {
    setPaletteSelectedIndex((index) => Math.min(index, Math.max(0, paletteMatches().length - 1)));
  });

  createEffect(() => {
    setOutlineSelectedIndex((index) => Math.min(index, Math.max(0, outlineEntries().length - 1)));
  });

  createEffect(() => {
    const total = linksBacklinks().length + linksOutgoing().length;
    setLinksSelectedIndex((index) => Math.min(index, Math.max(0, total - 1)));
  });

  createEffect(() => {
    if (!linksVisible()) return;
    const graph = linkGraph();
    const relPath = selectedRelPath();
    if (graph && relPath) {
      setLinksBacklinks(graph.backlinks(relPath));
      setLinksOutgoing(graph.outgoing(relPath));
    } else {
      setLinksBacklinks([]);
      setLinksOutgoing([]);
    }
  });

  createEffect(() => {
    setSearchSelectedIndex((index) => Math.min(index, Math.max(0, searchHits().length - 1)));
  });

  createEffect(() => {
    const count = quickOpenMode() === 'recent' ? recentNotes().length : quickOpenHits().length;
    setQuickOpenSelectedIndex((i) => Math.min(i, Math.max(0, count - 1)));
  });

  createEffect(() => {
    const row = selectedTreeRow();
    if (!treeOverlayVisible() || row?.kind !== 'note' || row.relPath === selectedRelPath()) {
      clearPrefetchTimer();
      return;
    }

    schedulePrefetch(row.relPath);
  });

  createEffect(() => {
    if (!searchVisible()) {
      clearSearchTimer();
      return;
    }

    const query = searchQuery().trim();
    clearSearchTimer();

    if (query.length === 0) {
      window.folea.search.cancel();
      setSearching(false);
      setSearchHits([]);
      setSearchTruncated(false);
      setSearchError(undefined);
      return;
    }

    if (searchScope() === 'local') {
      window.folea.search.cancel();
      setSearching(false);
      setSearchHits(
        findLocalSearchHits(currentSource(), selectedRelPath(), query, !prefs().inFileCaseSensitive)
      );
      setSearchTruncated(false);
      return;
    }

    setSearching(true);
    searchTimer = setTimeout(() => {
      searchTimer = undefined;
      window.folea.search.start(query, { ignoreCase: !prefs().vaultCaseSensitive });
    }, SEARCH_DEBOUNCE_MS);
  });

  createEffect(() => {
    const rows = visibleTreeRows();
    setSelectedTreeIndex((index) => clampTreeIndex(index, rows));
  });

  return (
    <main class="folea-shell" data-testid="folea-shell" data-theme={resolvedTheme()}>
      <section
        class="document-surface"
        data-testid="document-surface"
        aria-label="Document surface"
      >
        <Show when={startupState() === 'start-menu'}>
          <div class="start-menu" data-testid="start-menu">
            <div class="start-menu-inner">
              <Logo theme={resolvedTheme()} class="start-menu-logo" />
              <Show when={recentVaults().length > 0}>
                <p class="start-menu-section">Recent vaults</p>
                <ul class="start-menu-vaults">
                  {recentVaults().map((vaultPath) => (
                    <li>
                      <div class="start-menu-vault-row" data-testid="start-menu-vault-row">
                        <button
                          type="button"
                          class="start-menu-vault-open"
                          data-vault-path={vaultPath}
                          onClick={() => void openVaultInteractive(vaultPath)}
                        >
                          <span class="start-menu-vault-name">
                            {vaultPath.split(/[\\/]/).pop()}
                          </span>
                          <span class="start-menu-vault-path">{vaultPath}</span>
                        </button>
                        <button
                          type="button"
                          class="start-menu-vault-remove"
                          data-testid="start-menu-vault-remove"
                          aria-label={`Remove ${vaultPath} from recent vaults`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void removeRecentVault(vaultPath);
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Show>
              <button
                type="button"
                class="start-menu-open-link"
                data-testid="start-menu-open-link"
                onClick={() => void openVaultInteractive()}
              >
                Open vault
              </button>
            </div>
          </div>
        </Show>
        <div
          ref={(element) => {
            surfaceMount = element;
          }}
          class="typst-surface"
          data-testid="typst-surface"
          data-vault-state={vaultStatus()}
          aria-label="Rendered Typst document"
        />
        <TreeOverlay
          visible={treeOverlayVisible()}
          rows={visibleTreeRows()}
          selectedIndex={selectedTreeIndex()}
          searchQuery={treeSearchQuery()}
          searchActive={activeContext() === 'tree-search'}
          onRowClick={(index) => treeAcceptRow(index)}
          marks={treeMarks()}
          onCloseRequest={() => treeCloseRequest()}
          onContextMenuVisibilityChange={setTreeContextMenuOpen}
          registerContextMenuDismiss={(dismiss) => {
            dismissTreeContextMenu = dismiss;
          }}
          onAction={(action, index) => treeContextAction(action, index)}
          onDrop={(source, index) => treeDrop(source, index)}
        />
        <TemplateManagerOverlay
          visible={templateManagerVisible()}
          templates={managedTemplates()}
          selectedIndex={selectedTemplateIndex()}
          onSelect={setSelectedTemplateIndex}
          onOpen={(index) => void openManagedTemplate(index)}
          onRename={(index) => void renameManagedTemplate(index)}
          onDelete={(index) => void deleteManagedTemplate(index)}
          onContextMenuVisibilityChange={setTemplateContextMenuOpen}
          registerContextMenuDismiss={(dismiss) => {
            dismissTemplateContextMenu = dismiss;
          }}
        />
        <VaultOperationDialog
          request={vaultDialogRequest()}
          onCancel={() => finishVaultDialog(undefined)}
          onSubmit={(value) => finishVaultDialog(value)}
          registerActions={(actions) => {
            vaultDialogActions = actions;
          }}
        />
        <OperationNotice
          notice={operationNotice()}
          onDismiss={() => setOperationNotice(undefined)}
        />
        <PaletteOverlay
          visible={paletteVisible()}
          modeLabel="palette"
          query={paletteQuery()}
          placeholder="Run command"
          matches={paletteMatches()}
          selectedIndex={paletteSelectedIndex()}
          bindingIndex={bindingIndex()}
          onInput={(query) => {
            setPaletteQuery(query);
            setPaletteSelectedIndex(0);
          }}
          onRowClick={(index) => paletteAcceptRow(index)}
        />
        <QuickOpenOverlay
          visible={quickOpenVisible()}
          query={quickOpenQuery()}
          mode={quickOpenMode()}
          recentNotes={recentNotes()}
          noteMetas={notes()}
          searchHits={quickOpenHits()}
          selectedIndex={quickOpenSelectedIndex()}
          searching={quickOpenSearching()}
          onInput={(query) => quickOpenInputHandler(query)}
          onRowClick={(index) => quickOpenAcceptRow(index)}
        />
        <OutlineOverlay
          visible={outlineVisible()}
          entries={outlineEntries()}
          selectedIndex={outlineSelectedIndex()}
          onRowClick={(index) => outlineViewRef?.accept(index)}
        />
        <LinksOverlay
          visible={linksVisible()}
          backlinks={linksBacklinks()}
          outgoing={linksOutgoing()}
          selectedIndex={linksSelectedIndex()}
          onRowClick={(index) => linksViewRef?.accept(index)}
        />
        <SearchOverlay
          visible={searchVisible()}
          query={searchQuery()}
          hits={searchHits()}
          selectedIndex={searchSelectedIndex()}
          searching={searching()}
          truncated={searchTruncated()}
          error={searchError()}
          scope={searchScope()}
          onInput={(query) => {
            setSearchHits([]);
            setSearchSelectedIndex(0);
            setSearchTruncated(false);
            setSearchError(undefined);
            setSearchQuery(query);
          }}
          onRowClick={(index) => searchViewRef?.accept(index)}
        />
      </section>
      <StatusLine
        version={version()}
        vaultStatus={vaultStatus()}
        vaultCount={notes().length}
        pageStatus={pageStatus()}
        mode={activeContext()}
        docName={docName()}
        warmupMessage={warmupMessage()}
        configWarning={configWarnings()[0]}
      />
    </main>
  );
};
