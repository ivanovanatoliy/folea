import type { OutlineEntry } from '../../shared/worker/typst';

interface QueriedHeading {
  readonly level: number;
  readonly text: string;
}

interface PositionedText {
  readonly page: number;
  readonly text: string;
  readonly y: number;
}

interface StackEntry {
  readonly isPage: boolean;
  readonly page: number;
  readonly y: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const extractOutlineEntries = (
  queryResult: string,
  svg: string,
  fallbackPageY = 0
): readonly OutlineEntry[] => {
  const headings = parseQueriedHeadings(queryResult);
  if (headings.length === 0) {
    return [];
  }

  const positionedText = extractPositionedSelectableText(svg);
  let textCursor = 0;

  return headings.map((heading) => {
    const matched = findMatchingPosition(positionedText, heading.text, textCursor);
    if (matched !== undefined) {
      textCursor = matched.index + 1;
      return {
        level: heading.level,
        text: heading.text,
        position: { page: matched.item.page, y: matched.item.y }
      };
    }

    return {
      level: heading.level,
      text: heading.text,
      position: { page: 0, y: fallbackPageY }
    };
  });
};

const parseQueriedHeadings = (queryResult: string): readonly QueriedHeading[] => {
  const raw = JSON.parse(queryResult) as unknown;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((value) => {
    if (!isRecord(value) || typeof value.level !== 'number') {
      return [];
    }

    const text = extractHeadingText(value.body);
    if (text.length === 0) {
      return [];
    }

    return [{ level: value.level, text }];
  });
};

const extractHeadingText = (value: unknown): string => {
  if (typeof value === 'string') {
    return normalizeText(value);
  }

  if (Array.isArray(value)) {
    return normalizeText(value.map(extractHeadingText).join(' '));
  }

  if (!isRecord(value)) {
    return '';
  }

  if (typeof value.text === 'string') {
    return normalizeText(value.text);
  }

  const children = ['body', 'children', 'content']
    .map((key) => value[key])
    .filter((child) => child !== undefined);

  return normalizeText(children.map(extractHeadingText).join(' '));
};

const extractPositionedSelectableText = (svg: string): readonly PositionedText[] => {
  const tagPattern = /<\/?g\b[^>]*>|<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/g;
  const stack: StackEntry[] = [];
  let currentPage = 0;
  const results: PositionedText[] = [];

  for (const match of svg.matchAll(tagPattern)) {
    const token = match[0] ?? '';

    if (token.startsWith('</g')) {
      const popped = stack.pop();
      if (popped?.isPage) {
        currentPage = Math.max(0, currentPage - 1);
      }
      continue;
    }

    if (token.startsWith('<g')) {
      const parentY = stack[stack.length - 1]?.y ?? 0;
      const y = parentY + parseTranslateY(token);
      const isPage = /\bclass="[^"]*\btypst-page\b/.test(token);
      if (isPage) {
        currentPage += 1;
      }

      stack.push({ isPage, page: Math.max(0, currentPage - 1), y });
      continue;
    }

    const text = extractSelectableText(token);
    if (text.length === 0) {
      continue;
    }

    const active = stack[stack.length - 1];
    results.push({
      page: active?.page ?? 0,
      text,
      y: active?.y ?? 0
    });
  }

  return results;
};

const parseTranslateY = (tag: string): number => {
  const match = tag.match(/transform="translate\(\s*[-\d.]+\s*,\s*([-\d.]+)\s*\)"/);
  return match ? Number.parseFloat(match[1] ?? '0') : 0;
};

const extractSelectableText = (foreignObject: string): string => {
  const match = foreignObject.match(
    /<h5:(?:div|span)\b(?=[^>]*\bclass="[^"]*\btsel\b)[^>]*>([\s\S]*?)<\/h5:(?:div|span)>/
  );
  return normalizeText(decodeEntities(stripMarkup(match?.[1] ?? '')));
};

const stripMarkup = (value: string): string => value.replace(/<[^>]+>/g, '');

const decodeEntities = (value: string): string =>
  value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&nbsp;', ' ')
    .replace(/&#(\d+);/g, (_, digits: string) => decodeNumericEntity(digits, 10))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, digits: string) => decodeNumericEntity(digits, 16));

const decodeNumericEntity = (digits: string, radix: number): string => {
  const codePoint = Number.parseInt(digits, radix);
  if (!Number.isFinite(codePoint)) {
    return '';
  }

  return String.fromCodePoint(codePoint);
};

const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const findMatchingPosition = (
  positioned: readonly PositionedText[],
  headingText: string,
  startIndex: number
): { readonly index: number; readonly item: PositionedText } | undefined => {
  const normalizedHeading = normalizeText(headingText);

  for (let index = startIndex; index < positioned.length; index += 1) {
    const item = positioned[index];
    if (!item) {
      continue;
    }

    const normalizedItem = normalizeText(item.text);
    if (normalizedItem === normalizedHeading || normalizedItem.includes(normalizedHeading)) {
      return { index, item };
    }
  }

  return undefined;
};
