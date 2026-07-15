import type { Diagnostic, RenderArtifact } from '../../shared/worker/typst';
import type { ContentBounds } from './zoom';

export interface ChangedTargetRevealInput {
  readonly viewportTop: number;
  readonly viewportHeight: number;
  readonly currentScrollTop: number;
  readonly targetTop: number;
  readonly targetBottom: number;
}

export interface RestoredRerenderScrollInput {
  readonly previousScrollTop: number;
  readonly previousScrollHeight: number;
  readonly nextScrollHeight: number;
}

export const createRenderedDocument = (
  artifact: RenderArtifact
): { readonly documentNode: HTMLDivElement; readonly svgElement: SVGElement } => {
  const parsed = new DOMParser().parseFromString(artifact.svg, 'image/svg+xml');
  const root = parsed.documentElement;
  if (
    parsed.querySelector('parsererror') ||
    root.namespaceURI !== 'http://www.w3.org/2000/svg' ||
    root.localName !== 'svg'
  ) {
    throw new Error('Typst renderer returned invalid SVG');
  }
  const svgElement = document.adoptNode(root) as unknown as SVGElement;
  const documentNode = document.createElement('div');
  documentNode.className = 'typst-document';
  documentNode.dataset.testid = 'typst-rendered-document';
  documentNode.style.width = `${artifact.width}px`;
  documentNode.style.minHeight = `${artifact.height}px`;
  documentNode.replaceChildren(svgElement);
  return { documentNode, svgElement };
};

export const createErrorDocument = (diagnostics: readonly Diagnostic[]): HTMLDivElement => {
  const errorNode = document.createElement('div');
  errorNode.className = 'typst-error';
  errorNode.dataset.testid = 'typst-render-error';
  errorNode.setAttribute('role', 'alert');
  const title = document.createElement('div');
  title.className = 'typst-error-title';
  title.textContent = 'Typst compile error';
  errorNode.append(title);
  const list = document.createElement('ol');
  list.className = 'typst-error-list';
  for (const diagnostic of diagnostics.length > 0
    ? diagnostics
    : [{ severity: 'error' as const, message: 'Unknown Typst compile error' }]) {
    const item = document.createElement('li');
    const location =
      diagnostic.path || diagnostic.range
        ? `${diagnostic.path ?? ''}${diagnostic.range ? ` ${diagnostic.range}` : ''}: `
        : '';
    item.textContent = `${diagnostic.severity}: ${location}${diagnostic.message}`;
    list.append(item);
  }
  errorNode.append(list);
  return errorNode;
};

export const getDomContentBounds = (documentNode: HTMLElement): ContentBounds | null => {
  const documentRect = documentNode.getBoundingClientRect();
  let bounds: ContentBounds | null = null;
  for (const element of documentNode.querySelectorAll<HTMLElement>('.tsel')) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const next = {
      x: rect.left - documentRect.left,
      y: rect.top - documentRect.top,
      width: rect.width,
      height: rect.height
    };
    if (!bounds) bounds = next;
    else {
      const x1 = Math.min(bounds.x, next.x);
      const y1 = Math.min(bounds.y, next.y);
      const x2 = Math.max(bounds.x + bounds.width, next.x + next.width);
      const y2 = Math.max(bounds.y + bounds.height, next.y + next.height);
      bounds = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    }
  }
  return bounds;
};

export const getRestoredRerenderScrollTop = ({
  previousScrollTop,
  previousScrollHeight,
  nextScrollHeight
}: RestoredRerenderScrollInput): number | null =>
  previousScrollHeight <= 0 || nextScrollHeight <= 0
    ? null
    : Math.round((previousScrollTop / previousScrollHeight) * nextScrollHeight);

export const getScrollTopForChangedTarget = ({
  viewportTop,
  viewportHeight,
  currentScrollTop,
  targetTop,
  targetBottom
}: ChangedTargetRevealInput): number | null => {
  const visible = targetBottom > viewportTop && targetTop < viewportTop + viewportHeight;
  if (visible) return null;
  return Math.max(0, Math.round(targetTop - viewportTop + currentScrollTop - viewportHeight * 0.4));
};
