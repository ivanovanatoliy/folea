export const APP_STATE_LOAD_CHANNEL = 'folea:appState:load' as const;
export const APP_STATE_REMOVE_RECENT_CHANNEL = 'folea:appState:removeRecent' as const;

export const RECENT_VAULTS_MAX = 10;

export interface AppStateFileV1 {
  readonly schemaVersion: 1;
  readonly updatedAt: string;
  readonly lastOpenedVaultPath: string | null;
  readonly recentVaults: readonly string[];
}

export type AppStatePatch =
  | { readonly type: 'setLastOpenedVault'; readonly rootPath: string }
  | { readonly type: 'removeRecentVault'; readonly rootPath: string }
  | { readonly type: 'clearInvalidLastOpenedVault' };

export type RemoveRecentVaultRequest = Extract<AppStatePatch, { type: 'removeRecentVault' }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseAppStateFileV1 = (value: unknown): AppStateFileV1 => {
  if (!isRecord(value)) {
    throw new TypeError('Malformed app state');
  }

  if (value.schemaVersion !== 1) {
    throw new TypeError('Unsupported app state schema version');
  }

  if (typeof value.updatedAt !== 'string') {
    throw new TypeError('Malformed app state');
  }

  if (value.lastOpenedVaultPath !== null && typeof value.lastOpenedVaultPath !== 'string') {
    throw new TypeError('Malformed app state');
  }

  const recentVaults = Array.isArray(value.recentVaults)
    ? (value.recentVaults as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];

  return {
    schemaVersion: 1,
    updatedAt: value.updatedAt,
    lastOpenedVaultPath: value.lastOpenedVaultPath as string | null,
    recentVaults
  };
};

const parseAbsolutePath = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new TypeError('rootPath must be a non-empty string');
  }

  if (!value.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(value)) {
    throw new TypeError('rootPath must be absolute');
  }

  return value;
};

export const parseAppStatePatch = (value: unknown): AppStatePatch => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new TypeError('Malformed app state patch');
  }

  switch (value.type) {
    case 'setLastOpenedVault': {
      return { type: 'setLastOpenedVault', rootPath: parseAbsolutePath(value.rootPath) };
    }

    case 'removeRecentVault': {
      return { type: 'removeRecentVault', rootPath: parseAbsolutePath(value.rootPath) };
    }

    case 'clearInvalidLastOpenedVault': {
      return { type: 'clearInvalidLastOpenedVault' };
    }

    default:
      throw new TypeError('Unknown app state patch type');
  }
};

export const parseRemoveRecentVaultRequest = (value: unknown): RemoveRecentVaultRequest => {
  const patch = parseAppStatePatch(value);
  if (patch.type !== 'removeRecentVault') {
    throw new TypeError('Only recent vault removal is available to the renderer');
  }
  return patch;
};

export const defaultAppState = (): AppStateFileV1 => ({
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  lastOpenedVaultPath: null,
  recentVaults: []
});
