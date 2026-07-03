import type { TextLayerModel } from '../../shared/worker/typst';

export type LinkTarget =
  | { readonly kind: 'anchor'; readonly id: string }
  // Note links carry the raw href + the note they were clicked from. Resolution to an
  // actual vault path needs the note list, which only App has — see resolveNoteHref.
  | { readonly kind: 'note'; readonly rawHref: string; readonly fromRelPath: string }
  | { readonly kind: 'external'; readonly url: string };

export interface CaretEngine {
  setTextLayer(model: TextLayerModel, container: HTMLElement, noteId?: string): void;
  enable(): void;
  disable(): void;
  readonly enabled: boolean;
  moveDown(): void;
  moveUp(): void;
  moveLeft(): void;
  moveRight(): void;
  moveToStart(): void;
  moveToEnd(): void;
  jumpParaForward(): void;
  jumpParaBackward(): void;
  enterVisual(): boolean;
  exitVisual(): boolean;
  readonly inVisual: boolean;
  extendDown(): void;
  extendUp(): void;
  extendLeft(): void;
  extendRight(): void;
  yank(): boolean;
  setMark(char: string): void;
  jumpToMark(char: string): boolean;
  setLastQuery(query: string): void;
  nextMatch(): boolean;
  prevMatch(): boolean;
  smartJump(): LinkTarget | null;
  dispose(): void;
}

type CharPosition = { readonly tselIndex: number; readonly charIndex: number };

export const createCaretEngine = (
  container: HTMLElement,
  scrollToOffset: (y: number) => void,
  _revealSearchTarget: (target: { query: string }) => boolean
): CaretEngine => {
  let _model: TextLayerModel | null = null;
  let _tselElements: HTMLElement[] = [];
  let _tselIndexByElement = new WeakMap<HTMLElement, number>();
  let _linkMap = new Map<number, LinkTarget>();
  let _charPositions: CharPosition[] = [];
  let _tselFirstCharPos: number[] = [];
  let _caretPos = -1;
  let _enabled = false;
  let _inVisual = false;
  let _visualAnchorPos = -1;
  let _marks = new Map<string, number>();
  let _lastQuery: string | undefined;
  let _caretEl: HTMLDivElement | null = null;
  let _selectionEls: HTMLDivElement[] = [];

  const getDocumentNode = (): HTMLElement | null =>
    container.querySelector<HTMLElement>('.typst-document');

  const getTsels = (): readonly HTMLElement[] => _tselElements;

  const buildCharPositions = (): void => {
    _charPositions = [];
    _tselFirstCharPos = [];
    for (let ti = 0; ti < _tselElements.length; ti++) {
      _tselFirstCharPos[ti] = _charPositions.length;
      const text = _tselElements[ti]!.textContent ?? '';
      const len = Math.max(1, text.length);
      for (let ci = 0; ci < len; ci++) {
        _charPositions.push({ tselIndex: ti, charIndex: ci });
      }
    }
  };

  const charPosToTselIndex = (pos: number): number =>
    _charPositions[pos]?.tselIndex ?? -1;

  const tselIndexToFirstCharPos = (ti: number): number =>
    _tselFirstCharPos[ti] ?? -1;

  const clampPos = (pos: number): number => {
    const maxPos = _charPositions.length - 1;
    if (maxPos < 0) return -1;
    return Math.min(maxPos, Math.max(0, pos));
  };

  const getCharRect = (pos: number): DOMRect | null => {
    if (pos < 0 || pos >= _charPositions.length) return null;
    const { tselIndex, charIndex } = _charPositions[pos]!;
    const tsel = _tselElements[tselIndex];
    if (!tsel) return null;
    const textNode = tsel.firstChild;
    if (
      typeof document.createRange === 'function' &&
      textNode?.nodeType === 3 &&
      charIndex < (textNode.textContent?.length ?? 0)
    ) {
      const range = document.createRange();
      range.setStart(textNode, charIndex);
      range.setEnd(textNode, charIndex + 1);
      const r = range.getBoundingClientRect();
      if (r.width > 0) return r;
    }
    return tsel.getBoundingClientRect() as DOMRect;
  };

  const findMiddleVisibleSpan = (): number => {
    const tsels = getTsels();
    if (tsels.length === 0) return 0;

    const containerRect = container.getBoundingClientRect();
    const viewportMid = containerRect.top + containerRect.height / 2;

    let bestIndex = 0;
    let bestDistance = Infinity;

    for (let index = 0; index < tsels.length; index += 1) {
      const rect = tsels[index]!.getBoundingClientRect();
      if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) continue;
      const distance = Math.abs((rect.top + rect.bottom) / 2 - viewportMid);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    return bestIndex;
  };

  const findMiddleVisiblePos = (): number => {
    const ti = findMiddleVisibleSpan();
    return tselIndexToFirstCharPos(ti);
  };

  const clearOverlays = (): void => {
    _caretEl?.remove();
    _caretEl = null;
    for (const el of _selectionEls) el.remove();
    _selectionEls = [];
  };

  const ensureVisible = (tselIndex: number): void => {
    const tsel = getTsels()[tselIndex];
    if (!tsel) return;
    const rect = tsel.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (rect.top >= containerRect.top && rect.bottom <= containerRect.bottom) return;
    scrollToOffset(
      Math.max(0, rect.top - containerRect.top + container.scrollTop - container.clientHeight * 0.35)
    );
  };

  const ensureVisiblePos = (pos: number): void => {
    const ti = charPosToTselIndex(pos);
    if (ti >= 0) ensureVisible(ti);
  };

  const paintCaret = (): void => {
    clearOverlays();
    if (!_enabled || _inVisual || _caretPos < 0) return;

    const docNode = getDocumentNode();
    if (!docNode) return;

    ensureVisiblePos(_caretPos);

    const docRect = docNode.getBoundingClientRect();
    const rect = getCharRect(_caretPos);
    if (!rect) return;

    const el = document.createElement('div');
    el.className = 'folea-caret';
    el.dataset.testid = 'folea-caret';
    el.style.position = 'absolute';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '10';
    el.style.left = `${rect.left - docRect.left}px`;
    el.style.top = `${rect.top - docRect.top}px`;
    el.style.width = `${Math.max(1, rect.width)}px`;
    el.style.height = `${Math.max(1, rect.height)}px`;

    docNode.append(el);
    _caretEl = el as unknown as HTMLDivElement;
  };

  const paintSelection = (): void => {
    clearOverlays();
    if (!_inVisual || _caretPos < 0 || _visualAnchorPos < 0) return;

    const docNode = getDocumentNode();
    if (!docNode) return;

    ensureVisiblePos(_caretPos);

    const docRect = docNode.getBoundingClientRect();
    const lo = Math.min(_visualAnchorPos, _caretPos);
    const hi = Math.max(_visualAnchorPos, _caretPos);

    for (let pos = lo; pos <= hi; pos++) {
      const rect = getCharRect(pos);
      if (!rect) continue;

      const el = document.createElement('div');
      el.className = 'folea-selection-span';
      el.dataset.testid = 'folea-selection-span';
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '9';
      el.style.left = `${rect.left - docRect.left}px`;
      el.style.top = `${rect.top - docRect.top}px`;
      el.style.width = `${Math.max(1, rect.width)}px`;
      el.style.height = `${Math.max(1, rect.height)}px`;
      docNode.append(el);
      _selectionEls.push(el as unknown as HTMLDivElement);
    }
  };

  const repaint = (): void => {
    if (_inVisual) {
      paintSelection();
      return;
    }
    paintCaret();
  };

  const nextSpanBelow = (from: number): number => {
    const tsels = getTsels();
    if (tsels.length === 0) return -1;
    if (from < 0) return 0;

    const current = tsels[Math.min(from, tsels.length - 1)]!;
    const currentRect = current.getBoundingClientRect();
    const threshold = (currentRect.top + currentRect.bottom) / 2;
    for (let index = from + 1; index < tsels.length; index += 1) {
      const r = tsels[index]!.getBoundingClientRect();
      if ((r.top + r.bottom) / 2 > threshold) return index;
    }
    return tsels.length - 1;
  };

  const nextSpanAbove = (from: number): number => {
    const tsels = getTsels();
    if (tsels.length === 0) return -1;
    if (from < 0) return tsels.length - 1;

    const current = tsels[Math.min(from, tsels.length - 1)]!;
    const currentRect = current.getBoundingClientRect();
    const threshold = (currentRect.top + currentRect.bottom) / 2;
    for (let index = from - 1; index >= 0; index -= 1) {
      const r = tsels[index]!.getBoundingClientRect();
      if ((r.top + r.bottom) / 2 < threshold) return index;
    }
    return 0;
  };

  const isParagraphBoundary = (ti: number): boolean => {
    const tsels = getTsels();
    if (ti < 0 || ti >= tsels.length - 1) return false;
    const curr = tsels[ti]!.getBoundingClientRect();
    const next = tsels[ti + 1]!.getBoundingClientRect();
    return next.top - curr.bottom > Math.max(4, curr.height * 0.5);
  };

  const findParaStart = (ti: number): number => {
    for (let i = ti; i > 0; i--) {
      if (isParagraphBoundary(i - 1)) return i;
    }
    return 0;
  };

  let _currentNoteRelPath = '';

  const buildLinkMap = (): void => {
    _linkMap = new Map();
    const docNode = getDocumentNode();
    if (!docNode) return;

    for (const anchor of docNode.querySelectorAll<HTMLElement>('a')) {
      const href = anchor.getAttribute('href') ?? anchor.getAttribute('xlink:href') ?? '';
      if (!href) continue;
      let target: LinkTarget | undefined;

      if (href.startsWith('#')) {
        target = { kind: 'anchor', id: href.slice(1) };
      } else if (href.startsWith('http://') || href.startsWith('https://')) {
        target = { kind: 'external', url: href };
      } else {
        target = { kind: 'note', rawHref: href, fromRelPath: _currentNoteRelPath };
      }

      if (!target) continue;

      for (const tsel of anchor.querySelectorAll<HTMLElement>('.tsel')) {
        const index = _tselIndexByElement.get(tsel);
        if (index !== undefined) _linkMap.set(index, target);
      }
    }
  };

  const searchSpanIndex = (startIndex: number, forward: boolean): number => {
    const tsels = getTsels();
    const query = _lastQuery?.trim().toLowerCase();
    if (!query || tsels.length === 0) return -1;

    const count = tsels.length;
    const normalizedStart = ((startIndex % count) + count) % count;
    for (let offset = 0; offset < count; offset += 1) {
      const index = forward
        ? (normalizedStart + offset) % count
        : (normalizedStart - offset + count) % count;
      const text = tsels[index]!.textContent?.toLowerCase() ?? '';
      if (text.includes(query)) return index;
    }
    return -1;
  };

  const moveToPos = (pos: number): void => {
    const nextPos = clampPos(pos);
    if (nextPos < 0) return;
    _caretPos = nextPos;
    ensureVisiblePos(_caretPos);
    repaint();
  };

  const exitVisualInternal = (): boolean => {
    if (!_inVisual) return true;
    _inVisual = false;
    _visualAnchorPos = -1;
    repaint();
    return true;
  };

  const zoomListener = (): void => {
    repaint();
  };

  window.addEventListener('folea:zoom-changed', zoomListener);

  return {
    setTextLayer(model: TextLayerModel, domContainer: HTMLElement, noteId?: string): void {
      const previousModel = _model;
      _model = model;
      _tselElements = [...domContainer.querySelectorAll<HTMLElement>('.typst-document .tsel')];
      _tselIndexByElement = new WeakMap(
        _tselElements.map((element, index) => [element, index] as const)
      );
      _currentNoteRelPath = noteId ?? '';
      buildLinkMap();
      buildCharPositions();
      _inVisual = false;
      _visualAnchorPos = -1;

      if (previousModel && previousModel.text === model.text) {
        _caretPos = clampPos(_caretPos);
      } else if (_charPositions.length > 0) {
        _caretPos = _enabled ? findMiddleVisiblePos() : -1;
      } else {
        _caretPos = -1;
      }

      clearOverlays();
      repaint();
    },
    enable(): void {
      _enabled = true;
      if (_caretPos < 0 && _charPositions.length > 0) {
        _caretPos = findMiddleVisiblePos();
      }
      repaint();
    },
    disable(): void {
      _enabled = false;
      exitVisualInternal();
      clearOverlays();
    },
    get enabled(): boolean {
      return _enabled;
    },
    moveDown(): void {
      const ti = charPosToTselIndex(_caretPos);
      const nextTi = nextSpanBelow(ti >= 0 ? ti : 0);
      moveToPos(tselIndexToFirstCharPos(nextTi));
    },
    moveUp(): void {
      const ti = charPosToTselIndex(_caretPos);
      const prevTi = nextSpanAbove(ti >= 0 ? ti : getTsels().length - 1);
      moveToPos(tselIndexToFirstCharPos(prevTi));
    },
    moveLeft(): void {
      moveToPos(_caretPos - 1);
    },
    moveRight(): void {
      moveToPos(_caretPos + 1);
    },
    moveToStart(): void {
      moveToPos(0);
    },
    moveToEnd(): void {
      moveToPos(_charPositions.length - 1);
    },
    jumpParaForward(): void {
      const ti = charPosToTselIndex(_caretPos);
      if (ti < 0) return;
      const tsels = getTsels();
      let nextTi = tsels.length - 1;
      for (let i = ti; i < tsels.length - 1; i++) {
        if (isParagraphBoundary(i)) {
          nextTi = i + 1;
          break;
        }
      }
      const pos = tselIndexToFirstCharPos(nextTi);
      if (pos >= 0) moveToPos(pos);
    },
    jumpParaBackward(): void {
      const ti = charPosToTselIndex(_caretPos);
      if (ti < 0) return;
      const paraStart = findParaStart(ti);
      if (paraStart < ti) {
        const pos = tselIndexToFirstCharPos(paraStart);
        if (pos >= 0) { moveToPos(pos); return; }
      }
      if (paraStart > 0) {
        const prevParaStart = findParaStart(paraStart - 1);
        const pos = tselIndexToFirstCharPos(prevParaStart);
        if (pos >= 0) moveToPos(pos);
      }
    },
    enterVisual(): boolean {
      if (!_enabled || _caretPos < 0) return false;
      _inVisual = true;
      _visualAnchorPos = _caretPos;
      repaint();
      return true;
    },
    exitVisual(): boolean {
      return exitVisualInternal();
    },
    get inVisual(): boolean {
      return _inVisual;
    },
    extendDown(): void {
      if (!_inVisual) return;
      const ti = charPosToTselIndex(_caretPos);
      const nextTi = nextSpanBelow(ti >= 0 ? ti : 0);
      _caretPos = clampPos(tselIndexToFirstCharPos(nextTi));
      _visualAnchorPos = Math.max(0, _visualAnchorPos);
      repaint();
    },
    extendUp(): void {
      if (!_inVisual) return;
      const ti = charPosToTselIndex(_caretPos);
      const prevTi = nextSpanAbove(ti >= 0 ? ti : getTsels().length - 1);
      _caretPos = clampPos(tselIndexToFirstCharPos(prevTi));
      _visualAnchorPos = Math.max(0, _visualAnchorPos);
      repaint();
    },
    extendLeft(): void {
      if (!_inVisual) return;
      _caretPos = clampPos(_caretPos - 1);
      repaint();
    },
    extendRight(): void {
      if (!_inVisual) return;
      _caretPos = clampPos(_caretPos + 1);
      repaint();
    },
    yank(): boolean {
      if (!_inVisual || _caretPos < 0 || _visualAnchorPos < 0) return false;

      const lo = Math.min(_visualAnchorPos, _caretPos);
      const hi = Math.max(_visualAnchorPos, _caretPos);
      let text = '';
      for (let pos = lo; pos <= hi; pos++) {
        const cp = _charPositions[pos];
        if (!cp) continue;
        const chars = _tselElements[cp.tselIndex]?.textContent ?? '';
        if (cp.charIndex < chars.length) text += chars[cp.charIndex];
      }

      exitVisualInternal();
      const clipboard = navigator.clipboard;
      if (clipboard) {
        void clipboard.writeText(text).catch(() => {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.append(textarea);
          textarea.select();
          document.execCommand('copy');
          textarea.remove();
        });
        return true;
      }

      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      return true;
    },
    setMark(char: string): void {
      if (!_enabled || _caretPos < 0) return;
      const mark = char.toLowerCase();
      if (!/^[a-z]$/.test(mark)) return;
      _marks.set(mark, _caretPos);
    },
    jumpToMark(char: string): boolean {
      const mark = char.toLowerCase();
      if (!/^[a-z]$/.test(mark)) return true;
      const pos = _marks.get(mark);
      if (pos === undefined) return true;
      moveToPos(pos);
      return true;
    },
    setLastQuery(query: string): void {
      _lastQuery = query.trim();
    },
    nextMatch(): boolean {
      const ti = charPosToTselIndex(_caretPos);
      const start = ti >= 0 ? ti + 1 : 0;
      const matchTi = searchSpanIndex(start, true);
      if (matchTi < 0) return false;
      const pos = tselIndexToFirstCharPos(matchTi);
      if (pos < 0) return false;
      _caretPos = pos;
      ensureVisiblePos(_caretPos);
      repaint();
      return true;
    },
    prevMatch(): boolean {
      const ti = charPosToTselIndex(_caretPos);
      const start = ti >= 0 ? ti - 1 : _tselElements.length - 1;
      const matchTi = searchSpanIndex(start, false);
      if (matchTi < 0) return false;
      const pos = tselIndexToFirstCharPos(matchTi);
      if (pos < 0) return false;
      _caretPos = pos;
      ensureVisiblePos(_caretPos);
      repaint();
      return true;
    },
    smartJump(): LinkTarget | null {
      const ti = charPosToTselIndex(_caretPos);
      if (ti < 0) return null;
      return _linkMap.get(ti) ?? null;
    },
    dispose(): void {
      clearOverlays();
      _model = null;
      _tselElements = [];
      _tselIndexByElement = new WeakMap();
      _linkMap = new Map();
      _charPositions = [];
      _tselFirstCharPos = [];
      _caretPos = -1;
      _enabled = false;
      _inVisual = false;
      _visualAnchorPos = -1;
      _marks = new Map();
      _lastQuery = undefined;
    }
  };
};
