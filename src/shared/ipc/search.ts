import { assertSafeRelativePosixPath } from '../path';

export const SEARCH_START_CHANNEL = 'folea:search:start' as const;
export const SEARCH_CANCEL_CHANNEL = 'folea:search:cancel' as const;
export const SEARCH_RESULT_CHANNEL = 'folea:search:result' as const;
export const SEARCH_DONE_CHANNEL = 'folea:search:done' as const;
export const SEARCH_ERROR_CHANNEL = 'folea:search:error' as const;

export interface SearchOptions {
  readonly regex?: boolean;
  readonly ignoreCase?: boolean;
}

export interface SearchStartRequest {
  readonly type: typeof SEARCH_START_CHANNEL;
  readonly query: string;
  readonly options?: SearchOptions;
}

export interface SearchCancelRequest {
  readonly type: typeof SEARCH_CANCEL_CHANNEL;
}

export interface SearchHit {
  readonly relPath: string;
  readonly line: number;
  readonly column: number;
  readonly preview: string;
}

export interface SearchResultEvent {
  readonly hits: readonly SearchHit[];
}

export interface SearchDoneEvent {
  readonly truncated: boolean;
}

export interface SearchErrorEvent {
  readonly message: string;
}

export interface FoleaSearchBridge {
  start(query: string, options?: SearchOptions): void;
  cancel(): void;
  onResult(callback: (event: SearchResultEvent) => void): () => void;
  onDone(callback: (event: SearchDoneEvent) => void): () => void;
  onError(callback: (event: SearchErrorEvent) => void): () => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
};

const parseQuery = (value: unknown): string => {
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new TypeError('Search query must be a string');
  }

  if (value.length > 512) {
    throw new TypeError('Search query must be 512 characters or fewer');
  }

  return value;
};

const parsePositiveInteger = (value: unknown, label: string): number => {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new TypeError(`${label} must be a positive integer`);
  }

  return value as number;
};

export const parseSearchOptions = (value: unknown): SearchOptions | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value) || !hasOnlyKeys(value, ['regex', 'ignoreCase'])) {
    throw new TypeError('Malformed search options');
  }

  if (value.regex !== undefined && typeof value.regex !== 'boolean') {
    throw new TypeError('Malformed search options');
  }

  if (value.ignoreCase !== undefined && typeof value.ignoreCase !== 'boolean') {
    throw new TypeError('Malformed search options');
  }

  return {
    ...(value.regex === undefined ? {} : { regex: value.regex }),
    ...(value.ignoreCase === undefined ? {} : { ignoreCase: value.ignoreCase })
  };
};

export const createSearchStartRequest = (
  query: string,
  options?: SearchOptions
): SearchStartRequest => {
  const parsedOptions = parseSearchOptions(options);
  return {
    type: SEARCH_START_CHANNEL,
    query: parseQuery(query),
    ...(parsedOptions === undefined ? {} : { options: parsedOptions })
  };
};

export const parseSearchStartInvokeRequest = (value: unknown): SearchStartRequest => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['type', 'query', 'options'])) {
    throw new TypeError('Malformed search.start request');
  }

  if (value.type !== SEARCH_START_CHANNEL) {
    throw new TypeError('Malformed search.start request');
  }

  const parsedOptions = parseSearchOptions(value.options);

  return {
    type: SEARCH_START_CHANNEL,
    query: parseQuery(value.query),
    ...(parsedOptions === undefined ? {} : { options: parsedOptions })
  };
};

export const createSearchCancelRequest = (): SearchCancelRequest => ({
  type: SEARCH_CANCEL_CHANNEL
});

export const parseSearchCancelInvokeRequest = (value: unknown): SearchCancelRequest => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['type']) || value.type !== SEARCH_CANCEL_CHANNEL) {
    throw new TypeError('Malformed search.cancel request');
  }

  return { type: SEARCH_CANCEL_CHANNEL };
};

export const parseSearchHit = (value: unknown): SearchHit => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['relPath', 'line', 'column', 'preview'])) {
    throw new TypeError('Malformed search hit');
  }

  if (typeof value.preview !== 'string' || value.preview.includes('\0')) {
    throw new TypeError('Malformed search hit');
  }

  return {
    relPath: assertSafeRelativePosixPath(String(value.relPath), {
      label: 'search hit path',
      allowedSuffixes: ['.typ']
    }),
    line: parsePositiveInteger(value.line, 'search hit line'),
    column: parsePositiveInteger(value.column, 'search hit column'),
    preview: value.preview
  };
};

export const parseSearchResultEvent = (value: unknown): SearchResultEvent => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['hits']) || !Array.isArray(value.hits)) {
    throw new TypeError('Malformed search.result event');
  }

  return { hits: value.hits.map(parseSearchHit) };
};

export const parseSearchDoneEvent = (value: unknown): SearchDoneEvent => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['truncated']) ||
    typeof value.truncated !== 'boolean'
  ) {
    throw new TypeError('Malformed search.done event');
  }

  return { truncated: value.truncated };
};

export const parseSearchErrorEvent = (value: unknown): SearchErrorEvent => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['message']) || typeof value.message !== 'string') {
    throw new TypeError('Malformed search.error event');
  }

  if (value.message.length === 0 || value.message.includes('\0')) {
    throw new TypeError('Malformed search.error event');
  }

  return { message: value.message };
};
