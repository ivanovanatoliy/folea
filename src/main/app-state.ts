import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { app } from 'electron';

import {
  defaultAppState,
  parseAppStateFileV1,
  RECENT_VAULTS_MAX,
  type AppStateFileV1,
  type AppStatePatch
} from '../shared/ipc/app-state';

const STATE_FILENAME = 'state.json';

const getStatePath = (): string => path.join(app.getPath('userData'), STATE_FILENAME);

const atomicWriteJson = async (filePath: string, data: unknown): Promise<void> => {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
  );
  const json = JSON.stringify(data, null, 2);

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tmpPath, json, 'utf8');
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore cleanup error
    }

    throw error;
  }
};

const readJsonFile = async (filePath: string): Promise<unknown> => {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content) as unknown;
};

let cached: AppStateFileV1 | undefined;

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
  const current = await loadAppState();
  let next: AppStateFileV1;

  switch (patch.type) {
    case 'setLastOpenedVault': {
      const deduped = [patch.rootPath, ...current.recentVaults.filter((p) => p !== patch.rootPath)];
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

  cached = next;
  await atomicWriteJson(getStatePath(), next);
  return next;
};
