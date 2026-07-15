import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNoteController } from '../../src/renderer/features/notes/create-note-controller';
import type { CompileResult } from '../../src/shared/worker/typst';

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
});
