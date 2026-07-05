import { For, Show, createEffect } from 'solid-js';

import type { SearchHit } from '../../shared/ipc/search';
import type { RecentNoteEntry } from '../../shared/ipc/vault-state';
import type { NoteMeta } from '../../shared/ipc/vault';

export type QuickOpenMode = 'recent' | 'search';

interface QuickOpenOverlayProps {
  readonly visible: boolean;
  readonly query: string;
  readonly mode: QuickOpenMode;
  readonly recentNotes: readonly RecentNoteEntry[];
  readonly noteMetas: readonly NoteMeta[];
  readonly searchHits: readonly SearchHit[];
  readonly selectedIndex: number;
  readonly searching: boolean;
  readonly onInput: (query: string) => void;
  readonly onRowClick: (index: number) => void;
}

export const QuickOpenOverlay = (props: QuickOpenOverlayProps) => {
  let input: HTMLInputElement | undefined;
  let results: HTMLDivElement | undefined;

  createEffect(() => {
    if (!props.visible) return;
    input?.focus();
    input?.select();
  });

  createEffect(() => {
    if (!props.visible) return;

    const selectedIndex = props.selectedIndex;
    queueMicrotask(() => {
      if (selectedIndex < 0) return;
      results
        ?.querySelector<HTMLElement>('[data-selected="true"]')
        ?.scrollIntoView({ block: 'nearest' });
    });
  });

  const resolveTitle = (relPath: string): string => {
    const meta = props.noteMetas.find((n) => n.relPath === relPath);
    return meta?.title ?? relPath;
  };

  const rowCount = () =>
    props.mode === 'recent' ? props.recentNotes.length : props.searchHits.length;

  return (
    <Show when={props.visible}>
      <aside
        class="palette-overlay quick-open-overlay"
        data-testid="quick-open-overlay"
        aria-label="quick open"
      >
        <div class="palette-overlay-header">
          <span>{props.mode === 'recent' ? 'recent notes' : 'vault search'}</span>
          <span>{props.searching ? 'searching…' : rowCount()}</span>
        </div>
        <input
          ref={(el) => {
            input = el;
          }}
          class="palette-input"
          data-overlay-mode="quick-open"
          data-testid="quick-open-input"
          value={props.query}
          placeholder="Open note or search vault…"
          spellcheck={false}
          onInput={(event) => props.onInput(event.currentTarget.value)}
        />
        <div
          ref={(el) => {
            results = el;
          }}
          class="palette-results"
          data-testid="quick-open-results"
        >
          <Show when={props.mode === 'recent'}>
            <For each={props.recentNotes}>
              {(entry, index) => (
                <div
                  class="palette-row"
                  data-testid="quick-open-row"
                  data-selected={index() === props.selectedIndex}
                  data-relpath={entry.relPath}
                  onClick={() => props.onRowClick(index())}
                >
                  <span class="palette-row-title">{resolveTitle(entry.relPath)}</span>
                  <span class="palette-row-id">{entry.relPath}</span>
                </div>
              )}
            </For>
            <Show when={props.recentNotes.length === 0}>
              <div class="palette-empty">No recent notes</div>
            </Show>
          </Show>
          <Show when={props.mode === 'search'}>
            <For each={props.searchHits}>
              {(hit, index) => (
                <div
                  class="palette-row search-row"
                  data-testid="quick-open-row"
                  data-selected={index() === props.selectedIndex}
                  data-relpath={hit.relPath}
                  onClick={() => props.onRowClick(index())}
                >
                  <span class="palette-row-title">{hit.relPath}</span>
                  <span class="search-row-meta">
                    {hit.line}:{hit.column}
                  </span>
                  <span class="search-row-preview">{hit.preview}</span>
                </div>
              )}
            </For>
            <Show when={!props.searching && props.searchHits.length === 0}>
              <div class="palette-empty">No results</div>
            </Show>
          </Show>
        </div>
      </aside>
    </Show>
  );
};
