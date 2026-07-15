import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';

import { TREE_ROW_HEIGHT, calculateVirtualWindow, type TreeRow } from './tree-model';

interface TreeOverlayProps {
  readonly visible: boolean;
  readonly rows: readonly TreeRow[];
  readonly selectedIndex: number;
  readonly searchQuery?: string;
  readonly searchActive?: boolean;
  readonly onRowClick?: (index: number) => void;
  readonly marks?: ReadonlySet<string>;
  readonly onCloseRequest?: () => void;
  readonly onContextMenuVisibilityChange?: (visible: boolean) => void;
  readonly registerContextMenuDismiss?: (dismiss: () => void) => void;
  readonly onAction?: (
    action:
      | 'create-note'
      | 'create-directory'
      | 'open'
      | 'editor'
      | 'mark'
      | 'move'
      | 'rename'
      | 'delete',
    index?: number
  ) => void;
  readonly onDrop?: (source: string, index?: number) => void;
}

export const TreeOverlay = (props: TreeOverlayProps) => {
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(1);
  const [scroller, setScroller] = createSignal<HTMLDivElement>();
  const [menu, setMenu] = createSignal<{ x: number; y: number; index?: number }>();

  const closeContextMenu = (): void => {
    if (!menu()) return;
    setMenu(undefined);
    props.onContextMenuVisibilityChange?.(false);
  };

  const openContextMenu = (next: { x: number; y: number; index?: number }): void => {
    setMenu(next);
    props.onContextMenuVisibilityChange?.(true);
  };

  props.registerContextMenuDismiss?.(closeContextMenu);

  const virtualWindow = createMemo(() =>
    calculateVirtualWindow(props.rows.length, scrollTop(), viewportHeight())
  );

  const visibleRows = createMemo(() => {
    const window = virtualWindow();
    return props.rows.slice(window.start, window.end).map((row, index) => ({
      row,
      index: window.start + index
    }));
  });

  createEffect(() => {
    const element = scroller();
    if (!props.visible || !element || props.rows.length === 0) {
      return;
    }

    const selectedTop = props.selectedIndex * TREE_ROW_HEIGHT;
    const selectedBottom = selectedTop + TREE_ROW_HEIGHT;
    const viewportTop = element.scrollTop;
    const viewportBottom = viewportTop + element.clientHeight;

    if (selectedTop < viewportTop) {
      element.scrollTop = selectedTop;
      setScrollTop(selectedTop);
    } else if (selectedBottom > viewportBottom) {
      const nextTop = selectedBottom - element.clientHeight;
      element.scrollTop = nextTop;
      setScrollTop(nextTop);
    }
  });

  createEffect(() => {
    if (!props.visible) {
      closeContextMenu();
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const insideMenu = target.closest('.tree-context-menu') !== null;
      const insideTree = target.closest('.tree-overlay') !== null;
      const insideDialog = target.closest('.vault-dialog-backdrop') !== null;
      const insideNotice = target.closest('.operation-notice') !== null;
      if (menu() && !insideMenu) closeContextMenu();
      if (!insideTree && !insideMenu && !insideDialog && !insideNotice) {
        props.onCloseRequest?.();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    onCleanup(() => {
      document.removeEventListener('pointerdown', handlePointerDown);
    });
  });

  const drop = (event: DragEvent, index?: number): void => {
    event.preventDefault();
    delete (event.currentTarget as HTMLElement).dataset.dragTarget;
    const source = event.dataTransfer?.getData('text/folea-path');
    if (source) props.onDrop?.(source, index);
  };

  createEffect(() => {
    if (!props.visible) {
      return;
    }

    const element = scroller();
    if (!element) {
      return;
    }

    const updateViewport = (): void => {
      setViewportHeight(Math.max(1, element.clientHeight));
    };
    updateViewport();

    const resizeObserver = new ResizeObserver(updateViewport);
    resizeObserver.observe(element);
    onCleanup(() => resizeObserver.disconnect());
  });

  return (
    <Show when={props.visible}>
      <aside
        class="tree-overlay"
        data-testid="tree-overlay"
        aria-label="Vault tree"
        data-search-active={props.searchActive === true}
      >
        <div
          class="tree-overlay-header"
          data-testid="tree-root-drop"
          onDragOver={(event) => {
            event.preventDefault();
            event.currentTarget.dataset.dragTarget = 'true';
          }}
          onDragLeave={(event) => delete event.currentTarget.dataset.dragTarget}
          onDrop={(event) => drop(event)}
          onContextMenu={(event) => {
            event.preventDefault();
            openContextMenu({ x: event.clientX, y: event.clientY });
          }}
        >
          <span>vault</span>
          <span>{props.rows.length} rows</span>
        </div>
        <div
          ref={(element) => {
            setScroller(element);
          }}
          class="tree-scroll"
          data-testid="tree-scroll"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div class="tree-spacer" style={{ height: `${virtualWindow().totalHeight}px` }}>
            <div
              class="tree-window"
              style={{ transform: `translateY(${virtualWindow().offsetTop}px)` }}
            >
              <For each={visibleRows()}>
                {(entry) => (
                  <div
                    class="tree-row"
                    data-testid="tree-row"
                    data-selected={entry.index === props.selectedIndex}
                    data-kind={entry.row.kind}
                    data-relpath={entry.row.relPath}
                    data-marked={props.marks?.has(entry.row.relPath) === true}
                    draggable={true}
                    style={{ 'padding-left': `${12 + entry.row.depth * 16}px` }}
                    onClick={() => props.onRowClick?.(entry.index)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openContextMenu({
                        x: event.clientX,
                        y: event.clientY,
                        index: entry.index
                      });
                    }}
                    onDragStart={(event) => {
                      event.dataTransfer?.setData('text/folea-path', entry.row.relPath);
                      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.currentTarget.dataset.dragTarget = 'true';
                    }}
                    onDragLeave={(event) => delete event.currentTarget.dataset.dragTarget}
                    onDrop={(event) => {
                      event.stopPropagation();
                      drop(event, entry.index);
                    }}
                  >
                    <span class="tree-row-marker" aria-hidden="true">
                      {entry.row.kind === 'folder' ? (entry.row.expanded ? '-' : '+') : ''}
                    </span>
                    <span class="tree-row-name">{entry.row.name}</span>
                    <Show when={entry.index === props.selectedIndex}>
                      <span class="tree-selection-anchor" data-testid="tree-selected-row" />
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
        <Show when={props.searchActive}>
          <div class="tree-search-line" data-testid="tree-search-line">
            <span class="tree-search-prompt">/</span>
            <span class="tree-search-query">{props.searchQuery}</span>
          </div>
        </Show>
      </aside>
      <Show when={menu()} keyed>
        {(current) => (
          <div
            class="tree-context-menu"
            data-testid="tree-context-menu"
            style={{ left: `${current.x}px`, top: `${current.y}px` }}
          >
            <For each={contextActions(props.rows[current.index ?? -1])}>
              {(action) => (
                <button
                  type="button"
                  onClick={() => {
                    closeContextMenu();
                    props.onAction?.(
                      action as
                        | 'create-note'
                        | 'create-directory'
                        | 'open'
                        | 'editor'
                        | 'mark'
                        | 'move'
                        | 'rename'
                        | 'delete',
                      current.index
                    );
                  }}
                >
                  {action.replace('-', ' ')}
                </button>
              )}
            </For>
          </div>
        )}
      </Show>
    </Show>
  );
};

type TreeContextAction =
  | 'create-note'
  | 'create-directory'
  | 'open'
  | 'editor'
  | 'mark'
  | 'move'
  | 'rename'
  | 'delete';

const contextActions = (row: TreeRow | undefined): readonly TreeContextAction[] => {
  if (!row) return ['create-note', 'create-directory'];
  return [
    'create-note',
    'create-directory',
    'open',
    ...(row.kind === 'note' ? (['editor'] as const) : []),
    'mark',
    'move',
    'rename',
    'delete'
  ];
};
