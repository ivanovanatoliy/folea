import { describe, expect, it } from 'vitest';

import {
  SEARCH_CANCEL_CHANNEL,
  SEARCH_START_CHANNEL,
  createSearchCancelRequest,
  createSearchStartRequest,
  parseSearchCancelInvokeRequest,
  parseSearchDoneEvent,
  parseSearchErrorEvent,
  parseSearchHit,
  parseSearchResultEvent,
  parseSearchStartInvokeRequest
} from '../../src/shared/ipc/search';

describe('search IPC contract', () => {
  it('accepts valid start/cancel requests', () => {
    expect(createSearchStartRequest('alpha')).toEqual({
      type: SEARCH_START_CHANNEL,
      query: 'alpha'
    });
    expect(createSearchStartRequest('alpha', { regex: true })).toEqual({
      type: SEARCH_START_CHANNEL,
      query: 'alpha',
      options: { regex: true }
    });
    expect(parseSearchStartInvokeRequest({ type: SEARCH_START_CHANNEL, query: 'alpha' })).toEqual({
      type: SEARCH_START_CHANNEL,
      query: 'alpha'
    });
    expect(createSearchCancelRequest()).toEqual({ type: SEARCH_CANCEL_CHANNEL });
    expect(parseSearchCancelInvokeRequest({ type: SEARCH_CANCEL_CHANNEL })).toEqual({
      type: SEARCH_CANCEL_CHANNEL
    });
  });

  it('rejects malformed requests and events', () => {
    expect(() => parseSearchStartInvokeRequest({ type: SEARCH_START_CHANNEL, query: 1 })).toThrow(
      TypeError
    );
    expect(() => parseSearchCancelInvokeRequest({ type: 'wrong' })).toThrow(TypeError);
    expect(() =>
      parseSearchHit({ relPath: '../escape.typ', line: 1, column: 1, preview: '' })
    ).toThrow(TypeError);
    expect(() => parseSearchResultEvent({ hits: [{}] })).toThrow(TypeError);
    expect(() => parseSearchDoneEvent({ truncated: 'no' })).toThrow(TypeError);
    expect(() => parseSearchErrorEvent({ message: '' })).toThrow(TypeError);
  });

  it('validates streamed hit shapes', () => {
    expect(
      parseSearchResultEvent({
        hits: [{ relPath: 'nested/alpha.typ', line: 3, column: 9, preview: 'Alpha preview' }]
      })
    ).toEqual({
      hits: [{ relPath: 'nested/alpha.typ', line: 3, column: 9, preview: 'Alpha preview' }]
    });
    expect(parseSearchDoneEvent({ truncated: true })).toEqual({ truncated: true });
    expect(parseSearchErrorEvent({ message: 'ripgrep failed' })).toEqual({
      message: 'ripgrep failed'
    });
  });
});
