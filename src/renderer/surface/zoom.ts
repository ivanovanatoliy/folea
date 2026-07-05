export type ZoomMode = 'fitWidth' | 'fitContentWidth' | 'fitPage' | 'fixed';

export interface ZoomState {
  readonly level: number;
  readonly mode: ZoomMode;
}

export interface ZoomController {
  setArtifact(
    documentNode: HTMLElement,
    svgElement: SVGElement,
    artifactWidth: number,
    artifactHeight: number,
    numPages: number,
    contentBounds?: ContentBounds | null
  ): void;
  reapply(): void;
  fitWidth(): void;
  fitContentWidth(): void;
  fitPage(): void;
  zoomIn(): void;
  zoomOut(): void;
  getState(): ZoomState;
  setState(state: ZoomState): void;
}

export const createZoomController = (container: HTMLElement): ZoomController => {
  let _level = 1;
  let _mode: ZoomMode = 'fitWidth';
  let _documentNode: HTMLElement | null = null;
  let _svgElement: SVGElement | null = null;
  let _artifactWidth = 0;
  let _artifactHeight = 0;
  let _numPages = 1;
  let _contentBounds: ContentBounds | null = null;
  let _snapAxis: 'width' | 'height' = 'width';
  const horizontalContentGapPx = 10;

  const snapScaleToDevicePixels = (level: number): number => {
    const axisSize =
      _mode === 'fitContentWidth' && _contentBounds
        ? _contentBounds.width
        : _snapAxis === 'height'
          ? _artifactHeight
          : _artifactWidth;
    const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const physicalPixels = Math.max(1, Math.round(axisSize * level * devicePixelRatio));
    return physicalPixels / (axisSize * devicePixelRatio);
  };

  const applyLevel = (): void => {
    if (!_documentNode || !_svgElement || _artifactWidth <= 0 || _artifactHeight <= 0) {
      return;
    }

    const previousWidth = _documentNode.offsetWidth || parseFloat(_documentNode.style.width) || 0;
    const containerRect = container.getBoundingClientRect();
    const documentRect = _documentNode.getBoundingClientRect();
    const centerRatio = getHorizontalCenterRatio({
      viewportCenterX: containerRect.left + container.clientWidth / 2,
      contentLeft: documentRect.left,
      contentWidth: previousWidth
    });
    const appliedLevel = snapScaleToDevicePixels(_level);
    const style = getComputedStyle(container);
    const paddingLeft = parseFloat(style.paddingLeft);
    const contentOffsetLeft =
      _mode === 'fitContentWidth' && _contentBounds
        ? horizontalContentGapPx - paddingLeft - _contentBounds.x * appliedLevel
        : 0;
    const width =
      _mode === 'fitContentWidth' && _contentBounds
        ? Math.max(1, _contentBounds.width * appliedLevel + horizontalContentGapPx * 2)
        : Math.max(1, _artifactWidth * appliedLevel);
    const height = Math.max(1, _artifactHeight * appliedLevel);
    _documentNode.style.width = `${width}px`;
    _documentNode.style.minHeight = `${height}px`;
    _documentNode.style.maxWidth = _mode === 'fitContentWidth' ? 'none' : '';
    _svgElement.style.position = 'relative';
    _svgElement.style.left = `${contentOffsetLeft}px`;
    _svgElement.style.width = `${_artifactWidth}px`;
    _svgElement.style.height = `${_artifactHeight}px`;
    _svgElement.style.transform = `scale(${appliedLevel})`;
    container.classList.toggle('zoom-fixed', _mode === 'fixed');
    container.scrollLeft = getScrollLeftForHorizontalCenter({
      centerRatio,
      viewportWidth: container.clientWidth,
      contentWidth: width
    });

    window.dispatchEvent(
      new CustomEvent<ZoomState>('folea:zoom-changed', {
        detail: { level: appliedLevel, mode: _mode }
      })
    );
  };

  return {
    setArtifact(
      documentNode: HTMLElement,
      svgElement: SVGElement,
      artifactWidth: number,
      artifactHeight: number,
      numPages: number,
      contentBounds?: ContentBounds | null
    ): void {
      _documentNode = documentNode;
      _svgElement = svgElement;
      _artifactWidth = artifactWidth;
      _artifactHeight = artifactHeight;
      _numPages = Math.max(1, numPages);
      _contentBounds =
        contentBounds ?? getVisibleContentBounds(svgElement, artifactWidth, artifactHeight);
      this.reapply();
    },
    reapply(): void {
      if (_mode === 'fitWidth') {
        this.fitWidth();
        return;
      }

      if (_mode === 'fitPage') {
        this.fitPage();
        return;
      }

      if (_mode === 'fitContentWidth') {
        this.fitContentWidth();
        return;
      }

      applyLevel();
    },
    fitWidth(): void {
      _mode = 'fitWidth';
      if (_artifactWidth <= 0) {
        return;
      }

      const style = getComputedStyle(container);
      const paddingH = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      _snapAxis = 'width';
      _level = (container.clientWidth - paddingH) / _artifactWidth;
      applyLevel();
    },
    fitContentWidth(): void {
      _mode = 'fitContentWidth';
      if (!_contentBounds || _contentBounds.width <= 0) {
        this.fitWidth();
        return;
      }

      const availableWidth = Math.max(1, container.clientWidth);
      _snapAxis = 'width';
      _level = Math.max(0.1, (availableWidth - horizontalContentGapPx * 2) / _contentBounds.width);
      applyLevel();
    },
    fitPage(): void {
      _mode = 'fitPage';
      if (_artifactHeight <= 0) {
        return;
      }

      const style = getComputedStyle(container);
      const paddingV = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const singlePageHeight = _artifactHeight / _numPages;
      _snapAxis = 'height';
      _level = (container.clientHeight - paddingV) / singlePageHeight;
      applyLevel();
    },
    zoomIn(): void {
      _mode = 'fixed';
      _snapAxis = 'width';
      _level = Math.min(_level * 1.1, 10);
      applyLevel();
    },
    zoomOut(): void {
      _mode = 'fixed';
      _snapAxis = 'width';
      _level = Math.max(_level * 0.9, 0.1);
      applyLevel();
    },
    getState(): ZoomState {
      const level =
        _artifactWidth > 0 && _artifactHeight > 0 ? snapScaleToDevicePixels(_level) : _level;
      return { level, mode: _mode };
    },
    setState(state: ZoomState): void {
      _mode = state.mode;
      _level = state.level;
      this.reapply();
    }
  };
};

export interface HorizontalCenterRatioInput {
  readonly viewportCenterX: number;
  readonly contentLeft: number;
  readonly contentWidth: number;
}

export const getHorizontalCenterRatio = ({
  viewportCenterX,
  contentLeft,
  contentWidth
}: HorizontalCenterRatioInput): number => {
  if (contentWidth <= 0) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, (viewportCenterX - contentLeft) / contentWidth));
};

export interface HorizontalCenterScrollInput {
  readonly centerRatio: number;
  readonly viewportWidth: number;
  readonly contentWidth: number;
}

export const getScrollLeftForHorizontalCenter = ({
  centerRatio,
  viewportWidth,
  contentWidth
}: HorizontalCenterScrollInput): number => {
  const maxScrollLeft = Math.max(0, contentWidth - viewportWidth);
  const next = contentWidth * centerRatio - viewportWidth / 2;
  return Math.max(0, Math.min(maxScrollLeft, Math.round(next)));
};

export interface ContentBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const getVisibleContentBounds = (
  svgElement: SVGElement,
  artifactWidth: number,
  artifactHeight: number
): ContentBounds | null => {
  const candidates = svgElement.querySelectorAll<SVGGraphicsElement>(
    'path, text, image, use, line, polyline, polygon, circle, ellipse, rect, foreignObject'
  );
  let bounds: ContentBounds | null = null;

  for (const element of candidates) {
    if (isNonContentElement(element, artifactWidth, artifactHeight)) {
      continue;
    }

    const bbox = readSvgBBox(element);
    if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
      continue;
    }

    bounds = unionBounds(bounds, bbox);
  }

  return bounds;
};

const readSvgBBox = (element: SVGGraphicsElement): ContentBounds | null => {
  if (typeof element.getBBox !== 'function') {
    return null;
  }

  try {
    const bbox = element.getBBox();
    return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
  } catch {
    return null;
  }
};

const isNonContentElement = (
  element: SVGGraphicsElement,
  artifactWidth: number,
  artifactHeight: number
): boolean => {
  if (
    element.closest('defs, clipPath, mask, pattern, symbol') ||
    element.getAttribute('display') === 'none' ||
    element.getAttribute('visibility') === 'hidden'
  ) {
    return true;
  }

  const tag = element.localName.toLowerCase();
  if (tag !== 'rect') {
    return false;
  }

  const bbox = readSvgBBox(element);
  if (!bbox) {
    return false;
  }

  const isFullWidth = Math.abs(bbox.x) < 0.5 && Math.abs(bbox.width - artifactWidth) < 0.5;
  const isFullDocumentHeight =
    Math.abs(bbox.y) < 0.5 && Math.abs(bbox.height - artifactHeight) < 0.5;
  const pageHeightMatch = artifactHeight > 0 && Math.abs(artifactHeight % bbox.height) < 0.5;

  return isFullWidth && (isFullDocumentHeight || pageHeightMatch);
};

const unionBounds = (left: ContentBounds | null, right: ContentBounds): ContentBounds => {
  if (!left) {
    return right;
  }

  const x1 = Math.min(left.x, right.x);
  const y1 = Math.min(left.y, right.y);
  const x2 = Math.max(left.x + left.width, right.x + right.width);
  const y2 = Math.max(left.y + left.height, right.y + right.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
};
