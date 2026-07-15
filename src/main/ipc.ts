import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { APP_VERSION_CHANNEL, parseAppVersionInvokeRequest } from '../shared/ipc/app';
import { EDITOR_OPEN_CHANNEL, validateEditorOpenRelPath } from '../shared/ipc/editor';
import { KEYS_CONFIG_LOAD_CHANNEL, parseKeysConfigLoadResponse } from '../shared/ipc/keys-config';
import {
  parseSearchCancelInvokeRequest,
  SEARCH_CANCEL_CHANNEL,
  SEARCH_START_CHANNEL
} from '../shared/ipc/search';
import {
  parseAnalyzeVaultOperationInvokeRequest,
  parseCreateDirectoryInvokeRequest,
  parseCreateNoteInvokeRequest,
  parseDeleteNoteInvokeRequest,
  parseListRenderFilesInvokeRequest,
  parseListNotesInvokeRequest,
  parseNoteMeta,
  parseNoteMetaList,
  parseOpenVaultInvokeRequest,
  parseReadNoteInvokeRequest,
  parseReadNoteResponse,
  parseRenameNoteInvokeRequest,
  parseRenameVaultEntryInvokeRequest,
  parseMoveVaultEntriesInvokeRequest,
  parseTrashVaultEntriesInvokeRequest,
  parseMoveVaultEntriesResult,
  parseTrashVaultEntriesResult,
  parseVaultDirectory,
  parseVaultOperationImpact,
  parseVaultSnapshot,
  parseVaultSnapshotInvokeRequest,
  parseVaultTemplateList,
  parseVaultTemplatesInvokeRequest,
  parseVaultChange,
  parseVaultHandle,
  parseVaultRenderFileList,
  parseVoidResponse,
  VAULT_CHANGED_CHANNEL,
  VAULT_ANALYZE_OPERATION_CHANNEL,
  VAULT_CREATE_DIRECTORY_CHANNEL,
  VAULT_CREATE_CHANNEL,
  VAULT_DELETE_CHANNEL,
  VAULT_LIST_CHANNEL,
  VAULT_OPEN_CHANNEL,
  VAULT_READ_CHANNEL,
  VAULT_RENDER_FILES_CHANNEL,
  VAULT_RENAME_CHANNEL,
  VAULT_RENAME_ENTRY_CHANNEL,
  VAULT_MOVE_BATCH_CHANNEL,
  VAULT_TRASH_BATCH_CHANNEL,
  VAULT_SNAPSHOT_CHANNEL,
  VAULT_TEMPLATES_CHANNEL
} from '../shared/ipc/vault';
import { validateShellOpenExternalRequest } from '../shared/ipc/shell';
import {
  APP_STATE_LOAD_CHANNEL,
  APP_STATE_REMOVE_RECENT_CHANNEL,
  parseRemoveRecentVaultRequest,
  parseAppStateFileV1
} from '../shared/ipc/app-state';
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
  parseFoleaPrefs,
  parseFoleaThemePreference
} from '../shared/ipc/vault-state';
import { EditorLauncher } from './editor-launcher';
import { SearchService } from './search-service';
import { installBoundedShutdown } from './shutdown';
import { vaultService } from './vault/service';
import { loadAppState, updateAppState } from './app-state';
import { VaultStateManager } from './vault-state';
import { loadKeysConfigContent, loadResolvedPrefs, setScopedThemePreference } from './config';

let vaultBroadcastUnsubscribe: (() => void) | undefined;
let cleanupRegistered = false;
const searchService = new SearchService();
const editorLauncher = new EditorLauncher();
let vaultStateManager: VaultStateManager | undefined;

const isExplicitVaultPathOpenAllowed = (): boolean =>
  process.env.FOLEA_ALLOW_TEST_VAULT_OPEN === '1';

const openVaultFromRequest = async (
  request: ReturnType<typeof parseOpenVaultInvokeRequest>,
  senderWindow: BrowserWindow | null
) => {
  if (request.rootPath !== undefined) {
    if (!isExplicitVaultPathOpenAllowed()) {
      throw new Error('Opening a renderer-provided vault path is only available in test mode');
    }

    return openVaultAndUpdateState(request.rootPath);
  }

  // In test mode, allow skipping the dialog via env var
  const testDialogPath = process.env.FOLEA_TEST_VAULT_PATH_FOR_DIALOG;
  if (testDialogPath && isExplicitVaultPathOpenAllowed()) {
    return openVaultAndUpdateState(testDialogPath);
  }

  const dialogOptions: OpenDialogOptions = {
    properties: ['openDirectory'],
    title: 'Open Typst vault'
  };

  const result = senderWindow
    ? await dialog.showOpenDialog(senderWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || result.filePaths[0] === undefined) {
    throw new Error('Vault open cancelled');
  }

  return openVaultAndUpdateState(result.filePaths[0]);
};

const openVaultAndUpdateState = async (rootPath: string) => {
  const handle = await vaultService.open(rootPath);
  vaultStateManager = new VaultStateManager(vaultService.getOpenRoot()!.realRoot);

  // Update global last-opened vault
  await updateAppState({
    type: 'setLastOpenedVault',
    rootPath: vaultService.getOpenRoot()!.realRoot
  });

  return handle;
};

const validateLastVaultPath = async (vaultPath: string): Promise<boolean> => {
  try {
    if (!path.isAbsolute(vaultPath)) {
      return false;
    }

    const stats = await fs.stat(vaultPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
};

export const openConfiguredVaultFromEnvironment = async (): Promise<void> => {
  const rootPath = process.env.FOLEA_TEST_VAULT_PATH;
  if (rootPath === undefined) {
    return;
  }

  if (!isExplicitVaultPathOpenAllowed()) {
    throw new Error('FOLEA_TEST_VAULT_PATH requires FOLEA_ALLOW_TEST_VAULT_OPEN=1');
  }

  await vaultService.open(rootPath);
  vaultStateManager = new VaultStateManager(vaultService.getOpenRoot()!.realRoot);
  await updateAppState({
    type: 'setLastOpenedVault',
    rootPath: vaultService.getOpenRoot()!.realRoot
  });
};

export const registerIpcHandlers = (): void => {
  ipcMain.removeHandler(APP_VERSION_CHANNEL);
  ipcMain.handle(APP_VERSION_CHANNEL, (_event, request: unknown) => {
    parseAppVersionInvokeRequest(request);
    return app.getVersion();
  });

  // ── App state ────────────────────────────────────────────────────────────────

  ipcMain.removeHandler(APP_STATE_LOAD_CHANNEL);
  ipcMain.handle(APP_STATE_LOAD_CHANNEL, async () => {
    return parseAppStateFileV1(await loadAppState());
  });

  ipcMain.removeHandler(APP_STATE_REMOVE_RECENT_CHANNEL);
  ipcMain.handle(APP_STATE_REMOVE_RECENT_CHANNEL, async (_event, request: unknown) => {
    const patch = parseRemoveRecentVaultRequest(request);
    return parseAppStateFileV1(await updateAppState(patch));
  });

  // ── Vault state ──────────────────────────────────────────────────────────────

  ipcMain.removeHandler(VAULT_STATE_LOAD_CHANNEL);
  ipcMain.handle(VAULT_STATE_LOAD_CHANNEL, async () => {
    const manager = vaultStateManager;
    if (!manager) {
      throw new Error('No vault is open');
    }

    return await manager.load();
  });

  ipcMain.removeHandler(VAULT_STATE_UPDATE_CHANNEL);
  ipcMain.handle(VAULT_STATE_UPDATE_CHANNEL, async (_event, request: unknown) => {
    const manager = vaultStateManager;
    if (!manager) {
      throw new Error('No vault is open');
    }

    const patch = parseVaultStatePatch(request);
    return await manager.update(patch);
  });

  ipcMain.removeHandler(VAULT_STATE_READ_RENDER_CACHE_CHANNEL);
  ipcMain.handle(VAULT_STATE_READ_RENDER_CACHE_CHANNEL, async (_event, request: unknown) => {
    const manager = vaultStateManager;
    if (!manager) {
      throw new Error('No vault is open');
    }

    const parsed = parseReadRenderCacheRequest(request);
    return await manager.readRenderCache(parsed);
  });

  ipcMain.removeHandler(VAULT_STATE_WRITE_RENDER_CACHE_CHANNEL);
  ipcMain.handle(VAULT_STATE_WRITE_RENDER_CACHE_CHANNEL, async (_event, request: unknown) => {
    const manager = vaultStateManager;
    if (!manager) {
      throw new Error('No vault is open');
    }

    const parsed = parseWriteRenderCacheRequest(request);
    await manager.writeRenderCache(parsed);
    return undefined;
  });

  // ── Vault open last ──────────────────────────────────────────────────────────

  ipcMain.removeHandler(VAULT_OPEN_LAST_CHANNEL);
  ipcMain.handle(VAULT_OPEN_LAST_CHANNEL, async () => {
    const appState = await loadAppState();
    const lastPath = appState.lastOpenedVaultPath;

    if (!lastPath) {
      return null;
    }

    const valid = await validateLastVaultPath(lastPath);
    if (!valid) {
      await updateAppState({ type: 'clearInvalidLastOpenedVault' });
      return null;
    }

    try {
      const handle = await openVaultAndUpdateState(lastPath);
      return parseVaultHandle(handle);
    } catch {
      await updateAppState({ type: 'clearInvalidLastOpenedVault' });
      return null;
    }
  });

  // ── Vault open recent ────────────────────────────────────────────────────────

  ipcMain.removeHandler(VAULT_OPEN_RECENT_CHANNEL);
  ipcMain.handle(VAULT_OPEN_RECENT_CHANNEL, async (_event, request: unknown) => {
    if (typeof request !== 'string' || !path.isAbsolute(request)) {
      throw new TypeError('openRecent requires an absolute path string');
    }

    const appState = await loadAppState();
    if (!appState.recentVaults.includes(request)) {
      throw new Error('Vault path is not in the recent vaults list');
    }

    const valid = await validateLastVaultPath(request);
    if (!valid) {
      throw new Error(`Vault is not accessible: ${request}`);
    }

    const handle = await openVaultAndUpdateState(request);
    return parseVaultHandle(handle);
  });

  // ── Vault close ──────────────────────────────────────────────────────────────

  ipcMain.removeHandler(VAULT_CLOSE_CHANNEL);
  ipcMain.handle(VAULT_CLOSE_CHANNEL, async () => {
    searchService.cancel();
    await vaultService.close();
    vaultStateManager = undefined;
    return undefined;
  });

  // ── Prefs ────────────────────────────────────────────────────────────────────

  ipcMain.removeHandler(PREFS_LOAD_CHANNEL);
  ipcMain.handle(PREFS_LOAD_CHANNEL, async () => {
    return parseFoleaPrefs(await loadResolvedPrefs(vaultService.getOpenRoot()?.realRoot));
  });

  ipcMain.removeHandler(PREFS_SET_THEME_CHANNEL);
  ipcMain.handle(PREFS_SET_THEME_CHANNEL, async (_event, request: unknown) => {
    const theme = parseFoleaThemePreference(request);
    const vaultRoot = vaultService.getOpenRoot()?.realRoot;

    return parseFoleaPrefs(await setScopedThemePreference(theme, vaultRoot));
  });

  ipcMain.removeHandler(KEYS_CONFIG_LOAD_CHANNEL);
  ipcMain.handle(KEYS_CONFIG_LOAD_CHANNEL, async () => {
    return parseKeysConfigLoadResponse(await loadKeysConfigContent());
  });

  // ── Vault CRUD ───────────────────────────────────────────────────────────────

  ipcMain.removeHandler(VAULT_OPEN_CHANNEL);
  ipcMain.handle(VAULT_OPEN_CHANNEL, async (event, request: unknown) => {
    const parsedRequest = parseOpenVaultInvokeRequest(request);
    const handle = await openVaultFromRequest(
      parsedRequest,
      BrowserWindow.fromWebContents(event.sender)
    );
    return parseVaultHandle(handle);
  });

  ipcMain.removeHandler(VAULT_LIST_CHANNEL);
  ipcMain.handle(VAULT_LIST_CHANNEL, async (_event, request: unknown) => {
    parseListNotesInvokeRequest(request);
    return parseNoteMetaList(await vaultService.list());
  });

  ipcMain.removeHandler(VAULT_SNAPSHOT_CHANNEL);
  ipcMain.handle(VAULT_SNAPSHOT_CHANNEL, async (_event, request: unknown) => {
    parseVaultSnapshotInvokeRequest(request);
    return parseVaultSnapshot(await vaultService.snapshot());
  });

  ipcMain.removeHandler(VAULT_TEMPLATES_CHANNEL);
  ipcMain.handle(VAULT_TEMPLATES_CHANNEL, async (_event, request: unknown) => {
    parseVaultTemplatesInvokeRequest(request);
    return parseVaultTemplateList(await vaultService.templates());
  });

  ipcMain.removeHandler(VAULT_RENDER_FILES_CHANNEL);
  ipcMain.handle(VAULT_RENDER_FILES_CHANNEL, async (_event, request: unknown) => {
    parseListRenderFilesInvokeRequest(request);
    return parseVaultRenderFileList(await vaultService.renderFiles());
  });

  ipcMain.removeHandler(VAULT_READ_CHANNEL);
  ipcMain.handle(VAULT_READ_CHANNEL, async (_event, request: unknown) => {
    const parsedRequest = parseReadNoteInvokeRequest(request);
    return parseReadNoteResponse(await vaultService.read(parsedRequest));
  });

  ipcMain.removeHandler(VAULT_CREATE_CHANNEL);
  ipcMain.handle(VAULT_CREATE_CHANNEL, async (_event, request: unknown) => {
    const parsedRequest = parseCreateNoteInvokeRequest(request);
    return parseNoteMeta(await vaultService.create(parsedRequest));
  });

  ipcMain.removeHandler(VAULT_RENAME_CHANNEL);
  ipcMain.handle(VAULT_RENAME_CHANNEL, async (_event, request: unknown) => {
    const parsedRequest = parseRenameNoteInvokeRequest(request);
    return parseNoteMeta(await vaultService.rename(parsedRequest));
  });

  ipcMain.removeHandler(VAULT_DELETE_CHANNEL);
  ipcMain.handle(VAULT_DELETE_CHANNEL, async (_event, request: unknown) => {
    const parsedRequest = parseDeleteNoteInvokeRequest(request);
    await vaultService.delete(parsedRequest);
    return parseVoidResponse(undefined);
  });

  ipcMain.removeHandler(VAULT_CREATE_DIRECTORY_CHANNEL);
  ipcMain.handle(VAULT_CREATE_DIRECTORY_CHANNEL, async (_event, request: unknown) => {
    return parseVaultDirectory(
      await vaultService.createDirectory(parseCreateDirectoryInvokeRequest(request))
    );
  });

  ipcMain.removeHandler(VAULT_ANALYZE_OPERATION_CHANNEL);
  ipcMain.handle(VAULT_ANALYZE_OPERATION_CHANNEL, async (_event, request: unknown) => {
    return parseVaultOperationImpact(
      await vaultService.analyzeOperation(parseAnalyzeVaultOperationInvokeRequest(request))
    );
  });

  ipcMain.removeHandler(VAULT_RENAME_ENTRY_CHANNEL);
  ipcMain.handle(VAULT_RENAME_ENTRY_CHANNEL, async (_event, request: unknown) => {
    const result = await vaultService.renameEntry(parseRenameVaultEntryInvokeRequest(request));
    if (vaultStateManager) {
      await vaultStateManager.update({ type: 'pathsMoved', mappings: result.mappings });
      await vaultStateManager.invalidateRenderCache(result.mappings.map((mapping) => mapping.from));
    }
    return parseMoveVaultEntriesResult(result);
  });

  ipcMain.removeHandler(VAULT_MOVE_BATCH_CHANNEL);
  ipcMain.handle(VAULT_MOVE_BATCH_CHANNEL, async (_event, request: unknown) => {
    const result = await vaultService.moveBatch(parseMoveVaultEntriesInvokeRequest(request));
    if (vaultStateManager) {
      await vaultStateManager.update({ type: 'pathsMoved', mappings: result.mappings });
      await vaultStateManager.invalidateRenderCache(result.mappings.map((mapping) => mapping.from));
    }
    return parseMoveVaultEntriesResult(result);
  });

  ipcMain.removeHandler(VAULT_TRASH_BATCH_CHANNEL);
  ipcMain.handle(VAULT_TRASH_BATCH_CHANNEL, async (_event, request: unknown) => {
    const result = await vaultService.trashBatch(parseTrashVaultEntriesInvokeRequest(request));
    const removed = result.results.filter((item) => item.success).map((item) => item.source);
    if (vaultStateManager && removed.length > 0) {
      await vaultStateManager.update({ type: 'pathsRemoved', relPaths: removed });
      await vaultStateManager.invalidateRenderCache(removed);
    }
    return parseTrashVaultEntriesResult(result);
  });

  // ── Search ───────────────────────────────────────────────────────────────────

  ipcMain.removeAllListeners(SEARCH_START_CHANNEL);
  ipcMain.on(SEARCH_START_CHANNEL, (event, request: unknown) => {
    searchService.start(event, request);
  });

  ipcMain.removeAllListeners(SEARCH_CANCEL_CHANNEL);
  ipcMain.on(SEARCH_CANCEL_CHANNEL, (_event, request: unknown) => {
    parseSearchCancelInvokeRequest(request);
    searchService.cancel();
  });

  // ── Shell ────────────────────────────────────────────────────────────────────

  ipcMain.removeHandler('shell:openExternal');
  ipcMain.handle('shell:openExternal', async (_event, request: unknown) => {
    const { url } = validateShellOpenExternalRequest(request);
    await shell.openExternal(url);
  });

  // ── Editor ───────────────────────────────────────────────────────────────────

  ipcMain.removeHandler(EDITOR_OPEN_CHANNEL);
  ipcMain.handle(EDITOR_OPEN_CHANNEL, async (_event, relPath: unknown) => {
    const safeRelPath = validateEditorOpenRelPath(relPath);
    const vaultRoot = vaultService.getOpenRoot()?.realRoot;
    if (!vaultRoot) throw new Error('editor.open: no vault open');
    const prefs = await loadResolvedPrefs(vaultRoot);
    editorLauncher.open(vaultRoot, safeRelPath, prefs.editorCommand);
  });

  // ── Vault change broadcast ───────────────────────────────────────────────────

  vaultBroadcastUnsubscribe?.();
  vaultBroadcastUnsubscribe = vaultService.onChanged((event) => {
    const safeEvent = parseVaultChange(event);
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(VAULT_CHANGED_CHANNEL, safeEvent);
    }
  });

  if (!cleanupRegistered) {
    installBoundedShutdown(app, async () => {
      editorLauncher.dispose();
      searchService.killAll();
      await vaultService.close();
      await searchService.dispose();
    });
    cleanupRegistered = true;
  }
};
