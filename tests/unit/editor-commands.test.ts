import { describe, expect, it, vi } from 'vitest';

import '../../src/renderer/input/bindings';
import {
  createContextStack,
  DOCUMENT_KEYMAP,
  GLOBAL_KEYMAP,
  listCommands
} from '../../src/renderer/input';
import type { CommandContext, EditorView } from '../../src/renderer/input';

const makeEditorView = (): { view: EditorView; openCurrentNote: ReturnType<typeof vi.fn> } => {
  const openCurrentNote = vi.fn().mockResolvedValue(undefined);
  const view: EditorView = { openCurrentNote };
  return { view, openCurrentNote };
};

const makeMinimalContext = (editor: EditorView): CommandContext => {
  const stack = createContextStack();
  stack.push({ name: 'document', keymap: DOCUMENT_KEYMAP });

  return {
    document: {
      scrollByLines: vi.fn(),
      scrollByViewport: vi.fn(),
      scrollToStart: vi.fn(),
      scrollToEnd: vi.fn(),
      scrollToOffset: vi.fn(),
      scrollLeft: vi.fn(),
      scrollRight: vi.fn(),
      nextMatch: vi.fn().mockReturnValue(false),
      prevMatch: vi.fn().mockReturnValue(false),
      clearSearch: vi.fn()
    },
    contexts: stack,
    caret: {
      toggle: vi.fn().mockReturnValue(false),
      exit: vi.fn().mockReturnValue(false),
      moveDown: vi.fn(),
      moveUp: vi.fn(),
      moveLeft: vi.fn(),
      moveRight: vi.fn(),
      moveToStart: vi.fn(),
      moveToEnd: vi.fn(),
      jumpParaForward: vi.fn(),
      jumpParaBackward: vi.fn(),
      enterVisual: vi.fn().mockReturnValue(false),
      exitVisual: vi.fn().mockReturnValue(false),
      extendDown: vi.fn(),
      extendUp: vi.fn(),
      extendLeft: vi.fn(),
      extendRight: vi.fn(),
      yank: vi.fn().mockReturnValue(false),
      setMark: vi.fn(),
      jumpMark: vi.fn().mockReturnValue(false),
      nextMatch: vi.fn().mockReturnValue(false),
      prevMatch: vi.fn().mockReturnValue(false),
      smartJump: vi.fn().mockReturnValue(false)
    },
    editor,
    theme: {
      useSystem: vi.fn().mockResolvedValue(undefined),
      useLight: vi.fn().mockResolvedValue(undefined),
      useDark: vi.fn().mockResolvedValue(undefined),
      cycle: vi.fn().mockResolvedValue(undefined)
    },
    zoom: {
      fitWidth: vi.fn(),
      fitContentWidth: vi.fn(),
      fitPage: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn()
    },
    outline: {
      open: vi.fn(),
      close: vi.fn(),
      moveNext: vi.fn(),
      movePrevious: vi.fn(),
      accept: vi.fn()
    },
    links: {
      open: vi.fn(),
      close: vi.fn(),
      moveNext: vi.fn(),
      movePrevious: vi.fn(),
      accept: vi.fn()
    },
    palette: {
      open: vi.fn(),
      close: vi.fn(),
      moveNext: vi.fn(),
      movePrevious: vi.fn(),
      accept: vi.fn(),
      setQuery: vi.fn()
    },
    search: {
      open: vi.fn(),
      openGlobal: vi.fn(),
      close: vi.fn(),
      moveNext: vi.fn(),
      movePrevious: vi.fn(),
      accept: vi.fn(),
      setQuery: vi.fn()
    },
    tree: {
      moveDown: vi.fn(),
      moveUp: vi.fn(),
      collapse: vi.fn(),
      expand: vi.fn(),
      close: vi.fn(),
      openSearch: vi.fn(),
      closeSearch: vi.fn(),
      openSelection: vi.fn(),
      toggleOverlay: vi.fn(),
      selectFirst: vi.fn(),
      selectLast: vi.fn(),
      appendSearchChar: vi.fn(),
      backspaceSearch: vi.fn()
    },
    quickOpen: {
      open: vi.fn(),
      close: vi.fn(),
      moveNext: vi.fn(),
      movePrevious: vi.fn(),
      accept: vi.fn(),
      setQuery: vi.fn()
    },
    vault: { open: vi.fn(), close: vi.fn() }
  };
};

describe('editor commands in registry', () => {
  it('editor.open appears in listCommands()', () => {
    const commands = listCommands();
    const ids = commands.map((c) => c.id);
    expect(ids).toContain('editor.open');
  });

  it('editor.open has title "Open in editor"', () => {
    const cmd = listCommands().find((c) => c.id === 'editor.open');
    expect(cmd?.title).toBe('Open in editor');
  });
});

describe('editor command dispatch', () => {
  it('editor.open command invokes ctx.editor.openCurrentNote()', () => {
    const { view, openCurrentNote } = makeEditorView();
    const ctx = makeMinimalContext(view);

    const cmd = listCommands().find((c) => c.id === 'editor.open');
    expect(cmd).toBeDefined();
    cmd!.run(ctx);

    expect(openCurrentNote).toHaveBeenCalledOnce();
  });

  it('editor commands are not bound to any key in GLOBAL_KEYMAP', () => {
    const globalValues = [...GLOBAL_KEYMAP.values()];
    expect(globalValues).not.toContain('editor.open');
  });

  it('editor.open is bound to <C-e> in DOCUMENT_KEYMAP', () => {
    expect(DOCUMENT_KEYMAP.get('<C-e>')).toBe('editor.open');
  });
});
