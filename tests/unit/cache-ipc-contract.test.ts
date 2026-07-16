import { describe, expect, it } from 'vitest';

import {
  CACHE_CLEAR_APPLICATION_CHANNEL,
  CACHE_CLEAR_CURRENT_VAULT_CHANNEL,
  createClearApplicationCacheRequest,
  createClearCurrentVaultCacheRequest,
  parseCacheClearInvokeRequest,
  parseCacheClearRequestArgs,
  parseCacheClearResponse
} from '../../src/shared/ipc/cache';

describe('cache IPC contract', () => {
  it('creates and accepts both cache clear requests', () => {
    const vaultRequest = createClearCurrentVaultCacheRequest();
    const applicationRequest = createClearApplicationCacheRequest();

    expect(vaultRequest).toEqual({ type: CACHE_CLEAR_CURRENT_VAULT_CHANNEL });
    expect(applicationRequest).toEqual({ type: CACHE_CLEAR_APPLICATION_CHANNEL });
    expect(parseCacheClearRequestArgs([], CACHE_CLEAR_CURRENT_VAULT_CHANNEL)).toEqual(vaultRequest);
    expect(parseCacheClearInvokeRequest(vaultRequest, CACHE_CLEAR_CURRENT_VAULT_CHANNEL)).toEqual(
      vaultRequest
    );
    expect(
      parseCacheClearInvokeRequest(applicationRequest, CACHE_CLEAR_APPLICATION_CHANNEL)
    ).toEqual(applicationRequest);
  });

  it('rejects malformed requests', () => {
    expect(() =>
      parseCacheClearRequestArgs(['unexpected'], CACHE_CLEAR_APPLICATION_CHANNEL)
    ).toThrow(TypeError);
    expect(() =>
      parseCacheClearInvokeRequest(
        { type: CACHE_CLEAR_APPLICATION_CHANNEL, extra: true },
        CACHE_CLEAR_APPLICATION_CHANNEL
      )
    ).toThrow(TypeError);
    expect(() =>
      parseCacheClearInvokeRequest(
        createClearCurrentVaultCacheRequest(),
        CACHE_CLEAR_APPLICATION_CHANNEL
      )
    ).toThrow(TypeError);
  });

  it('validates clear results and rejects impossible application states', () => {
    expect(parseCacheClearResponse({ scope: 'current-vault', status: 'cleared' })).toEqual({
      scope: 'current-vault',
      status: 'cleared'
    });
    expect(parseCacheClearResponse({ scope: 'current-vault', status: 'no-vault' })).toEqual({
      scope: 'current-vault',
      status: 'no-vault'
    });
    expect(parseCacheClearResponse({ scope: 'application', status: 'cleared' })).toEqual({
      scope: 'application',
      status: 'cleared'
    });
    expect(() => parseCacheClearResponse({ scope: 'application', status: 'no-vault' })).toThrow(
      TypeError
    );
    expect(() =>
      parseCacheClearResponse({ scope: 'current-vault', status: 'cleared', extra: true })
    ).toThrow(TypeError);
  });
});
