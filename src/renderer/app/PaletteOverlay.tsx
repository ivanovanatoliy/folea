import { For, Show, createEffect } from 'solid-js';

import type { BindingIndex } from '../input/binding-index';
import type { PaletteMatch } from './palette-model';

interface PaletteOverlayProps {
  readonly visible: boolean;
  readonly modeLabel: string;
  readonly query: string;
  readonly placeholder: string;
  readonly matches: readonly PaletteMatch[];
  readonly selectedIndex: number;
  readonly bindingIndex?: BindingIndex;
  readonly inputRef?: (element: HTMLInputElement) => void;
  readonly onInput: (query: string) => void;
  readonly onRowClick?: (index: number) => void;
}

export const PaletteOverlay = (props: PaletteOverlayProps) => {
  let input: HTMLInputElement | undefined;
  let results: HTMLDivElement | undefined;

  createEffect(() => {
    if (!props.visible) {
      return;
    }

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
        class="palette-overlay"
        data-testid={`${props.modeLabel}-overlay`}
        aria-label={props.modeLabel}
      >
        <div class="palette-overlay-header">
          <span>{props.modeLabel}</span>
          <span>{props.matches.length}</span>
        </div>
        <input
          ref={(element) => {
            input = element;
            props.inputRef?.(element);
          }}
          class="palette-input"
          data-overlay-mode={props.modeLabel}
          data-testid={`${props.modeLabel}-input`}
          value={props.query}
          placeholder={props.placeholder}
          spellcheck={false}
          onInput={(event) => props.onInput(event.currentTarget.value)}
        />
        <div
          ref={(element) => {
            results = element;
          }}
          class="palette-results"
          data-testid={`${props.modeLabel}-results`}
        >
          <For each={props.matches}>
            {(match, index) => (
              <div
                class="palette-row"
                data-testid={`${props.modeLabel}-row`}
                data-selected={index() === props.selectedIndex}
                data-command-id={match.command.id}
                onClick={() => props.onRowClick?.(index())}
              >
                <span class="palette-row-label">
                  <span class="palette-row-title">{match.command.title ?? match.command.id}</span>
                  <span class="palette-row-id">{match.command.id}</span>
                </span>
                <Show when={props.bindingIndex?.get(match.command.id)}>
                  {(key) => <kbd class="palette-row-binding">{key()}</kbd>}
                </Show>
              </div>
            )}
          </For>
          <Show when={props.matches.length === 0}>
            <div class="palette-empty">No matches</div>
          </Show>
        </div>
      </aside>
    </Show>
  );
};
