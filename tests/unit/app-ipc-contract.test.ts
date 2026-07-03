import { describe, expect, it } from 'vitest';

import {
  APP_VERSION_CHANNEL,
  createAppVersionRequest,
  parseAppVersionInvokeRequest,
  parseAppVersionRequestArgs,
  parseAppVersionResponse
} from '../../src/shared/ipc/app';

describe('app.version IPC contract', () => {
  it('creates and accepts the expected request shape', () => {
    expect(createAppVersionRequest()).toEqual({ type: APP_VERSION_CHANNEL });
    expect(parseAppVersionRequestArgs([])).toEqual({ type: APP_VERSION_CHANNEL });
    expect(parseAppVersionInvokeRequest({ type: APP_VERSION_CHANNEL })).toEqual({
      type: APP_VERSION_CHANNEL
    });
  });

  it('rejects malformed preload request arguments', () => {
    expect(() => parseAppVersionRequestArgs(['unexpected'])).toThrow(TypeError);
  });

  it('rejects malformed main-process invoke payloads', () => {
    expect(() => parseAppVersionInvokeRequest(null)).toThrow(TypeError);
    expect(() => parseAppVersionInvokeRequest({ type: 'wrong-channel' })).toThrow(TypeError);
    expect(() => parseAppVersionInvokeRequest({ type: APP_VERSION_CHANNEL, extra: true })).toThrow(
      TypeError
    );
  });

  it('validates the response shape', () => {
    expect(parseAppVersionResponse('0.0.0')).toBe('0.0.0');
    expect(() => parseAppVersionResponse('')).toThrow(TypeError);
    expect(() => parseAppVersionResponse(1)).toThrow(TypeError);
  });
});
