import type { ZoomState } from '../surface/zoom';

export const getZoomStatusLabel = (zoom: ZoomState): string | null => {
  if (zoom.mode === 'fitWidth') {
    return 'fit-w';
  }

  if (zoom.mode === 'fitContentWidth') {
    return 'fit-c';
  }

  if (zoom.mode === 'fitPage') {
    return 'fit-p';
  }

  return null;
};
