import { Show, createSignal, onCleanup, onMount } from 'solid-js';

import type { ZoomState } from '../surface/zoom';

interface StatusLineProps {
  readonly version: string;
  readonly vaultStatus: string;
  readonly vaultCount: number;
  readonly pageStatus: string;
  readonly mode: string;
  readonly docName?: string | undefined;
  readonly warmupMessage?: string | undefined;
  readonly configWarning?: string | undefined;
}

const formatZoom = (zoom: ZoomState): string => {
  if (zoom.mode === 'fitWidth') {
    return 'fit-w';
  }

  if (zoom.mode === 'fitContentWidth') {
    return 'fit-c';
  }

  if (zoom.mode === 'fitPage') {
    return 'fit-p';
  }

  return `${Math.round(zoom.level * 100)}%`;
};

export const StatusLine = (props: StatusLineProps) => {
  const [zoom, setZoom] = createSignal<ZoomState>({ level: 1, mode: 'fitWidth' });

  onMount(() => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<ZoomState>).detail;
      setZoom(detail);
    };

    window.addEventListener('folea:zoom-changed', handler);
    onCleanup(() => window.removeEventListener('folea:zoom-changed', handler));
  });

  return (
    <footer class="statusline" data-testid="statusline">
      <Show when={props.docName}>
        <span class="statusline-doc" data-testid="statusline-doc">
          {props.docName}
        </span>
      </Show>
      <Show when={props.vaultStatus !== 'no vault'}>
        <span class="statusline-zoom" data-testid="statusline-zoom">
          [{formatZoom(zoom())}]
        </span>
      </Show>
      <Show when={props.warmupMessage}>
        <span class="statusline-warmup" data-testid="statusline-warmup">
          {props.warmupMessage}
        </span>
      </Show>
      <Show when={props.configWarning}>
        <span class="statusline-warning" data-testid="statusline-warning">
          {props.configWarning}
        </span>
      </Show>
      <Show when={props.vaultStatus !== 'no vault'}>
        <span class="statusline-page" data-testid="statusline-page">
          {props.pageStatus}
        </span>
      </Show>
      <span class="statusline-mode" data-testid="statusline-mode">
        [{props.vaultStatus === 'no vault' ? 'start_screen' : props.mode}]
      </span>
    </footer>
  );
};
