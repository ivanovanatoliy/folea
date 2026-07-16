export const CACHE_CLEAR_CURRENT_VAULT_CHANNEL = 'folea:cache:clearCurrentVault' as const;
export const CACHE_CLEAR_APPLICATION_CHANNEL = 'folea:cache:clearApplication' as const;

export type CacheClearScope = 'current-vault' | 'application';
export type CacheClearStatus = 'cleared' | 'no-vault';

export interface CacheClearRequest {
  readonly type: typeof CACHE_CLEAR_CURRENT_VAULT_CHANNEL | typeof CACHE_CLEAR_APPLICATION_CHANNEL;
}

export interface CacheClearResponse {
  readonly scope: CacheClearScope;
  readonly status: CacheClearStatus;
}

export interface FoleaCacheBridge {
  clearCurrentVault(): Promise<CacheClearResponse>;
  clearApplication(): Promise<CacheClearResponse>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const createRequest = (type: CacheClearRequest['type']): CacheClearRequest => ({ type });

export const createClearCurrentVaultCacheRequest = (): CacheClearRequest =>
  createRequest(CACHE_CLEAR_CURRENT_VAULT_CHANNEL);

export const createClearApplicationCacheRequest = (): CacheClearRequest =>
  createRequest(CACHE_CLEAR_APPLICATION_CHANNEL);

export const parseCacheClearRequestArgs = (
  args: readonly unknown[],
  type: CacheClearRequest['type']
): CacheClearRequest => {
  if (args.length !== 0) {
    throw new TypeError('Cache clear commands accept no arguments');
  }
  return createRequest(type);
};

export const parseCacheClearInvokeRequest = (
  value: unknown,
  type: CacheClearRequest['type']
): CacheClearRequest => {
  if (!isRecord(value) || value.type !== type || Object.keys(value).length !== 1) {
    throw new TypeError('Malformed cache clear request');
  }
  return createRequest(type);
};

export const parseCacheClearResponse = (value: unknown): CacheClearResponse => {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== 'scope' && key !== 'status') ||
    (value.scope !== 'current-vault' && value.scope !== 'application') ||
    (value.status !== 'cleared' && value.status !== 'no-vault') ||
    (value.scope === 'application' && value.status === 'no-vault')
  ) {
    throw new TypeError('Malformed cache clear response');
  }

  return { scope: value.scope, status: value.status };
};
