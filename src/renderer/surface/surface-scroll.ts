export interface SurfacePageStatus {
  readonly current: number;
  readonly total: number;
}

export interface SurfaceScrollController {
  emitStatus(): void;
  dispose(): void;
  byLines(lines: number): void;
  byViewport(fraction: number): void;
  toStart(): void;
  toEnd(): void;
  toOffset(y: number): void;
  left(): void;
  right(): void;
}

const LINE_SCROLL_PX = 40;
const HORIZONTAL_SCROLL_PX = 80;

export const calculatePageStatus = (
  clientHeight: number,
  scrollHeight: number,
  scrollTop: number
): SurfacePageStatus => {
  if (clientHeight <= 0 || scrollHeight <= 0) return { current: 0, total: 0 };
  const total = Math.max(1, Math.ceil(scrollHeight / clientHeight));
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  const current =
    maxScrollTop === 0
      ? 1
      : Math.min(total, Math.max(1, Math.round((scrollTop / maxScrollTop) * (total - 1)) + 1));
  return { current, total };
};

export const createSurfaceScroll = (container: HTMLElement): SurfaceScrollController => {
  let frame: number | undefined;
  const emitStatus = (): void => {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      window.dispatchEvent(
        new CustomEvent<SurfacePageStatus>('folea:surface-page-status', {
          detail: calculatePageStatus(
            container.clientHeight,
            container.scrollHeight,
            container.scrollTop
          )
        })
      );
    });
  };
  const update = (mutation: () => void): void => {
    mutation();
    emitStatus();
  };

  return {
    emitStatus,
    dispose(): void {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
    },
    byLines: (lines) => update(() => (container.scrollTop += lines * LINE_SCROLL_PX)),
    byViewport: (fraction) =>
      update(() => (container.scrollTop += container.clientHeight * fraction)),
    toStart: () => update(() => (container.scrollTop = 0)),
    toEnd: () => update(() => (container.scrollTop = container.scrollHeight)),
    toOffset: (y) => update(() => (container.scrollTop = Math.max(0, y))),
    left: () =>
      update(() => {
        container.scrollLeft = Math.max(0, container.scrollLeft - HORIZONTAL_SCROLL_PX);
      }),
    right: () =>
      update(() => {
        const max = Math.max(0, container.scrollWidth - container.clientWidth);
        container.scrollLeft = Math.min(max, container.scrollLeft + HORIZONTAL_SCROLL_PX);
      })
  };
};
