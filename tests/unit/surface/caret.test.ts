import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCaretEngine } from '../../../src/renderer/surface/caret';
import type { TextLayerModel } from '../../../src/shared/worker/typst';

type Rect = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
};

type FakeElement = {
  style: Record<string, string>;
  dataset: Record<string, string>;
  className: string;
  textContent: string;
  appended: unknown[];
  removed: boolean;
  getBoundingClientRect: () => Rect;
  append: (...nodes: unknown[]) => void;
  remove: () => void;
  querySelector?: (selector: string) => FakeElement | null;
  querySelectorAll: (selector: string) => readonly FakeElement[];
};

const makeRect = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height
});

const makeElement = (
  rect: Rect,
  querySelectorAll: (selector: string) => readonly FakeElement[] = () => [],
  querySelector: (selector: string) => FakeElement | null = () => null
): FakeElement =>
  ({
    style: {},
    dataset: {},
    className: '',
    textContent: '',
    appended: [],
    removed: false,
    getBoundingClientRect: () => rect,
    append(...nodes: unknown[]) {
      this.appended.push(...nodes);
    },
    remove() {
      this.removed = true;
    },
    querySelector,
    querySelectorAll
  }) as FakeElement;

const makeModel = (spans: readonly { readonly text: string; readonly top: number }[]): TextLayerModel =>
  ({
    version: 1,
    text: spans.map((span) => span.text).join(''),
    spans: spans.map((span) => ({
      text: span.text,
      page: 0,
      x: 0,
      y: span.top,
      width: 8,
      height: 10
    })),
    pages: [{ page: 0, width: 100, height: 100 }]
  }) as TextLayerModel;

const installGlobals = (): void => {
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  });

  vi.stubGlobal('document', {
    createElement: vi.fn(() => makeElement(makeRect(0, 0, 0, 0))),
    body: {
      append: vi.fn()
    },
    execCommand: vi.fn().mockReturnValue(true)
  });
};

const buildEnvironment = (config: {
  readonly containerRect: Rect;
  readonly documentRect: Rect;
  readonly tselRects: readonly Rect[];
  readonly scrollTop?: number;
  readonly scrollLeft?: number;
  readonly scrollWidth?: number;
  readonly clientWidth?: number;
  readonly clientHeight?: number;
}) => {
  const tselElements = config.tselRects.map((rect) => makeElement(rect));
  const documentNode = makeElement(
    config.documentRect,
    (selector) => (selector === 'a[href]' ? [] : selector === '.tsel' ? tselElements : []),
    () => null
  );
  const container = makeElement(
    config.containerRect,
    (selector) => (selector === '.typst-document .tsel' ? tselElements : []),
    (selector) => (selector === '.typst-document' ? documentNode : null)
  ) as FakeElement & {
    scrollTop: number;
    scrollLeft: number;
    scrollWidth: number;
    clientWidth: number;
    clientHeight: number;
  };

  container.scrollTop = config.scrollTop ?? 0;
  container.scrollLeft = config.scrollLeft ?? 0;
  container.scrollWidth = config.scrollWidth ?? config.containerRect.width;
  container.clientWidth = config.clientWidth ?? config.containerRect.width;
  container.clientHeight = config.clientHeight ?? config.containerRect.height;

  const scrollToOffset = vi.fn();
  const engine = createCaretEngine(container as unknown as HTMLElement, scrollToOffset, () => false);

  return {
    engine,
    container,
    documentNode,
    tselElements,
    scrollToOffset
  };
};

const getCaretOverlay = (documentNode: FakeElement): FakeElement | undefined =>
  documentNode.appended.find(
    (node): node is FakeElement =>
      typeof node === 'object' &&
      node !== null &&
      'dataset' in node &&
      'removed' in node &&
      (node as { dataset?: Record<string, string> }).dataset?.testid === 'folea-caret' &&
      (node as { removed: boolean }).removed === false
  );

beforeEach(() => {
  installGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('caret overlay positioning', () => {
  it('setTextLayer resets the caret index on a new document until enable() runs', () => {
    const { engine, container, documentNode } = buildEnvironment({
      containerRect: makeRect(0, 0, 200, 100),
      documentRect: makeRect(10, 10, 180, 100),
      tselRects: [makeRect(20, 18, 20, 10), makeRect(20, 43, 20, 10), makeRect(20, 68, 20, 10)],
      scrollTop: 40
    });

    engine.setTextLayer(
      makeModel([
        { text: 'one', top: 18 },
        { text: 'two', top: 43 },
        { text: 'three', top: 68 }
      ]),
      (container as unknown) as HTMLElement
    );
    engine.enable();

    expect(getCaretOverlay(documentNode)).toBeDefined();

    engine.disable();
    engine.setTextLayer(
      makeModel([
        { text: 'uno', top: 18 },
        { text: 'dos', top: 43 },
        { text: 'tres', top: 68 }
      ]),
      (container as unknown) as HTMLElement
    );

    expect(getCaretOverlay(documentNode)).toBeUndefined();
  });

  it('positionElement uses document-relative y without scrollTop', () => {
    const { engine, container, documentNode } = buildEnvironment({
      containerRect: makeRect(0, 0, 200, 120),
      documentRect: makeRect(10, 10, 180, 120),
      tselRects: [makeRect(40, 50, 24, 12)],
      scrollTop: 300
    });

    engine.setTextLayer(
      makeModel([{ text: 'alpha', top: 50 }]),
      (container as unknown) as HTMLElement
    );
    engine.enable();

    const caret = getCaretOverlay(documentNode);
    expect(caret).toBeDefined();
    expect(caret?.style.top).toBe('40px');
    expect(caret?.style.left).toBe('30px');
  });

  it('enable() places caret at middle visible span', () => {
    const { engine, container, documentNode } = buildEnvironment({
      containerRect: makeRect(0, 0, 200, 100),
      documentRect: makeRect(10, 10, 180, 100),
      tselRects: [makeRect(20, 18, 20, 10), makeRect(20, 43, 20, 10), makeRect(20, 68, 20, 10)],
      scrollTop: 40
    });

    engine.setTextLayer(
      makeModel([
        { text: 'one', top: 18 },
        { text: 'two', top: 43 },
        { text: 'three', top: 68 }
      ]),
      (container as unknown) as HTMLElement
    );
    engine.enable();

    const caret = getCaretOverlay(documentNode);
    expect(caret).toBeDefined();
    expect(caret?.style.top).toBe('33px');
    expect(caret?.style.left).toBe('10px');
  });
});
