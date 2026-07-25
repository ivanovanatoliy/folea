import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNoteController } from '../../src/renderer/features/notes/create-note-controller';
import type { NoteMeta } from '../../src/shared/ipc/vault';
import type { NotePositionState, VaultStateFileV1 } from '../../src/shared/ipc/vault-state';
import type { CompileResult } from '../../src/shared/worker/typst';
import type { SurfaceController } from '../../src/renderer/surface';

const renderedResult = (
  overrides: Partial<Extract<CompileResult, { type: 'rendered' }>> = {}
): Extract<CompileResult, { type: 'rendered' }> => ({
  type: 'rendered',
  noteId: 'alpha.typ',
  version: 1,
  cacheKey: 'cache-alpha',
  artifact: { svg: '<svg />', width: 10, height: 10 },
  textLayer: {
    version: 1,
    text: 'Alpha',
    spans: [],
    pages: [{ page: 0, width: 10, height: 10 }]
  },
  outline: [],
  fromCache: false,
  inputFiles: [{ path: 'alpha.typ', sha256: 'hash-alpha' }],
  ...overrides
});

const createController = () =>
  createNoteController({
    notes: () => [],
    selectedRelPath: () => '',
    setSelectedRelPath: vi.fn(),
    setCurrentSource: vi.fn(),
    setRecentNotes: vi.fn(),
    getSurface: () => undefined,
    getSurfaceElement: () => undefined,
    setPendingZoomRestore: vi.fn(),
    setPendingPositionRestore: vi.fn(),
    clearOutline: vi.fn(),
    loadVaultState: vi.fn(),
    showError: vi.fn()
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('note controller', () => {
  it('invalidates older asynchronous navigation generations', () => {
    const controller = createController();
    const first = controller.beginNavigation();
    const second = controller.beginNavigation();

    expect(controller.isCurrent(first)).toBe(false);
    expect(controller.isCurrent(second)).toBe(true);
    controller.reset();
  });

  it('persists only fresh compiler results with dependency inputs', async () => {
    const writeRenderCache = vi.fn(async () => undefined);
    vi.stubGlobal('window', { folea: { vaultState: { writeRenderCache } } });
    const controller = createController();

    await controller.persistRenderCache('alpha.typ', renderedResult({ fromCache: true }));
    await controller.persistRenderCache('alpha.typ', renderedResult({ inputFiles: [] }));
    expect(writeRenderCache).not.toHaveBeenCalled();

    await controller.persistRenderCache('alpha.typ', renderedResult());
    expect(writeRenderCache).toHaveBeenCalledOnce();
    expect(writeRenderCache).toHaveBeenCalledWith(
      expect.objectContaining({
        manifestEntry: expect.objectContaining({
          relPath: 'alpha.typ',
          cacheKey: 'cache-alpha',
          inputFiles: [{ relPath: 'alpha.typ', sha256: 'hash-alpha' }]
        })
      })
    );
    controller.reset();
  });

  it('captures the exact reading location and prefers a history restore override', async () => {
    let selectedRelPath = 'alpha.typ';
    const setPendingZoomRestore = vi.fn();
    const setPendingPositionRestore = vi.fn();
    const loadVaultState = vi.fn(
      async (): Promise<VaultStateFileV1> => ({
        schemaVersion: 1,
        updatedAt: '2026-07-25T00:00:00.000Z',
        lastOpenedNote: 'alpha.typ',
        recentNotes: [],
        notePositions: {},
        commandHistory: [],
        lastCreationTemplate: null
      })
    );
    const notes: NoteMeta[] = [
      {
        id: 'alpha.typ',
        relPath: 'alpha.typ',
        basename: 'alpha.typ',
        title: 'alpha',
        byteSize: 1,
        mtimeMs: 1
      },
      {
        id: 'beta.typ',
        relPath: 'beta.typ',
        basename: 'beta.typ',
        title: 'beta',
        byteSize: 1,
        mtimeMs: 1
      }
    ];
    const element = {
      scrollTop: 480,
      scrollLeft: 24,
      clientHeight: 800,
      scrollHeight: 2400
    } as HTMLElement;
    const render = vi.fn();
    const surface = {
      getZoomState: () => ({ mode: 'fixed' as const, level: 1.4 }),
      getCaretEngine: () => ({ getSpanIndex: () => 7 }),
      registerDependencies: vi.fn(),
      renderFromCache: vi.fn(() => false),
      render
    } as unknown as SurfaceController;
    const update = vi.fn(async () => ({ recentNotes: [] }));
    vi.stubGlobal('window', {
      folea: {
        vaultState: {
          update,
          readRenderCache: vi.fn(async () => ({ hit: false, reason: 'missing' }))
        },
        vault: { read: vi.fn(async () => '= Beta') }
      }
    });
    const controller = createNoteController({
      notes: () => notes,
      selectedRelPath: () => selectedRelPath,
      setSelectedRelPath: (value) => {
        selectedRelPath = typeof value === 'function' ? value(selectedRelPath) : value;
        return selectedRelPath;
      },
      setCurrentSource: vi.fn(),
      setRecentNotes: vi.fn(),
      getSurface: () => surface,
      getSurfaceElement: () => element,
      setPendingZoomRestore,
      setPendingPositionRestore,
      clearOutline: vi.fn(),
      loadVaultState,
      showError: vi.fn()
    });

    expect(controller.capturePosition()).toMatchObject({
      relPath: 'alpha.typ',
      scrollTop: 480,
      scrollLeft: 24,
      scrollRatio: 0.3,
      zoomMode: 'fixed',
      zoomLevel: 1.4,
      caretSpanIndex: 7
    });

    const target: NotePositionState = {
      relPath: 'beta.typ',
      scrollTop: 900,
      scrollLeft: 0,
      viewportHeight: 800,
      contentHeight: 3200,
      scrollRatio: 0.375,
      zoomMode: 'fitContentWidth',
      zoomLevel: 0.9,
      caretSpanIndex: 19,
      updatedAt: '2026-07-25T00:00:00.000Z'
    };
    await controller.select('beta.typ', target);

    expect(loadVaultState).not.toHaveBeenCalled();
    expect(setPendingZoomRestore).toHaveBeenCalledWith({
      relPath: 'beta.typ',
      state: { mode: 'fitContentWidth', level: 0.9 }
    });
    expect(setPendingPositionRestore).toHaveBeenCalledWith(target);
    expect(selectedRelPath).toBe('beta.typ');
    expect(render).toHaveBeenCalledWith('beta.typ');
    controller.reset();
  });
});
