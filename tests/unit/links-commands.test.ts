import { describe, expect, it, vi } from 'vitest';

import '../../src/renderer/input/bindings';
import {
  CARET_KEYMAP,
  createContextStack,
  createDispatcher,
  DOCUMENT_KEYMAP,
  GLOBAL_KEYMAP,
  LINKS_KEYMAP,
  listCommands
} from '../../src/renderer/input';
import type { CommandContext, LinksView } from '../../src/renderer/input';

const makeLinksView = (): { view: LinksView; open: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; moveNext: ReturnType<typeof vi.fn>; movePrevious: ReturnType<typeof vi.fn>; accept: ReturnType<typeof vi.fn> } => {
  const open = vi.fn();
  const close = vi.fn();
  const moveNext = vi.fn();
  const movePrevious = vi.fn();
  const accept = vi.fn();
  return { view: { open, close, moveNext, movePrevious, accept }, open, close, moveNext, movePrevious, accept };
};

const makeContext = (links: LinksView): CommandContext => ({
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
  contexts: createContextStack(),
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
  editor: { openCurrentNote: vi.fn().mockResolvedValue(undefined) },
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
  outline: { open: vi.fn(), close: vi.fn(), moveNext: vi.fn(), movePrevious: vi.fn(), accept: vi.fn() },
  links,
  palette: { open: vi.fn(), close: vi.fn(), moveNext: vi.fn(), movePrevious: vi.fn(), accept: vi.fn(), setQuery: vi.fn() },
  search: { open: vi.fn(), openGlobal: vi.fn(), close: vi.fn(), moveNext: vi.fn(), movePrevious: vi.fn(), accept: vi.fn(), setQuery: vi.fn() },
  tree: { moveDown: vi.fn(), moveUp: vi.fn(), collapse: vi.fn(), expand: vi.fn(), close: vi.fn(), openSearch: vi.fn(), closeSearch: vi.fn(), openSelection: vi.fn(), toggleOverlay: vi.fn(), selectFirst: vi.fn(), selectLast: vi.fn(), appendSearchChar: vi.fn(), backspaceSearch: vi.fn() },
  quickOpen: { open: vi.fn(), close: vi.fn(), moveNext: vi.fn(), movePrevious: vi.fn(), accept: vi.fn(), setQuery: vi.fn() },
  vault: { open: vi.fn(), close: vi.fn() }
});

describe('links commands — all five are registered', () => {
  it('all links.* commands appear in listCommands()', () => {
    const ids = listCommands().map((c) => c.id);
    expect(ids).toContain('document.links');
    expect(ids).toContain('links.close');
    expect(ids).toContain('links.moveNext');
    expect(ids).toContain('links.movePrevious');
    expect(ids).toContain('links.accept');
  });
});

describe('links commands — LINKS_KEYMAP dispatch', () => {
  const makeSetup = () => {
    const stack = createContextStack();
    stack.push({ name: 'document', keymap: DOCUMENT_KEYMAP });
    const links = makeLinksView();
    const ctx = makeContext(links.view);
    const dispatcher = createDispatcher(stack, GLOBAL_KEYMAP, () => ctx);
    return { stack, links, ctx, dispatcher };
  };

  it('Escape → links.close', () => {
    const { stack, links, dispatcher } = makeSetup();
    stack.push({ name: 'links', keymap: LINKS_KEYMAP });
    expect(dispatcher.dispatch('Escape')).toBe('handled');
    expect(links.close).toHaveBeenCalledOnce();
  });

  it('Enter → links.accept', () => {
    const { stack, links, dispatcher } = makeSetup();
    stack.push({ name: 'links', keymap: LINKS_KEYMAP });
    expect(dispatcher.dispatch('Enter')).toBe('handled');
    expect(links.accept).toHaveBeenCalledOnce();
  });

  it('ArrowDown → links.moveNext', () => {
    const { stack, links, dispatcher } = makeSetup();
    stack.push({ name: 'links', keymap: LINKS_KEYMAP });
    expect(dispatcher.dispatch('ArrowDown')).toBe('handled');
    expect(links.moveNext).toHaveBeenCalledOnce();
  });

  it('j → links.moveNext', () => {
    const { stack, links, dispatcher } = makeSetup();
    stack.push({ name: 'links', keymap: LINKS_KEYMAP });
    expect(dispatcher.dispatch('j')).toBe('handled');
    expect(links.moveNext).toHaveBeenCalledOnce();
  });

  it('ArrowUp → links.movePrevious', () => {
    const { stack, links, dispatcher } = makeSetup();
    stack.push({ name: 'links', keymap: LINKS_KEYMAP });
    expect(dispatcher.dispatch('ArrowUp')).toBe('handled');
    expect(links.movePrevious).toHaveBeenCalledOnce();
  });

  it('k → links.movePrevious', () => {
    const { stack, links, dispatcher } = makeSetup();
    stack.push({ name: 'links', keymap: LINKS_KEYMAP });
    expect(dispatcher.dispatch('k')).toBe('handled');
    expect(links.movePrevious).toHaveBeenCalledOnce();
  });

  it('printable keys are unhandled in links context', () => {
    const { stack, dispatcher } = makeSetup();
    stack.push({ name: 'links', keymap: LINKS_KEYMAP });
    expect(dispatcher.dispatch('x')).toBe('unhandled');
    expect(dispatcher.dispatch('a')).toBe('unhandled');
  });
});

describe('links commands — document.links opened from document and caret', () => {
  const makeSetupFromContext = (contextKeymap: Map<string, string>) => {
    const stack = createContextStack();
    stack.push({ name: 'document', keymap: contextKeymap });
    const links = makeLinksView();
    const ctx = makeContext(links.view);
    const dispatcher = createDispatcher(stack, GLOBAL_KEYMAP, () => ctx);
    return { stack, links, ctx, dispatcher };
  };

  it('b → document.links from DOCUMENT_KEYMAP', () => {
    const { links, dispatcher } = makeSetupFromContext(DOCUMENT_KEYMAP);
    expect(dispatcher.dispatch('b')).toBe('handled');
    expect(links.open).toHaveBeenCalledOnce();
  });

  it('b → document.links from CARET_KEYMAP', () => {
    const { links, dispatcher } = makeSetupFromContext(CARET_KEYMAP);
    expect(dispatcher.dispatch('b')).toBe('handled');
    expect(links.open).toHaveBeenCalledOnce();
  });
});
