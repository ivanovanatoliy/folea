import type { SearchHit } from '../../shared/ipc/search';

export type SearchScope = 'local' | 'global';

const LOCAL_SEARCH_MAX_HITS = 500;

export const findLocalSearchHits = (
  source: string,
  relPath: string,
  query: string,
  ignoreCase = true
): readonly SearchHit[] => {
  const rawNeedle = query.trim();
  const needle = ignoreCase ? rawNeedle.toLowerCase() : rawNeedle;
  if (needle.length === 0) {
    return [];
  }

  const hits: SearchHit[] = [];
  const lines = source.split(/\r?\n/);

  for (
    let lineIndex = 0;
    lineIndex < lines.length && hits.length < LOCAL_SEARCH_MAX_HITS;
    lineIndex += 1
  ) {
    const line = lines[lineIndex] ?? '';
    const haystack = ignoreCase ? line.toLowerCase() : line;
    let start = 0;

    for (;;) {
      const columnIndex = haystack.indexOf(needle, start);
      if (columnIndex < 0 || hits.length >= LOCAL_SEARCH_MAX_HITS) {
        break;
      }

      hits.push({
        relPath,
        line: lineIndex + 1,
        column: columnIndex + 1,
        preview: line.trimEnd()
      });
      start = columnIndex + Math.max(1, needle.length);
    }
  }

  return hits;
};
