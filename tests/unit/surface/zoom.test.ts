import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createZoomController,
  getHorizontalCenterRatio,
  getScrollLeftForHorizontalCenter
} from '../../../src/renderer/surface/zoom';

type FakeStyle = Record<string, string>;

type FakeClassList = {
  readonly toggle: ReturnType<typeof vi.fn>;
};

type FakeElement = {
  readonly style: FakeStyle;
  readonly classList: FakeClassList;
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly localName?: string;
  readonly getBBox?: () => { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly closest?: () => FakeElement | null;
  readonly getAttribute?: () => string | null;
  readonly getBoundingClientRect: () => { readonly left: number; readonly width: number };
  readonly querySelectorAll?: () => readonly FakeElement[];
};

const makeElement = (
  clientWidth = 0,
  clientHeight = 0,
  children: readonly FakeElement[] = [],
  left = 0
): FakeElement => ({
  style: {},
  classList: { toggle: vi.fn() },
  clientWidth,
  clientHeight,
  closest: () => null,
  getAttribute: () => null,
  getBoundingClientRect: () => ({ left, width: clientWidth }),
  querySelectorAll: () => children
});

const makeSvgGraphic = (
  localName: string,
  bbox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
): FakeElement => ({
  style: {},
  classList: { toggle: vi.fn() },
  clientWidth: 0,
  clientHeight: 0,
  localName,
  getBBox: () => bbox,
  closest: () => null,
  getAttribute: () => null,
  getBoundingClientRect: () => ({ left: 0, width: bbox.width }),
  querySelectorAll: () => []
});

const installGlobals = (devicePixelRatio: number): void => {
  vi.stubGlobal('window', {
    devicePixelRatio,
    dispatchEvent: vi.fn()
  });
  vi.stubGlobal('CustomEvent', class CustomEvent<T> {
    readonly type: string;
    readonly detail: T;

    constructor(type: string, init: { readonly detail: T }) {
      this.type = type;
      this.detail = init.detail;
    }
  });
  vi.stubGlobal('getComputedStyle', () => ({
    paddingLeft: '32px',
    paddingRight: '32px',
    paddingTop: '28px',
    paddingBottom: '28px'
  }));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('zoom controller', () => {
  it('preserves the horizontal center ratio across content width changes', () => {
    const centerRatio = getHorizontalCenterRatio({
      viewportCenterX: 500,
      contentLeft: 250,
      contentWidth: 1000
    });

    expect(centerRatio).toBe(0.25);
    expect(
      getScrollLeftForHorizontalCenter({
        centerRatio,
        viewportWidth: 500,
        contentWidth: 1500
      })
    ).toBe(125);
  });

  it('fitWidth subtracts surface padding and snaps scale to device pixels', () => {
    installGlobals(2);
    const container = makeElement(1001, 800);
    const documentNode = makeElement();
    const svgElement = makeElement();
    const zoom = createZoomController(container as unknown as HTMLElement);

    zoom.setArtifact(
      documentNode as unknown as HTMLElement,
      svgElement as unknown as SVGElement,
      700,
      900,
      1,
      { x: 100, y: 80, width: 400, height: 120 }
    );

    expect(documentNode.style.width).toBe('937px');
    expect(documentNode.style.minHeight).toBe('1204.7142857142858px');
    expect(svgElement.style.width).toBe('700px');
    expect(svgElement.style.height).toBe('900px');
    expect(svgElement.style.transform).toBe('scale(1.3385714285714285)');
    expect(zoom.getState()).toEqual({ level: 1.3385714285714285, mode: 'fitWidth' });
  });

  it('fitPage snaps by single-page height', () => {
    installGlobals(2);
    const container = makeElement(1001, 803);
    const documentNode = makeElement();
    const svgElement = makeElement();
    const zoom = createZoomController(container as unknown as HTMLElement);

    zoom.setArtifact(
      documentNode as unknown as HTMLElement,
      svgElement as unknown as SVGElement,
      700,
      1800,
      2
    );
    zoom.fitPage();

    expect(documentNode.style.width).toBe('581px');
    expect(documentNode.style.minHeight).toBe('1494px');
    expect(svgElement.style.transform).toBe('scale(0.83)');
  });

  it('fitContentWidth fits and centers visible content instead of the page box', () => {
    installGlobals(2);
    const pageBackground = makeSvgGraphic('rect', { x: 0, y: 0, width: 700, height: 900 });
    const content = makeSvgGraphic('foreignObject', { x: 100, y: 80, width: 400, height: 120 });
    const container = makeElement(1001, 800);
    const documentNode = makeElement();
    const svgElement = makeElement(0, 0, [pageBackground, content]);
    const zoom = createZoomController(container as unknown as HTMLElement);

    zoom.setArtifact(
      documentNode as unknown as HTMLElement,
      svgElement as unknown as SVGElement,
      700,
      900,
      1
    );
    zoom.fitContentWidth();

    expect(documentNode.style.width).toBe('1001px');
    expect(documentNode.style.maxWidth).toBe('none');
    expect(svgElement.style.left).toBe('-267.25px');
    expect(svgElement.style.transform).toBe('scale(2.4525)');
    expect(zoom.getState()).toEqual({ level: 2.4525, mode: 'fitContentWidth' });
  });
});
