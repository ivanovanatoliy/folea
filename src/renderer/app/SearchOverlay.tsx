import { For, Show, createEffect } from 'solid-js';

import type { SearchHit } from '../../shared/ipc/search';
import type { SearchScope } from '../search';

interface SearchOverlayProps {
  readonly visible: boolean;
  readonly query: string;
  readonly hits: readonly SearchHit[];
  readonly selectedIndex: number;
  readonly searching: boolean;
  readonly truncated: boolean;
  readonly error: string | undefined;
  readonly scope: SearchScope;
  readonly inputRef?: (element: HTMLInputElement) => void;
  readonly onInput: (query: string) => void;
  readonly onRowClick?: (index: number) => void;
}

export const SearchOverlay = (props: SearchOverlayProps) => {
  let results: HTMLDivElement | undefined;

  createEffect(() => {
    if (!props.visible) {
      return;
    }

    const input = document.querySelector<HTMLInputElement>('[data-overlay-mode="search"]');
    input?.focus();
    input?.select();
  });

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
      <aside
        class="palette-overlay search-overlay"
        data-testid="search-overlay"
        aria-label="search"
      >
        <div class="palette-overlay-header">
          <span>{props.scope === 'local' ? 'file search' : 'vault search'}</span>
          <span>{props.searching ? 'streaming' : props.truncated ? 'truncated' : 'idle'}</span>
        </div>
        <input
          ref={props.inputRef}
          class="palette-input"
          data-overlay-mode="search"
          data-testid="search-input"
          value={props.query}
          placeholder={props.scope === 'local' ? 'Search current note' : 'Search vault'}
          spellcheck={false}
          onInput={(event) => props.onInput(event.currentTarget.value)}
        />
        <div
          ref={(element) => {
            results = element;
          }}
          class="palette-results"
          data-testid="search-results"
        >
          <Show when={props.error}>
            {(message) => <div class="palette-empty">{message()}</div>}
          </Show>
          <For each={props.hits}>
            {(hit, index) => (
              <div
                class="palette-row search-row"
                data-testid="search-row"
                data-selected={index() === props.selectedIndex}
                data-relpath={hit.relPath}
                onClick={() => props.onRowClick?.(index())}
              >
                <span class="palette-row-title">{hit.relPath}</span>
                <span class="search-row-meta">
                  {hit.line}:{hit.column}
                </span>
                <span class="search-row-preview">{hit.preview}</span>
              </div>
            )}
          </For>
          <Show when={!props.error && props.hits.length === 0 && !props.searching}>
            <div class="palette-empty">No results</div>
          </Show>
        </div>
      </aside>
    </Show>
  );
};
