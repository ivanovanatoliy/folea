import { promises as fs } from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import {
  defaultAppState,
  parseAppStateFileV1,
  RECENT_VAULTS_MAX,
  type AppStateFileV1,
  type AppStatePatch
} from '../shared/ipc/app-state';
import { atomicWriteJson, readJsonFile } from './persistence/atomic-file';

const STATE_FILENAME = 'state.json';

const getStatePath = (): string => path.join(app.getPath('userData'), STATE_FILENAME);

let cached: AppStateFileV1 | undefined;
let updateTail: Promise<void> = Promise.resolve();

const enqueueUpdate = <T>(task: () => Promise<T>): Promise<T> => {
  const result = updateTail.then(task, task);
  updateTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
};

export const loadAppState = async (): Promise<AppStateFileV1> => {
  if (cached) {
    return cached;
  }

  const statePath = getStatePath();

  try {
    const raw = await readJsonFile(statePath);
    cached = parseAppStateFileV1(raw);
    return cached;
  } catch (error) {
    const isNotFound =
      error instanceof Error && 'code' in error && (error as { code?: string }).code === 'ENOENT';
    if (!isNotFound) {
      console.warn('[app-state] Failed to read state, starting fresh:', error);
      const corruptPath = `${statePath}.corrupt-${Date.now()}`;
      try {
        await fs.rename(statePath, corruptPath);
      } catch {
        // best effort
      }
    }

    cached = defaultAppState();
    return cached;
  }
};

export const updateAppState = async (patch: AppStatePatch): Promise<AppStateFileV1> => {
  return enqueueUpdate(async () => {
    const current = await loadAppState();
    let next: AppStateFileV1;

    switch (patch.type) {
      case 'setLastOpenedVault': {
        const deduped = [
          patch.rootPath,
          ...current.recentVaults.filter((p) => p !== patch.rootPath)
        ];
        next = {
          ...current,
          updatedAt: new Date().toISOString(),
          lastOpenedVaultPath: patch.rootPath,
          recentVaults: deduped.slice(0, RECENT_VAULTS_MAX)
        };
        break;
      }

      case 'clearInvalidLastOpenedVault': {
        next = {
          ...current,
          updatedAt: new Date().toISOString(),
          lastOpenedVaultPath: null,
          recentVaults: current.recentVaults.filter((p) => p !== current.lastOpenedVaultPath)
        };
        break;
      }

      case 'removeRecentVault': {
        next = {
          ...current,
          updatedAt: new Date().toISOString(),
          lastOpenedVaultPath:
            current.lastOpenedVaultPath === patch.rootPath ? null : current.lastOpenedVaultPath,
          recentVaults: current.recentVaults.filter((p) => p !== patch.rootPath)
        };
        break;
      }

      default: {
        const _exhaustive: never = patch;
        throw new Error(`Unknown app state patch type: ${(_exhaustive as AppStatePatch).type}`);
      }
    }

    await atomicWriteJson(getStatePath(), next);
    cached = next;
    return next;
  });
};
