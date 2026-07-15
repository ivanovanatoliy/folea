import type { LinkTarget } from './caret';

export interface SurfaceLinkClickDetail {
  readonly target: LinkTarget;
}

export const installSurfaceLinkInterceptor = (
  container: HTMLElement,
  currentNoteId: () => string | undefined
): (() => void) => {
  const dispatchHref = (href: string): void => {
    const target: LinkTarget = href.startsWith('#')
      ? { kind: 'anchor', id: href.slice(1) }
      : href.startsWith('http://') || href.startsWith('https://')
        ? { kind: 'external', url: href }
        : { kind: 'note', rawHref: href, fromRelPath: currentNoteId() ?? '' };
    window.dispatchEvent(
      new CustomEvent<SurfaceLinkClickDetail>('folea:surface-link-click', { detail: { target } })
    );
  };

  const intercept = (event: Event): void => {
    const target = event.target as Element | null;
    if (!target) return;
    let anchor: Element | null = target.closest('a');
    if (!anchor) {
      const { clientX: x, clientY: y } = event as MouseEvent;
      for (const candidate of container.querySelectorAll<Element>('a')) {
        const rect = candidate.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          anchor = candidate;
          break;
        }
      }
    }
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? anchor.getAttribute('xlink:href') ?? '';
    if (!href) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    dispatchHref(href);
  };

  container.addEventListener('click', intercept, { capture: true });
  container.addEventListener('auxclick', intercept, { capture: true });
  return () => {
    container.removeEventListener('click', intercept, { capture: true });
    container.removeEventListener('auxclick', intercept, { capture: true });
  };
};
