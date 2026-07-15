export interface SurfaceSearchController {
  rebuildIndex(): void;
  snapshotText(): string[];
  clearIndex(): void;
  clearHighlight(): void;
  setQuery(query: string): void;
  nextMatch(): boolean;
  prevMatch(): boolean;
  revealTarget(target: {
    readonly query: string;
    readonly line?: number;
    readonly preview?: string;
  }): boolean;
  reapplyHighlight(): void;
}

export const findSearchTargetIndex = (
  texts: readonly string[],
  target: {
    readonly query: string;
    readonly preview?: string;
    readonly previewOccurrence?: number;
    readonly queryOccurrence?: number;
  }
): number => {
  const previewNeedle = normalizeSearchText(stripTypstMarkup(target.preview ?? ''));
  if (previewNeedle.length > 0) {
    const previewMatches = texts
      .map((text, index) => ({ text: normalizeSearchText(text), index }))
      .filter((entry) => entry.text.includes(previewNeedle));
    if (previewMatches.length > 0) {
      return previewMatches[Math.min(target.previewOccurrence ?? 0, previewMatches.length - 1)]!
        .index;
    }
  }

  const queryNeedle = normalizeSearchText(target.query);
  const queryMatches = texts
    .map((text, index) => ({ text: normalizeSearchText(text), index }))
    .filter((entry) => entry.text.includes(queryNeedle));
  return queryMatches[Math.min(target.queryOccurrence ?? 0, queryMatches.length - 1)]?.index ?? -1;
};

export const createSurfaceSearch = (
  container: HTMLElement,
  emitPageStatus: () => void
): SurfaceSearchController => {
  let query: string | undefined;
  let matchIndex = -1;
  let highlight: HTMLDivElement | undefined;
  let textSpans: readonly HTMLElement[] = [];

  const removeHighlight = (): void => {
    highlight?.remove();
    highlight = undefined;
  };

  const clearHighlight = (): void => {
    removeHighlight();
    matchIndex = -1;
  };

  const setHighlight = (index: number): boolean => {
    const documentNode = container.querySelector<HTMLElement>('.typst-document');
    const span = textSpans[index];
    if (!documentNode || !span) return false;

    removeHighlight();
    const rect = span.getBoundingClientRect();
    const documentRect = documentNode.getBoundingClientRect();
    const next = document.createElement('div');
    next.className = 'surface-search-highlight';
    next.dataset.testid = 'surface-search-highlight';
    next.style.left = `${rect.left - documentRect.left}px`;
    next.style.top = `${rect.top - documentRect.top}px`;
    next.style.width = `${Math.max(4, rect.width)}px`;
    next.style.height = `${Math.max(12, rect.height)}px`;
    documentNode.append(next);
    highlight = next;
    matchIndex = index;
    return true;
  };

  const findMatch = (forward: boolean): boolean => {
    const needle = query?.trim().toLowerCase();
    if (!needle || textSpans.length === 0) return false;

    const count = textSpans.length;
    const start = matchIndex >= 0 ? matchIndex + (forward ? 1 : -1) : forward ? 0 : count - 1;
    const normalizedStart = ((start % count) + count) % count;
    for (let offset = 0; offset < count; offset += 1) {
      const index = forward
        ? (normalizedStart + offset) % count
        : (normalizedStart - offset + count) % count;
      const span = textSpans[index];
      if (!span?.textContent?.toLowerCase().includes(needle) || !setHighlight(index)) continue;
      const rect = span.getBoundingClientRect();
      container.scrollTop = Math.max(
        0,
        rect.top -
          container.getBoundingClientRect().top +
          container.scrollTop -
          container.clientHeight * 0.35
      );
      emitPageStatus();
      return true;
    }
    return false;
  };

  return {
    rebuildIndex(): void {
      textSpans = [...container.querySelectorAll<HTMLElement>('.typst-document .tsel')];
    },
    snapshotText: () => textSpans.map((span) => span.textContent ?? ''),
    clearIndex(): void {
      textSpans = [];
      clearHighlight();
    },
    clearHighlight,
    setQuery(value: string): void {
      query = value.trim();
    },
    nextMatch: () => findMatch(true),
    prevMatch: () => findMatch(false),
    revealTarget(target): boolean {
      query = target.query.trim();
      if (!query) return false;
      const index = findSearchTargetIndex(
        textSpans.map((span) => span.textContent ?? ''),
        target
      );
      if (index < 0 || !setHighlight(index)) {
        clearHighlight();
        return false;
      }
      const span = textSpans[index]!;
      const rect = span.getBoundingClientRect();
      container.scrollTop = Math.max(
        0,
        rect.top -
          container.getBoundingClientRect().top +
          container.scrollTop -
          container.clientHeight * 0.35
      );
      emitPageStatus();
      return true;
    },
    reapplyHighlight(): void {
      if (matchIndex >= 0) void setHighlight(matchIndex);
    }
  };
};

const stripTypstMarkup = (value: string): string =>
  value
    .replace(/^=+\s*/, '')
    .replace(/#(?:\w|-)+/g, '')
    .trim();

const normalizeSearchText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().toLowerCase();
