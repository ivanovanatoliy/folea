import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../src/renderer/input/bindings';
import {
  CARET_KEYMAP,
  createContextStack,
  createDispatcher,
  DOCUMENT_KEYMAP,
  GLOBAL_KEYMAP,
  PALETTE_KEYMAP,
  SEARCH_KEYMAP,
  VISUAL_KEYMAP,
  TREE_KEYMAP,
  TREE_SEARCH_KEYMAP
} from '../../src/renderer/input';
import type {
  CaretView,
  CommandContext,
  DocumentView,
  LinksView,
  TreeView,
  ZoomView
} from '../../src/renderer/input';
import { normalizeChord } from '../../src/renderer/input/keys';

const makeView = () => {
  const scrollByLines = vi.fn();
  const scrollByViewport = vi.fn();
  const scrollToStart = vi.fn();
  const scrollToEnd = vi.fn();
  const scrollToOffset = vi.fn();
  const scrollLeft = vi.fn();
  const scrollRight = vi.fn();
  const nextMatch = vi.fn().mockReturnValue(true);
  const prevMatch = vi.fn().mockReturnValue(true);
  const clearSearch = vi.fn();
  const view: DocumentView = {
    scrollByLines,
    scrollByViewport,
    scrollToStart,
    scrollToEnd,
    scrollToOffset,
    scrollLeft,
    scrollRight,
    nextMatch,
    prevMatch,
    clearSearch
  };
  return {
    view,
    scrollByLines,
    scrollByViewport,
    scrollToStart,
    scrollToEnd,
    scrollToOffset,
    scrollLeft,
    scrollRight,
    nextMatch,
    prevMatch,
    clearSearch
  };
};

const makeTreeView = () => {
  const moveDown = vi.fn();
  const moveUp = vi.fn();
  const collapse = vi.fn();
  const expand = vi.fn();
  const collapseAll = vi.fn();
  const expandAll = vi.fn();
  const close = vi.fn();
  const openSelection = vi.fn();
  const toggleOverlay = vi.fn();
  const selectFirst = vi.fn();
  const selectLast = vi.fn();
  const openSearch = vi.fn();
  const closeSearch = vi.fn();
  const appendSearchChar = vi.fn();
  const backspaceSearch = vi.fn();
  const view: TreeView = {
    moveDown,
    moveUp,
    collapse,
    expand,
    collapseAll,
    expandAll,
    close,
    openSearch,
    closeSearch,
    openSelection,
    toggleOverlay,
    selectFirst,
    selectLast,
    appendSearchChar,
    backspaceSearch
  };
  return {
    view,
    moveDown,
    moveUp,
    collapseAll,
    expandAll,
    collapse,
    expand,
    close,
    openSelection,
    toggleOverlay,
    selectFirst,
    selectLast,
    openSearch,
    closeSearch,
    appendSearchChar,
    backspaceSearch
  };
};

const makePaletteView = () => {
  const open = vi.fn();
  const close = vi.fn();
  const moveNext = vi.fn();
  const movePrevious = vi.fn();
  const accept = vi.fn();
  const setQuery = vi.fn();
  return {
    view: { open, close, moveNext, movePrevious, accept, setQuery },
    open,
    close,
    moveNext,
    movePrevious,
    accept,
    setQuery
  };
};

const makeSearchView = () => {
  const open = vi.fn();
  const openGlobal = vi.fn();
  const close = vi.fn();
  const moveNext = vi.fn();
  const movePrevious = vi.fn();
  const accept = vi.fn();
  const setQuery = vi.fn();
  return {
    view: { open, openGlobal, close, moveNext, movePrevious, accept, setQuery },
    open,
    openGlobal,
    close,
    moveNext,
    movePrevious,
    accept,
    setQuery
  };
};

const makeOutlineView = () => {
  const open = vi.fn();
  const close = vi.fn();
  const moveNext = vi.fn();
  const movePrevious = vi.fn();
  const accept = vi.fn();
  return {
    view: { open, close, moveNext, movePrevious, accept },
    open,
    close,
    moveNext,
    movePrevious,
    accept
  };
};

const makeLinksView = () => {
  const open = vi.fn();
  const close = vi.fn();
  const moveNext = vi.fn();
  const movePrevious = vi.fn();
  const accept = vi.fn();
  const view: LinksView = { open, close, moveNext, movePrevious, accept };
  return { view, open, close, moveNext, movePrevious, accept };
};

const makeCaretView = () => {
  const toggle = vi.fn().mockReturnValue(true);
  const exit = vi.fn().mockReturnValue(true);
  const moveDown = vi.fn();
  const moveUp = vi.fn();
  const moveLeft = vi.fn();
  const moveRight = vi.fn();
  const moveToStart = vi.fn();
  const moveToEnd = vi.fn();
  const jumpParaForward = vi.fn();
  const jumpParaBackward = vi.fn();
  const enterVisual = vi.fn().mockReturnValue(true);
  const exitVisual = vi.fn().mockReturnValue(true);
  const extendDown = vi.fn();
  const extendUp = vi.fn();
  const extendLeft = vi.fn();
  const extendRight = vi.fn();
  const yank = vi.fn().mockReturnValue(true);
  const setMark = vi.fn();
  const jumpMark = vi.fn().mockReturnValue(true);
  const nextMatch = vi.fn().mockReturnValue(true);
  const prevMatch = vi.fn().mockReturnValue(true);
  const smartJump = vi.fn().mockReturnValue(true);
  const view: CaretView = {
    toggle,
    exit,
    moveDown,
    moveUp,
    moveLeft,
    moveRight,
    moveToStart,
    moveToEnd,
    jumpParaForward,
    jumpParaBackward,
    enterVisual,
    exitVisual,
    extendDown,
    extendUp,
    extendLeft,
    extendRight,
    yank,
    setMark,
    jumpMark,
    nextMatch,
    prevMatch,
    smartJump
  };
  return {
    view,
    toggle,
    exit,
    moveDown,
    moveUp,
    moveLeft,
    moveRight,
    moveToStart,
    moveToEnd,
    jumpParaForward,
    jumpParaBackward,
    enterVisual,
    exitVisual,
    extendDown,
    extendUp,
    extendLeft,
    extendRight,
    yank,
    setMark,
    jumpMark,
    nextMatch,
    prevMatch,
    smartJump
  };
};

const makeZoomView = () => {
  const fitWidth = vi.fn();
  const fitContentWidth = vi.fn();
  const fitPage = vi.fn();
  const zoomIn = vi.fn();
  const zoomOut = vi.fn();
  const view: ZoomView = { fitWidth, fitContentWidth, fitPage, zoomIn, zoomOut };
  return { view, fitWidth, fitContentWidth, fitPage, zoomIn, zoomOut };
};

const makeSetup = (overrideKeymap?: Map<string, string>) => {
  const stack = createContextStack();
  stack.push({ name: 'document', keymap: overrideKeymap ?? DOCUMENT_KEYMAP });
  const mocks = makeView();
  const tree = makeTreeView();
  const palette = makePaletteView();
  const search = makeSearchView();
  const outline = makeOutlineView();
  const links = makeLinksView();
  const caret = makeCaretView();
  const zoom = makeZoomView();
  const ctx: CommandContext = {
    document: mocks.view,
    contexts: stack,
    caret: caret.view,
    zoom: zoom.view,
    outline: outline.view,
    links: links.view,
    palette: palette.view,
    search: search.view,
    tree: tree.view,
    editor: { openCurrentNote: vi.fn().mockResolvedValue(undefined) },
    theme: {
      useSystem: vi.fn().mockResolvedValue(undefined),
      useLight: vi.fn().mockResolvedValue(undefined),
      useDark: vi.fn().mockResolvedValue(undefined),
      cycle: vi.fn().mockResolvedValue(undefined)
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
  const dispatcher = createDispatcher(stack, GLOBAL_KEYMAP, () => ctx);
  return { stack, ...mocks, tree, palette, search, outline, links, caret, zoom, ctx, dispatcher };
};

describe('chord normalization', () => {
  it('plain letter', () => {
    expect(normalizeChord({ key: 'j', ctrlKey: false, altKey: false, metaKey: false })).toBe('j');
  });

  it('shift gives uppercase via event.key', () => {
    expect(normalizeChord({ key: 'G', ctrlKey: false, altKey: false, metaKey: false })).toBe('G');
  });

  it('uses the physical letter key on a non-Latin layout', () => {
    expect(
      normalizeChord({
        key: 'о',
        code: 'KeyJ',
        ctrlKey: false,
        altKey: false,
        metaKey: false
      })
    ).toBe('j');
  });

  it('uses physical Shift+letter casing on a non-Latin layout', () => {
    expect(
      normalizeChord({
        key: 'Я',
        code: 'KeyZ',
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        shiftKey: true
      })
    ).toBe('Z');
  });

  it('honors an uppercase physical key even when an automation event omits shiftKey', () => {
    expect(
      normalizeChord({
        key: 'M',
        code: 'KeyM',
        ctrlKey: false,
        altKey: false,
        metaKey: false
      })
    ).toBe('M');
  });

  it('uses the physical key for control chords on a non-Latin layout', () => {
    expect(
      normalizeChord({
        key: 'и',
        code: 'KeyB',
        ctrlKey: true,
        altKey: false,
        metaKey: false
      })
    ).toBe('<C-b>');
  });

  it('maps physical punctuation and shifted digits to US shortcut labels', () => {
    expect(
      normalizeChord({
        key: '.',
        code: 'Slash',
        ctrlKey: false,
        altKey: false,
        metaKey: false
      })
    ).toBe('/');
    expect(
      normalizeChord({
        key: '%',
        code: 'Digit5',
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        shiftKey: true
      })
    ).toBe('%');
    expect(
      normalizeChord({
        key: ':',
        code: 'Semicolon',
        ctrlKey: false,
        altKey: false,
        metaKey: false
      })
    ).toBe(':');
  });

  it('ctrl chord', () => {
    expect(normalizeChord({ key: 'd', ctrlKey: true, altKey: false, metaKey: false })).toBe(
      '<C-d>'
    );
  });

  it('ctrl chord is lowercased', () => {
    expect(normalizeChord({ key: 'D', ctrlKey: true, altKey: false, metaKey: false })).toBe(
      '<C-d>'
    );
  });

  it('Enter is a plain canonical chord', () => {
    expect(normalizeChord({ key: 'Enter', ctrlKey: false, altKey: false, metaKey: false })).toBe(
      'Enter'
    );
  });

  it('modifier-only event returns null', () => {
    expect(
      normalizeChord({ key: 'Control', ctrlKey: true, altKey: false, metaKey: false })
    ).toBeNull();
  });

  it('meta key alone returns null', () => {
    expect(
      normalizeChord({ key: 'Meta', ctrlKey: false, altKey: false, metaKey: true })
    ).toBeNull();
  });

  it('cmd chords are left to the system on macOS', () => {
    expect(normalizeChord({ key: 'j', ctrlKey: false, altKey: false, metaKey: true })).toBeNull();
  });

  it('alt chords are left unhandled', () => {
    expect(normalizeChord({ key: 'j', ctrlKey: false, altKey: true, metaKey: false })).toBeNull();
  });

  it('composition events are left unhandled', () => {
    expect(
      normalizeChord({
        key: 'j',
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        isComposing: true
      })
    ).toBeNull();
  });
});

describe('headless dispatch — tree commands', () => {
  it('tree movement and open keys route to TreeView', () => {
    const { stack, tree, dispatcher } = makeSetup();
    stack.push({ name: 'tree', keymap: TREE_KEYMAP });

    expect(dispatcher.dispatch('j')).toBe('handled');
    expect(dispatcher.dispatch('k')).toBe('handled');
    expect(dispatcher.dispatch('l')).toBe('handled');
    expect(dispatcher.dispatch('h')).toBe('handled');
    expect(dispatcher.dispatch('Enter')).toBe('handled');

    expect(tree.moveDown).toHaveBeenCalledOnce();
    expect(tree.moveUp).toHaveBeenCalledOnce();
    expect(tree.expand).toHaveBeenCalledOnce();
    expect(tree.collapse).toHaveBeenCalledOnce();
    expect(tree.openSelection).toHaveBeenCalledOnce();
  });

  it('tree gg and G select first/last', () => {
    const { stack, tree, dispatcher } = makeSetup();
    stack.push({ name: 'tree', keymap: TREE_KEYMAP });

    expect(dispatcher.dispatch('g')).toBe('pending');
    expect(dispatcher.dispatch('g')).toBe('handled');
    expect(dispatcher.dispatch('G')).toBe('handled');

    expect(tree.selectFirst).toHaveBeenCalledOnce();
    expect(tree.selectLast).toHaveBeenCalledOnce();
  });

  it('tree zM and zR collapse and expand all folders', () => {
    const { stack, tree, dispatcher } = makeSetup();
    stack.push({ name: 'tree', keymap: TREE_KEYMAP });

    expect(dispatcher.dispatch('z')).toBe('pending');
    expect(dispatcher.dispatch('M')).toBe('handled');
    expect(dispatcher.dispatch('z')).toBe('pending');
    expect(dispatcher.dispatch('R')).toBe('handled');

    expect(tree.collapseAll).toHaveBeenCalledOnce();
    expect(tree.expandAll).toHaveBeenCalledOnce();
  });

  it('<C-b> global toggles tree from document and tree contexts', () => {
    const { stack, tree, dispatcher } = makeSetup();

    expect(dispatcher.dispatch('<C-b>')).toBe('handled');
    stack.push({ name: 'tree', keymap: TREE_KEYMAP });
    expect(dispatcher.dispatch('<C-b>')).toBe('handled');

    expect(tree.toggleOverlay).toHaveBeenCalledTimes(2);
  });

  it(': opens palette and / opens tree search from tree context', () => {
    const { stack, palette, tree, dispatcher } = makeSetup();
    stack.push({ name: 'tree', keymap: TREE_KEYMAP });

    expect(dispatcher.dispatch(':')).toBe('handled');
    expect(dispatcher.dispatch('/')).toBe('handled');

    expect(palette.open).toHaveBeenCalledOnce();
    expect(tree.openSearch).toHaveBeenCalledOnce();
  });

  it('<C-p> opens quick-open from the tree context', () => {
    const { stack, ctx, dispatcher } = makeSetup();
    stack.push({ name: 'tree', keymap: TREE_KEYMAP });

    expect(dispatcher.dispatch('<C-p>')).toBe('handled');

    expect(ctx.quickOpen.open).toHaveBeenCalledOnce();
  });

  it('tree-search context edits the tree filter query', () => {
    const { stack, tree, dispatcher } = makeSetup();
    stack.push({ name: 'tree-search', keymap: TREE_SEARCH_KEYMAP });

    expect(dispatcher.dispatch('a', 'ф')).toBe('handled');
    expect(dispatcher.dispatch('*', '*')).toBe('handled');
    expect(dispatcher.dispatch('Backspace')).toBe('handled');
    expect(dispatcher.dispatch('Escape')).toBe('handled');

    expect(tree.appendSearchChar).toHaveBeenCalledWith('ф');
    expect(tree.appendSearchChar).toHaveBeenCalledWith('*');
    expect(tree.backspaceSearch).toHaveBeenCalledOnce();
    expect(tree.closeSearch).toHaveBeenCalledOnce();
  });

  it('same j key routes by active context with no document scroll under tree', () => {
    const { stack, scrollByLines, tree, dispatcher } = makeSetup();
    stack.push({ name: 'tree', keymap: TREE_KEYMAP });

    expect(dispatcher.dispatch('j')).toBe('handled');
    expect(tree.moveDown).toHaveBeenCalledOnce();
    expect(scrollByLines).not.toHaveBeenCalled();

    stack.pop();
    expect(dispatcher.dispatch('j')).toBe('handled');
    expect(scrollByLines).toHaveBeenCalledWith(1);
    expect(tree.moveDown).toHaveBeenCalledOnce();
  });
});

describe('headless dispatch — document commands', () => {
  it('j → scrollByLines(1)', () => {
    const { scrollByLines, dispatcher } = makeSetup();
    expect(dispatcher.dispatch('j')).toBe('handled');
    expect(scrollByLines).toHaveBeenCalledWith(1);
  });

  it('k → scrollByLines(-1)', () => {
    const { scrollByLines, dispatcher } = makeSetup();
    expect(dispatcher.dispatch('k')).toBe('handled');
    expect(scrollByLines).toHaveBeenCalledWith(-1);
  });

  it('h/l → horizontal scrolling commands', () => {
    const { scrollLeft, scrollRight, dispatcher } = makeSetup();
    expect(dispatcher.dispatch('h')).toBe('handled');
    expect(dispatcher.dispatch('l')).toBe('handled');
    expect(scrollLeft).toHaveBeenCalledOnce();
    expect(scrollRight).toHaveBeenCalledOnce();
  });

  it('<C-d> → scrollByViewport(0.5)', () => {
    const { scrollByViewport, dispatcher } = makeSetup();
    expect(dispatcher.dispatch('<C-d>')).toBe('handled');
    expect(scrollByViewport).toHaveBeenCalledWith(0.5);
  });

  it('<C-u> → scrollByViewport(-0.5)', () => {
    const { scrollByViewport, dispatcher } = makeSetup();
    expect(dispatcher.dispatch('<C-u>')).toBe('handled');
    expect(scrollByViewport).toHaveBeenCalledWith(-0.5);
  });

  it('G → scrollToEnd', () => {
    const { scrollToEnd, dispatcher } = makeSetup();
    expect(dispatcher.dispatch('G')).toBe('handled');
    expect(scrollToEnd).toHaveBeenCalled();
  });

  it('n/N route to document match navigation', () => {
    const { nextMatch, prevMatch, dispatcher } = makeSetup();
    expect(dispatcher.dispatch('n')).toBe('handled');
    expect(dispatcher.dispatch('N')).toBe('handled');
    expect(nextMatch).toHaveBeenCalledOnce();
    expect(prevMatch).toHaveBeenCalledOnce();
  });

  it('zoom keys route to the zoom view', () => {
    const { zoom, dispatcher } = makeSetup();
    expect(dispatcher.dispatch('F1')).toBe('unhandled');
    expect(dispatcher.dispatch('=')).toBe('handled');
    expect(dispatcher.dispatch('F9')).toBe('handled');
    expect(dispatcher.dispatch('F10')).toBe('handled');
    expect(dispatcher.dispatch('+')).toBe('handled');
    expect(dispatcher.dispatch('-')).toBe('handled');
    expect(zoom.fitWidth).toHaveBeenCalledTimes(2);
    expect(zoom.fitContentWidth).toHaveBeenCalledOnce();
    expect(zoom.fitPage).not.toHaveBeenCalled();
    expect(zoom.zoomIn).toHaveBeenCalledOnce();
    expect(zoom.zoomOut).toHaveBeenCalledOnce();
  });

  it('unknown key → unhandled, no side effects', () => {
    const { scrollByLines, scrollToStart, dispatcher } = makeSetup();
    expect(dispatcher.dispatch('x')).toBe('unhandled');
    expect(scrollByLines).not.toHaveBeenCalled();
    expect(scrollToStart).not.toHaveBeenCalled();
  });

  it('s in document context dispatches caret.toggle', () => {
    const { caret, dispatcher } = makeSetup();
    expect(dispatcher.dispatch('s')).toBe('handled');
    expect(caret.toggle).toHaveBeenCalledOnce();
  });

  it('c is unhandled in document, caret, and visual contexts', () => {
    const { stack, dispatcher } = makeSetup();

    expect(dispatcher.dispatch('c')).toBe('unhandled');

    stack.push({ name: 'caret', keymap: CARET_KEYMAP });
    expect(dispatcher.dispatch('c')).toBe('unhandled');

    stack.pop();
    stack.push({ name: 'visual', keymap: VISUAL_KEYMAP });
    expect(dispatcher.dispatch('c')).toBe('unhandled');
  });

  it(': and / open palette/local search from document', () => {
    const { palette, search, dispatcher } = makeSetup();

    expect(dispatcher.dispatch(':')).toBe('handled');
    expect(dispatcher.dispatch('/')).toBe('handled');

    expect(palette.open).toHaveBeenCalledOnce();
    expect(search.open).toHaveBeenCalledOnce();
  });

  it('<C-p> opens quick-open from document', () => {
    const { ctx, dispatcher } = makeSetup();

    expect(dispatcher.dispatch('<C-p>')).toBe('handled');

    expect(ctx.quickOpen.open).toHaveBeenCalledOnce();
  });
});

describe('headless dispatch — caret and visual commands', () => {
  it('caret context routes motion, marks, and jump commands', () => {
    const { stack, caret, scrollLeft, scrollRight, dispatcher } = makeSetup();
    stack.push({ name: 'caret', keymap: CARET_KEYMAP });

    expect(dispatcher.dispatch('j')).toBe('handled');
    expect(dispatcher.dispatch('k')).toBe('handled');
    expect(dispatcher.dispatch('h')).toBe('handled');
    expect(dispatcher.dispatch('l')).toBe('handled');
    expect(dispatcher.dispatch('Enter')).toBe('handled');
    expect(dispatcher.dispatch('gd')).toBe('handled');
    expect(dispatcher.dispatch('n')).toBe('handled');
    expect(dispatcher.dispatch('N')).toBe('handled');
    expect(dispatcher.dispatch('m')).toBe('pending');
    expect(dispatcher.dispatch('a', 'ф')).toBe('handled');
    expect(dispatcher.dispatch("'")).toBe('pending');
    expect(dispatcher.dispatch('b', 'и')).toBe('handled');

    expect(caret.moveDown).toHaveBeenCalledOnce();
    expect(caret.moveUp).toHaveBeenCalledOnce();
    expect(caret.moveLeft).toHaveBeenCalledOnce();
    expect(caret.moveRight).toHaveBeenCalledOnce();
    expect(caret.smartJump).toHaveBeenCalledTimes(2);
    expect(caret.nextMatch).toHaveBeenCalledOnce();
    expect(caret.prevMatch).toHaveBeenCalledOnce();
    expect(caret.setMark).toHaveBeenCalledWith('a');
    expect(caret.jumpMark).toHaveBeenCalledWith('b');
    expect(scrollLeft).not.toHaveBeenCalled();
    expect(scrollRight).not.toHaveBeenCalled();
  });

  it('visual context routes selection and yank commands', () => {
    const { stack, caret, dispatcher } = makeSetup();
    stack.push({ name: 'visual', keymap: VISUAL_KEYMAP });

    expect(dispatcher.dispatch('j')).toBe('handled');
    expect(dispatcher.dispatch('k')).toBe('handled');
    expect(dispatcher.dispatch('y')).toBe('handled');
    expect(dispatcher.dispatch('Escape')).toBe('handled');

    expect(caret.extendDown).toHaveBeenCalledOnce();
    expect(caret.extendUp).toHaveBeenCalledOnce();
    expect(caret.yank).toHaveBeenCalledOnce();
    expect(caret.exitVisual).toHaveBeenCalledOnce();
  });
});

describe('sequence: gg → scrollToTop', () => {
  it('first g → pending', () => {
    const { scrollToStart, dispatcher } = makeSetup();
    expect(dispatcher.dispatch('g')).toBe('pending');
    expect(scrollToStart).not.toHaveBeenCalled();
  });

  it('g then g → scrollToStart (handled)', () => {
    const { scrollToStart, dispatcher } = makeSetup();
    dispatcher.dispatch('g');
    expect(dispatcher.dispatch('g')).toBe('handled');
    expect(scrollToStart).toHaveBeenCalledOnce();
  });

  it('g then non-matching key → unhandled, no scroll', () => {
    const { scrollToStart, dispatcher } = makeSetup();
    dispatcher.dispatch('g');
    expect(dispatcher.dispatch('x')).toBe('unhandled');
    expect(scrollToStart).not.toHaveBeenCalled();
  });
});

describe('sequence timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('g then timeout (>600 ms) → buffer cleared, subsequent key is fresh unhandled', () => {
    const { scrollToStart, dispatcher } = makeSetup();
    dispatcher.dispatch('g');
    vi.advanceTimersByTime(700);
    expect(dispatcher.dispatch('x')).toBe('unhandled');
    expect(scrollToStart).not.toHaveBeenCalled();
  });

  it('g then second g before timeout → scroll executes exactly once', () => {
    const { scrollToStart, dispatcher } = makeSetup();
    dispatcher.dispatch('g');
    vi.advanceTimersByTime(300);
    dispatcher.dispatch('g');
    vi.advanceTimersByTime(700);
    expect(scrollToStart).toHaveBeenCalledOnce();
  });
});

describe('palette/search fall-through', () => {
  it('palette control keys route to PaletteView while printables stay unhandled', () => {
    const { stack, palette, dispatcher } = makeSetup();
    stack.push({ name: 'palette', keymap: PALETTE_KEYMAP });

    expect(dispatcher.dispatch('ArrowDown')).toBe('handled');
    expect(dispatcher.dispatch('x')).toBe('unhandled');

    expect(palette.moveNext).toHaveBeenCalledOnce();
    expect(palette.accept).not.toHaveBeenCalled();
  });

  it('search control keys route to SearchView while printables stay unhandled', () => {
    const { stack, search, dispatcher } = makeSetup();
    stack.push({ name: 'search', keymap: SEARCH_KEYMAP });

    expect(dispatcher.dispatch('<C-p>')).toBe('handled');
    expect(dispatcher.dispatch('a')).toBe('unhandled');

    expect(search.movePrevious).toHaveBeenCalledOnce();
  });
});

describe('decoupling: keymap remapping changes dispatch without touching handlers', () => {
  it('rebind z → document.scrollToTop works without altering the handler', () => {
    const customKeymap = new Map<string, string>([['z', 'document.scrollToTop']]);
    const { scrollToStart, dispatcher } = makeSetup(customKeymap);
    expect(dispatcher.dispatch('z')).toBe('handled');
    expect(scrollToStart).toHaveBeenCalled();
  });

  it('rebind q → document.scrollLineDown routes to the same handler', () => {
    const customKeymap = new Map<string, string>([['q', 'document.scrollLineDown']]);
    const { scrollByLines, dispatcher } = makeSetup(customKeymap);
    expect(dispatcher.dispatch('q')).toBe('handled');
    expect(scrollByLines).toHaveBeenCalledWith(1);
  });
});
