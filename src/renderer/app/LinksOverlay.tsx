import { For, Show, createEffect } from 'solid-js';

import type { NoteRef } from '../nav/link-graph';

interface LinksOverlayProps {
  readonly visible: boolean;
  readonly backlinks: readonly NoteRef[];
  readonly outgoing: readonly NoteRef[];
  readonly selectedIndex: number;
  readonly onRowClick?: (index: number) => void;
}

export const LinksOverlay = (props: LinksOverlayProps) => {
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
      <aside class="palette-overlay" data-testid="links-overlay" aria-label="links">
        <div class="palette-overlay-header">
          <span>links</span>
          <span>{props.backlinks.length + props.outgoing.length}</span>
        </div>
        <div
          ref={(element) => {
            results = element;
          }}
          class="palette-results"
          data-testid="links-results"
        >
          <div class="palette-section-header" data-testid="links-section-backlinks">
            backlinks ({props.backlinks.length})
          </div>
          <For each={props.backlinks}>
            {(ref, index) => (
              <div
                class="palette-row"
                data-testid="links-row"
                data-selected={index() === props.selectedIndex}
                onClick={() => props.onRowClick?.(index())}
              >
                <span class="palette-row-title">{ref.title}</span>
                <span class="palette-row-id">{ref.kind}</span>
              </div>
            )}
          </For>
          <Show when={props.backlinks.length === 0}>
            <div class="palette-empty">No backlinks</div>
          </Show>
          <div class="palette-section-header" data-testid="links-section-outgoing">
            outgoing ({props.outgoing.length})
          </div>
          <For each={props.outgoing}>
            {(ref, index) => (
              <div
                class="palette-row"
                data-testid="links-row"
                data-selected={props.backlinks.length + index() === props.selectedIndex}
                onClick={() => props.onRowClick?.(props.backlinks.length + index())}
              >
                <span class="palette-row-title">{ref.title}</span>
                <span class="palette-row-id">{ref.kind}</span>
              </div>
            )}
          </For>
          <Show when={props.outgoing.length === 0}>
            <div class="palette-empty">No outgoing links</div>
          </Show>
        </div>
      </aside>
    </Show>
  );
};
