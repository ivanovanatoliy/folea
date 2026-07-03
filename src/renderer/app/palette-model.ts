import type { Command } from '../input';

export interface PaletteMatch {
  readonly command: Command;
  readonly score: number;
}

export const filterPaletteCommands = (
  commands: readonly Command[],
  query: string,
  commandHistory: readonly string[] = []
): readonly PaletteMatch[] => {
  const normalizedQuery = query.trim().toLowerCase();
  const historyRank = new Map(commandHistory.map((id, index) => [id, index] as const));

  return commands
    .map((command) => {
      const haystacks = [command.title ?? '', command.id];
      const score = haystacks.reduce(
        (best, haystack, index) =>
          Math.max(best, scoreCommand(haystack, normalizedQuery, index === 0)),
        Number.NEGATIVE_INFINITY
      );

      return { command, score };
    })
    .filter((match) => normalizedQuery.length === 0 || match.score > Number.NEGATIVE_INFINITY)
    .sort((left, right) => {
      const leftHistoryRank = historyRank.get(left.command.id);
      const rightHistoryRank = historyRank.get(right.command.id);
      if (leftHistoryRank !== undefined || rightHistoryRank !== undefined) {
        if (leftHistoryRank === undefined) return 1;
        if (rightHistoryRank === undefined) return -1;
        return leftHistoryRank - rightHistoryRank;
      }

      return left.command.id.localeCompare(right.command.id);
    });
};

const scoreCommand = (value: string, query: string, preferTitle: boolean): number => {
  const normalizedValue = value.toLowerCase();
  if (query.length === 0) {
    return preferTitle ? 1 : 0;
  }

  if (normalizedValue === query) {
    return preferTitle ? 400 : 320;
  }

  if (normalizedValue.startsWith(query)) {
    return preferTitle ? 280 : 220;
  }

  const substringIndex = normalizedValue.indexOf(query);
  if (substringIndex >= 0) {
    return (preferTitle ? 180 : 140) - substringIndex;
  }

  let queryIndex = 0;
  let gapPenalty = 0;
  let streak = 0;
  let bestStreak = 0;

  for (let index = 0; index < normalizedValue.length && queryIndex < query.length; index += 1) {
    if (normalizedValue[index] === query[queryIndex]) {
      queryIndex += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else if (queryIndex > 0) {
      gapPenalty += 1;
      streak = 0;
    }
  }

  if (queryIndex !== query.length) {
    return Number.NEGATIVE_INFINITY;
  }

  return (preferTitle ? 100 : 80) + bestStreak * 6 - gapPenalty;
};
