import type { FoleaAppBridge } from './ipc/app';
import type { AppStateFileV1, AppStatePatch } from './ipc/app-state';
import type { FoleaEditorBridge } from './ipc/editor';
import type { KeysConfigLoadResponse } from './ipc/keys-config';
import type { FoleaSearchBridge } from './ipc/search';
import type { FoleaShellBridge } from './ipc/shell';
import type { FoleaVaultBridge, VaultHandle } from './ipc/vault';
import type {
  VaultStateFileV1,
  VaultStatePatch,
  ReadRenderCacheRequest,
  ReadRenderCacheResponse,
  WriteRenderCacheRequest,
  FoleaPrefs,
  FoleaThemePreference
} from './ipc/vault-state';

export interface FoleaAppStateBridge {
  load(): Promise<AppStateFileV1>;
  update(patch: AppStatePatch): Promise<AppStateFileV1>;
}

export interface FoleaVaultStateBridge {
  load(): Promise<VaultStateFileV1>;
  update(patch: VaultStatePatch): Promise<VaultStateFileV1>;
  readRenderCache(request: ReadRenderCacheRequest): Promise<ReadRenderCacheResponse>;
  writeRenderCache(request: WriteRenderCacheRequest): Promise<void>;
}

export interface FoleaPrefsBridge {
  load(): Promise<FoleaPrefs>;
  setTheme(theme: FoleaThemePreference): Promise<FoleaPrefs>;
}

export interface FoleaKeysConfigBridge {
  load(): Promise<KeysConfigLoadResponse>;
}

export interface FoleaVaultBridgeExtended extends FoleaVaultBridge {
  openLast(): Promise<VaultHandle | null>;
  openRecent(rootPath: string): Promise<VaultHandle | null>;
  close(): Promise<void>;
}

export interface FoleaBridge {
  app: FoleaAppBridge;
  appState: FoleaAppStateBridge;
  vaultState: FoleaVaultStateBridge;
  prefs: FoleaPrefsBridge;
  keysConfig: FoleaKeysConfigBridge;
  editor: FoleaEditorBridge;
  search: FoleaSearchBridge;
  shell: FoleaShellBridge;
  vault: FoleaVaultBridgeExtended;
}

declare global {
  interface Window {
    folea: FoleaBridge;
  }
}

export {};
