import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import {
  APP_VERSION_CHANNEL,
  parseAppVersionRequestArgs,
  parseAppVersionResponse
} from '../shared/ipc/app';
import {
  APP_STATE_LOAD_CHANNEL,
  APP_STATE_UPDATE_CHANNEL,
  parseAppStateFileV1,
  parseAppStatePatch,
  type AppStateFileV1,
  type AppStatePatch
} from '../shared/ipc/app-state';
import {
  EDITOR_OPEN_CHANNEL,
  validateEditorOpenRelPath
} from '../shared/ipc/editor';
import {
  KEYS_CONFIG_LOAD_CHANNEL,
  parseKeysConfigLoadResponse,
  type KeysConfigLoadResponse
} from '../shared/ipc/keys-config';
import {
  createSearchCancelRequest,
  createSearchStartRequest,
  parseSearchDoneEvent,
  parseSearchErrorEvent,
  parseSearchOptions,
  parseSearchResultEvent,
  SEARCH_CANCEL_CHANNEL,
  SEARCH_DONE_CHANNEL,
  SEARCH_ERROR_CHANNEL,
  SEARCH_RESULT_CHANNEL,
  SEARCH_START_CHANNEL,
  type SearchDoneEvent,
  type SearchErrorEvent,
  type SearchOptions,
  type SearchResultEvent
} from '../shared/ipc/search';
import {
  validateShellOpenExternalRequest,
  type FoleaShellBridge
} from '../shared/ipc/shell';
import {
  createCreateNoteRequest,
  createDeleteNoteRequest,
  createReadNoteRequest,
  createRenameNoteRequest,
  parseCreateNoteRequest,
  parseDeleteNoteRequest,
  parseListNotesRequestArgs,
  parseListRenderFilesRequestArgs,
  parseNoteMeta,
  parseNoteMetaList,
  parseOpenVaultRequestArgs,
  parseReadNoteRequest,
  parseReadNoteResponse,
  parseRenameNoteRequest,
  parseVaultChange,
  parseVaultHandle,
  parseVaultRenderFileList,
  parseVoidResponse,
  type CreateNoteRequest,
  type DeleteNoteRequest,
  type ReadNoteRequest,
  type RenameNoteRequest,
  VAULT_CHANGED_CHANNEL,
  VAULT_CREATE_CHANNEL,
  VAULT_DELETE_CHANNEL,
  VAULT_LIST_CHANNEL,
  VAULT_OPEN_CHANNEL,
  VAULT_READ_CHANNEL,
  VAULT_RENDER_FILES_CHANNEL,
  VAULT_RENAME_CHANNEL,
  type VaultChange
} from '../shared/ipc/vault';
import {
  VAULT_STATE_LOAD_CHANNEL,
  VAULT_STATE_UPDATE_CHANNEL,
  VAULT_STATE_READ_RENDER_CACHE_CHANNEL,
  VAULT_STATE_WRITE_RENDER_CACHE_CHANNEL,
  VAULT_OPEN_LAST_CHANNEL,
  VAULT_OPEN_RECENT_CHANNEL,
  VAULT_CLOSE_CHANNEL,
  PREFS_LOAD_CHANNEL,
  PREFS_SET_THEME_CHANNEL,
  parseVaultStatePatch,
  parseReadRenderCacheRequest,
  parseWriteRenderCacheRequest,
  parseReadRenderCacheResponse,
  parseFoleaPrefs,
  parseFoleaThemePreference,
  parseVaultStateFileV1,
  type VaultStateFileV1,
  type VaultStatePatch,
  type ReadRenderCacheRequest,
  type ReadRenderCacheResponse,
  type WriteRenderCacheRequest,
  type FoleaPrefs,
  type FoleaThemePreference
} from '../shared/ipc/vault-state';
import type { FoleaBridge } from '../shared/window';

const bridge: FoleaBridge = Object.freeze({
  app: Object.freeze({
    version: async (...args: []): Promise<string> => {
      const request = parseAppVersionRequestArgs(args);
      const response = await ipcRenderer.invoke(APP_VERSION_CHANNEL, request);
      return parseAppVersionResponse(response);
    }
  }),

  appState: Object.freeze({
    load: async (): Promise<AppStateFileV1> => {
      const response = await ipcRenderer.invoke(APP_STATE_LOAD_CHANNEL);
      return parseAppStateFileV1(response);
    },
    update: async (patch: AppStatePatch): Promise<AppStateFileV1> => {
      const validated = parseAppStatePatch(patch);
      const response = await ipcRenderer.invoke(APP_STATE_UPDATE_CHANNEL, validated);
      return parseAppStateFileV1(response);
    }
  }),

  vaultState: Object.freeze({
    load: async (): Promise<VaultStateFileV1> => {
      const response = await ipcRenderer.invoke(VAULT_STATE_LOAD_CHANNEL);
      return parseVaultStateFileV1(response);
    },
    update: async (patch: VaultStatePatch): Promise<VaultStateFileV1> => {
      const validated = parseVaultStatePatch(patch);
      const response = await ipcRenderer.invoke(VAULT_STATE_UPDATE_CHANNEL, validated);
      return parseVaultStateFileV1(response);
    },
    readRenderCache: async (request: ReadRenderCacheRequest): Promise<ReadRenderCacheResponse> => {
      const validated = parseReadRenderCacheRequest(request);
      const response = await ipcRenderer.invoke(VAULT_STATE_READ_RENDER_CACHE_CHANNEL, validated);
      return parseReadRenderCacheResponse(response);
    },
    writeRenderCache: async (request: WriteRenderCacheRequest): Promise<void> => {
      const validated = parseWriteRenderCacheRequest(request);
      await ipcRenderer.invoke(VAULT_STATE_WRITE_RENDER_CACHE_CHANNEL, validated);
    }
  }),

  prefs: Object.freeze({
    load: async (): Promise<FoleaPrefs> => {
      const response = await ipcRenderer.invoke(PREFS_LOAD_CHANNEL);
      return parseFoleaPrefs(response);
    },
    setTheme: async (theme: FoleaThemePreference): Promise<FoleaPrefs> => {
      const validated = parseFoleaThemePreference(theme);
      const response = await ipcRenderer.invoke(PREFS_SET_THEME_CHANNEL, validated);
      return parseFoleaPrefs(response);
    }
  }),

  keysConfig: Object.freeze({
    load: async (): Promise<KeysConfigLoadResponse> => {
      const response = await ipcRenderer.invoke(KEYS_CONFIG_LOAD_CHANNEL);
      return parseKeysConfigLoadResponse(response);
    }
  }),

  editor: Object.freeze({
    open: async (relPath: string): Promise<void> => {
      validateEditorOpenRelPath(relPath);
      await ipcRenderer.invoke(EDITOR_OPEN_CHANNEL, relPath);
    }
  }),

  search: Object.freeze({
    start: (query: string, options?: SearchOptions) => {
      ipcRenderer.send(
        SEARCH_START_CHANNEL,
        createSearchStartRequest(query, parseSearchOptions(options))
      );
    },
    cancel: () => {
      ipcRenderer.send(SEARCH_CANCEL_CHANNEL, createSearchCancelRequest());
    },
    onResult: (callback: (event: SearchResultEvent) => void) => {
      if (typeof callback !== 'function') {
        throw new TypeError('search.onResult callback must be a function');
      }

      const listener = (_event: IpcRendererEvent, rawEvent: unknown): void => {
        callback(parseSearchResultEvent(rawEvent));
      };

      ipcRenderer.on(SEARCH_RESULT_CHANNEL, listener);
      return () => ipcRenderer.removeListener(SEARCH_RESULT_CHANNEL, listener);
    },
    onDone: (callback: (event: SearchDoneEvent) => void) => {
      if (typeof callback !== 'function') {
        throw new TypeError('search.onDone callback must be a function');
      }

      const listener = (_event: IpcRendererEvent, rawEvent: unknown): void => {
        callback(parseSearchDoneEvent(rawEvent));
      };

      ipcRenderer.on(SEARCH_DONE_CHANNEL, listener);
      return () => ipcRenderer.removeListener(SEARCH_DONE_CHANNEL, listener);
    },
    onError: (callback: (event: SearchErrorEvent) => void) => {
      if (typeof callback !== 'function') {
        throw new TypeError('search.onError callback must be a function');
      }

      const listener = (_event: IpcRendererEvent, rawEvent: unknown): void => {
        callback(parseSearchErrorEvent(rawEvent));
      };

      ipcRenderer.on(SEARCH_ERROR_CHANNEL, listener);
      return () => ipcRenderer.removeListener(SEARCH_ERROR_CHANNEL, listener);
    }
  }),

  vault: Object.freeze({
    open: async (...args: unknown[]) => {
      const request = parseOpenVaultRequestArgs(args);
      const response = await ipcRenderer.invoke(VAULT_OPEN_CHANNEL, request);
      return parseVaultHandle(response);
    },
    openLast: async () => {
      const response = await ipcRenderer.invoke(VAULT_OPEN_LAST_CHANNEL);
      if (response === null || response === undefined) {
        return null;
      }

      return parseVaultHandle(response);
    },
    openRecent: async (rootPath: string) => {
      const response = await ipcRenderer.invoke(VAULT_OPEN_RECENT_CHANNEL, rootPath);
      if (response === null || response === undefined) {
        return null;
      }

      return parseVaultHandle(response);
    },
    close: async () => {
      await ipcRenderer.invoke(VAULT_CLOSE_CHANNEL);
    },
    list: async (...args: []) => {
      const request = parseListNotesRequestArgs(args);
      const response = await ipcRenderer.invoke(VAULT_LIST_CHANNEL, request);
      return parseNoteMetaList(response);
    },
    renderFiles: async (...args: []) => {
      const request = parseListRenderFilesRequestArgs(args);
      const response = await ipcRenderer.invoke(VAULT_RENDER_FILES_CHANNEL, request);
      return parseVaultRenderFileList(response);
    },
    read: async (request: ReadNoteRequest) => {
      const response = await ipcRenderer.invoke(
        VAULT_READ_CHANNEL,
        createReadNoteRequest(parseReadNoteRequest(request))
      );
      return parseReadNoteResponse(response);
    },
    create: async (request: CreateNoteRequest) => {
      const response = await ipcRenderer.invoke(
        VAULT_CREATE_CHANNEL,
        createCreateNoteRequest(parseCreateNoteRequest(request))
      );
      return parseNoteMeta(response);
    },
    rename: async (request: RenameNoteRequest) => {
      const response = await ipcRenderer.invoke(
        VAULT_RENAME_CHANNEL,
        createRenameNoteRequest(parseRenameNoteRequest(request))
      );
      return parseNoteMeta(response);
    },
    delete: async (request: DeleteNoteRequest) => {
      const response = await ipcRenderer.invoke(
        VAULT_DELETE_CHANNEL,
        createDeleteNoteRequest(parseDeleteNoteRequest(request))
      );
      parseVoidResponse(response);
    },
    onChanged: (callback: (event: VaultChange) => void) => {
      if (typeof callback !== 'function') {
        throw new TypeError('vault.onChanged callback must be a function');
      }

      const listener = (_event: IpcRendererEvent, rawEvent: unknown): void => {
        callback(parseVaultChange(rawEvent));
      };

      ipcRenderer.on(VAULT_CHANGED_CHANNEL, listener);
      return () => ipcRenderer.removeListener(VAULT_CHANGED_CHANNEL, listener);
    }
  }),

  shell: Object.freeze({
    openExternal: async (url: string): Promise<void> => {
      await ipcRenderer.invoke(
        'shell:openExternal',
        validateShellOpenExternalRequest({ url })
      );
    }
  }) as FoleaShellBridge
});

contextBridge.exposeInMainWorld('folea', bridge);
