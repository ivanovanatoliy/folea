import { For, Show, createEffect, createMemo } from 'solid-js';

import type { HelpBindingRow, HelpCatalog, HelpTabId } from './help-model';

interface KeyboardHelpOverlayProps {
  readonly visible: boolean;
  readonly catalog: HelpCatalog;
  readonly selectedTab: HelpTabId;
  readonly onSelectTab: (tab: HelpTabId) => void;
  readonly registerScroll: (scroll: (direction: -1 | 1) => void) => void;
}

const HelpRows = (props: { readonly rows: readonly HelpBindingRow[] }) => (
  <div class="keyboard-help-rows">
    <For each={props.rows}>
      {(row) => (
        <div
          class="keyboard-help-row"
          data-testid="keyboard-help-row"
          data-command-id={row.commandId}
        >
          <span class="keyboard-help-title">{row.title}</span>
          <span class="keyboard-help-bindings">
            <For each={row.bindings}>
              {(binding) => <kbd class="keyboard-help-binding">{binding}</kbd>}
            </For>
          </span>
        </div>
      )}
    </For>
  </div>
);

export const KeyboardHelpOverlay = (props: KeyboardHelpOverlayProps) => {
  let body: HTMLDivElement | undefined;
  const selected = createMemo(
    () => props.catalog.tabs.find((tab) => tab.id === props.selectedTab) ?? props.catalog.tabs[0]
  );

  props.registerScroll((direction) => {
    body?.scrollBy({ top: direction * 72 });
  });

  createEffect(() => {
    if (!props.visible) return;
    const selectedTab = props.selectedTab;
    queueMicrotask(() => {
      if (body && selected()?.id === selectedTab) body.scrollTop = 0;
    });
  });

  return (
    <Show when={props.visible}>
      <aside
        class="keyboard-help-overlay"
        data-testid="keyboard-help-overlay"
        aria-label="Keyboard help"
      >
        <nav class="keyboard-help-tabs" role="tablist" aria-label="Keyboard help sections">
          <For each={props.catalog.tabs}>
            {(tab) => (
              <button
                type="button"
                role="tab"
                class="keyboard-help-tab"
                data-testid="keyboard-help-tab"
                data-tab-id={tab.id}
                data-selected={tab.id === props.selectedTab}
                aria-selected={tab.id === props.selectedTab}
                onClick={() => props.onSelectTab(tab.id)}
              >
                {tab.label}
              </button>
            )}
          </For>
        </nav>
        <div
          ref={(element) => {
            body = element;
          }}
          class="keyboard-help-body"
          data-testid="keyboard-help-body"
        >
          <div class="keyboard-help-grid">
            <For each={selected()?.groups ?? []}>
              {(group) => (
                <section class="keyboard-help-group" data-help-group={group.id}>
                  <h2>{group.label}</h2>
                  <HelpRows rows={group.rows} />
                </section>
              )}
            </For>
          </div>
        </div>
      </aside>
    </Show>
  );
};
