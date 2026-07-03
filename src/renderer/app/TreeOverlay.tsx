import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';

import { TREE_ROW_HEIGHT, calculateVirtualWindow, type TreeRow } from './tree-model';

interface TreeOverlayProps {
  readonly visible: boolean;
  readonly rows: readonly TreeRow[];
  readonly selectedIndex: number;
  readonly searchQuery?: string;
  readonly searchActive?: boolean;
  readonly onRowClick?: (index: number) => void;
}

export const TreeOverlay = (props: TreeOverlayProps) => {
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(1);
  const [scroller, setScroller] = createSignal<HTMLDivElement>();

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
        <div class="tree-overlay-header">
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
                    style={{ 'padding-left': `${12 + entry.row.depth * 16}px` }}
                    onClick={() => props.onRowClick?.(entry.index)}
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
    </Show>
  );
};
