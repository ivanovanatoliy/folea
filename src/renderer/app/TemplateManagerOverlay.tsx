import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';

import type { VaultTemplate } from '../../shared/ipc/vault';

interface TemplateManagerOverlayProps {
  readonly visible: boolean;
  readonly templates: readonly VaultTemplate[];
  readonly selectedIndex: number;
  readonly onSelect: (index: number) => void;
  readonly onOpen: (index: number) => void;
  readonly onRename: (index: number) => void;
  readonly onDelete: (index: number) => void;
  readonly onContextMenuVisibilityChange: (visible: boolean) => void;
  readonly registerContextMenuDismiss: (dismiss: () => void) => void;
}

export const TemplateManagerOverlay = (props: TemplateManagerOverlayProps) => {
  const [menu, setMenu] = createSignal<{
    readonly x: number;
    readonly y: number;
    readonly index: number;
  }>();

  const closeContextMenu = (): void => {
    if (!menu()) return;
    setMenu(undefined);
    props.onContextMenuVisibilityChange(false);
  };

  const openContextMenu = (next: { x: number; y: number; index: number }): void => {
    setMenu(next);
    props.onContextMenuVisibilityChange(true);
  };

  props.registerContextMenuDismiss(closeContextMenu);

  createEffect(() => {
    if (!props.visible) {
      closeContextMenu();
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Element && !target.closest('[data-testid="template-context-menu"]')) {
        closeContextMenu();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    onCleanup(() => document.removeEventListener('pointerdown', handlePointerDown));
  });

  return (
    <Show when={props.visible}>
      <aside class="palette-overlay" data-testid="template-manager" aria-label="templates">
        <div class="palette-overlay-header">
          <span>templates</span>
          <span>{props.templates.length}</span>
        </div>
        <div class="palette-results" data-testid="template-results">
          <For each={props.templates}>
            {(template, index) => (
              <div
                class="palette-row"
                data-testid="template-row"
                data-selected={index() === props.selectedIndex}
                data-relpath={template.relPath}
                onClick={() => {
                  props.onSelect(index());
                  props.onOpen(index());
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  props.onSelect(index());
                  openContextMenu({ x: event.clientX, y: event.clientY, index: index() });
                }}
              >
                <span class="palette-row-title">{template.name}</span>
                <span class="palette-row-id">{template.relPath}</span>
              </div>
            )}
          </For>
          <Show when={props.templates.length === 0}>
            <div class="palette-empty">No direct _templates/*.typ files</div>
          </Show>
        </div>
      </aside>
      <Show when={menu()} keyed>
        {(current) => (
          <div
            class="tree-context-menu"
            data-testid="template-context-menu"
            style={{ left: `${current.x}px`, top: `${current.y}px` }}
          >
            <For each={['open', 'rename', 'delete'] as const}>
              {(action) => (
                <button
                  type="button"
                  onClick={() => {
                    closeContextMenu();
                    if (action === 'open') props.onOpen(current.index);
                    else if (action === 'rename') props.onRename(current.index);
                    else props.onDelete(current.index);
                  }}
                >
                  {action}
                </button>
              )}
            </For>
          </div>
        )}
      </Show>
    </Show>
  );
};
