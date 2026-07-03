import { For, Show, createEffect } from 'solid-js';

import type { OutlineEntry } from '../../shared/worker/typst';

interface OutlineOverlayProps {
  readonly visible: boolean;
  readonly entries: readonly OutlineEntry[];
  readonly selectedIndex: number;
  readonly onRowClick?: (index: number) => void;
}

export const OutlineOverlay = (props: OutlineOverlayProps) => {
  let results: HTMLDivElement | undefined;

  createEffect(() => {
    if (!props.visible) {
      return;
    }

    const selectedIndex = props.selectedIndex;
    queueMicrotask(() => {
      if (selectedIndex < 0) {
        return;
      }

      results
        ?.querySelector<HTMLElement>('[data-selected="true"]')
        ?.scrollIntoView({ block: 'nearest' });
    });
  });

  return (
    <Show when={props.visible}>
      <aside class="palette-overlay" data-testid="outline-overlay" aria-label="outline">
        <div class="palette-overlay-header">
          <span>outline</span>
          <span>{props.entries.length}</span>
        </div>
        <div
          ref={(element) => {
            results = element;
          }}
          class="palette-results"
          data-testid="outline-results"
        >
          <For each={props.entries}>
            {(entry, index) => (
              <div
                class="palette-row"
                data-testid="outline-row"
                data-selected={index() === props.selectedIndex}
                style={{ 'padding-left': `${12 + Math.max(0, entry.level - 1) * 16}px` }}
                onClick={() => props.onRowClick?.(index())}
              >
                <span class="palette-row-title">{entry.text}</span>
                <span class="palette-row-id">h{entry.level}</span>
              </div>
            )}
          </For>
          <Show when={props.entries.length === 0}>
            <div class="palette-empty">No headings</div>
          </Show>
        </div>
      </aside>
    </Show>
  );
};
