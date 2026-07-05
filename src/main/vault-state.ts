import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  defaultVaultState,
  parseVaultStateFileV1,
  parseRenderCacheManifestEntry,
  parseRenderCacheEntryV1,
  RECENT_NOTES_MAX,
  NOTE_POSITIONS_MAX,
  COMMAND_HISTORY_MAX,
  type VaultStateFileV1,
  type VaultStatePatch,
  type NotePositionState,
  type RecentNoteEntry,
  type ReadRenderCacheRequest,
  type ReadRenderCacheResponse,
  type WriteRenderCacheRequest,
  type RenderCacheManifestV1,
  type RenderCacheManifestEntry
} from '../shared/ipc/vault-state';
import type { VaultPath } from '../shared/ipc/vault';
import { isNodeError } from './vault/paths';

const FOLEA_DIR = '.folea';
const STATE_FILE = 'state.json';
const RENDER_CACHE_DIR = 'render-cache';
const MANIFEST_FILE = 'manifest.json';
const ENTRIES_DIR = 'entries';

const RENDER_CACHE_MAX_ENTRIES = 500;
const RENDER_CACHE_MAX_BYTES = 250 * 1024 * 1024;
const RENDERER_VERSION = '1';
const COMPILER_VERSION = 'typst.ts@0.7.0';

// ── Atomic write helper ────────────────────────────────────────────────────────

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
      // best-effort cleanup
    }

    throw error;
  }
};

const atomicWriteString = async (filePath: string, content: string): Promise<void> => {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
  );

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tmpPath, content, 'utf8');
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // best-effort cleanup
    }

    throw error;
  }
};

const readJsonFile = async (filePath: string): Promise<unknown> => {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content) as unknown;
};

// ── Paths ──────────────────────────────────────────────────────────────────────

const getFoleaDir = (vaultRoot: string): string => path.join(vaultRoot, FOLEA_DIR);
const getStateFilePath = (vaultRoot: string): string =>
  path.join(getFoleaDir(vaultRoot), STATE_FILE);
const getRenderCacheDir = (vaultRoot: string): string =>
  path.join(getFoleaDir(vaultRoot), RENDER_CACHE_DIR);
const getManifestPath = (vaultRoot: string): string =>
  path.join(getRenderCacheDir(vaultRoot), MANIFEST_FILE);
const cacheKeyToFilename = (cacheKey: string): string =>
  crypto.createHash('sha256').update(cacheKey).digest('hex');

const getEntryPath = (vaultRoot: string, cacheKey: string): string =>
  path.join(getRenderCacheDir(vaultRoot), ENTRIES_DIR, `${cacheKeyToFilename(cacheKey)}.json`);

const isInsideOrEqual = (parent: string, child: string): boolean => {
  const rel = path.relative(parent, child);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
};
// ── Vault state ────────────────────────────────────────────────────────────────

export const loadVaultState = async (vaultRoot: string): Promise<VaultStateFileV1> => {
  const statePath = getStateFilePath(vaultRoot);

  try {
    const raw = await readJsonFile(statePath);
    return parseVaultStateFileV1(raw);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return defaultVaultState();
    }

    console.warn('[vault-state] Failed to read state, starting fresh:', error);
    const corruptPath = `${statePath}.corrupt-${Date.now()}`;
    try {
      await fs.rename(statePath, corruptPath);
    } catch {
      // best effort
    }

    return defaultVaultState();
  }
};

export const applyVaultStatePatch = (
  current: VaultStateFileV1,
  patch: VaultStatePatch
): VaultStateFileV1 => {
  const now = new Date().toISOString();

  switch (patch.type) {
    case 'noteOpened': {
      const { relPath, title, openedAt } = patch;

      const filtered = current.recentNotes.filter((n) => n.relPath !== relPath);
      const next: RecentNoteEntry = { relPath, title, openedAt };
      const recentNotes = [next, ...filtered].slice(0, RECENT_NOTES_MAX);

      return {
        ...current,
        updatedAt: now,
        lastOpenedNote: relPath,
        recentNotes
      };
    }

    case 'positionChanged': {
      const { position } = patch;
      const positions = { ...current.notePositions, [position.relPath]: position };

      const entries = Object.entries(positions) as [VaultPath, NotePositionState][];
      if (entries.length > NOTE_POSITIONS_MAX) {
        entries.sort(([, a], [, b]) => a.updatedAt.localeCompare(b.updatedAt));
        const toRemove = entries.length - NOTE_POSITIONS_MAX;
        for (let i = 0; i < toRemove; i++) {
          const key = entries[i]?.[0];
          if (key !== undefined) delete positions[key];
        }
      }

      return { ...current, updatedAt: now, notePositions: positions };
    }

    case 'commandExecuted': {
      const commandHistory = [
        patch.commandId,
        ...current.commandHistory.filter((id) => id !== patch.commandId)
      ].slice(0, COMMAND_HISTORY_MAX);

      return { ...current, updatedAt: now, commandHistory };
    }

    case 'removeMissingNotes': {
      const missing = new Set(patch.relPaths);
      const recentNotes = current.recentNotes.filter((n) => !missing.has(n.relPath));
      const notePositions = { ...current.notePositions };
      for (const rp of missing) {
        delete notePositions[rp];
      }

      let lastOpenedNote = current.lastOpenedNote;
      if (lastOpenedNote && missing.has(lastOpenedNote)) {
        lastOpenedNote = null;
      }

      return { ...current, updatedAt: now, lastOpenedNote, recentNotes, notePositions };
    }

    default: {
      const _exhaustive: never = patch;
      throw new Error(`Unknown vault state patch: ${(_exhaustive as VaultStatePatch).type}`);
    }
  }
};

export const saveVaultState = async (vaultRoot: string, state: VaultStateFileV1): Promise<void> => {
  await atomicWriteJson(getStateFilePath(vaultRoot), state);
};

// ── Render cache ───────────────────────────────────────────────────────────────

const sha256File = async (filePath: string): Promise<string | null> => {
  try {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
};

const loadManifest = async (vaultRoot: string): Promise<RenderCacheManifestV1> => {
  const manifestPath = getManifestPath(vaultRoot);

  try {
    const raw = await readJsonFile(manifestPath);
    if (
      typeof raw !== 'object' ||
      raw === null ||
      (raw as Record<string, unknown>).schemaVersion !== 1
    ) {
      return { schemaVersion: 1, updatedAt: new Date().toISOString(), entries: {} };
    }

    const rawRecord = raw as Record<string, unknown>;
    const entries: Record<string, RenderCacheManifestEntry> = {};

    if (typeof rawRecord.entries === 'object' && rawRecord.entries !== null) {
      for (const [key, entry] of Object.entries(rawRecord.entries)) {
        try {
          entries[key] = parseRenderCacheManifestEntry(entry);
        } catch {
          // skip corrupt entries
        }
      }
    }

    return {
      schemaVersion: 1,
      updatedAt:
        typeof rawRecord.updatedAt === 'string' ? rawRecord.updatedAt : new Date().toISOString(),
      entries
    };
  } catch {
    return { schemaVersion: 1, updatedAt: new Date().toISOString(), entries: {} };
  }
};

const saveManifest = async (vaultRoot: string, manifest: RenderCacheManifestV1): Promise<void> => {
  await atomicWriteJson(getManifestPath(vaultRoot), manifest);
};

const evictManifest = (manifest: RenderCacheManifestV1): RenderCacheManifestV1 => {
  const entries = Object.values(manifest.entries);

  let totalBytes = entries.reduce((sum, e) => sum + e.byteSize, 0);
  if (entries.length <= RENDER_CACHE_MAX_ENTRIES && totalBytes <= RENDER_CACHE_MAX_BYTES) {
    return manifest;
  }

  entries.sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt));

  const next: Record<string, RenderCacheManifestEntry> = {};
  let kept = 0;
  let keptBytes = 0;

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    if (kept >= RENDER_CACHE_MAX_ENTRIES || keptBytes + entry.byteSize > RENDER_CACHE_MAX_BYTES) {
      continue;
    }

    next[entry.cacheKey] = entry;
    kept++;
    keptBytes += entry.byteSize;
  }

  return { ...manifest, updatedAt: new Date().toISOString(), entries: next };
};

export const readRenderCache = async (
  vaultRoot: string,
  request: ReadRenderCacheRequest
): Promise<ReadRenderCacheResponse> => {
  const manifest = await loadManifest(vaultRoot);
  const candidates = Object.values(manifest.entries).filter((e) => e.relPath === request.relPath);

  if (candidates.length === 0) {
    return { hit: false, reason: 'missing' };
  }

  const versionMatches = candidates.filter(
    (e) => e.rendererVersion === RENDERER_VERSION && e.compilerVersion === COMPILER_VERSION
  );

  if (versionMatches.length === 0) {
    return { hit: false, reason: 'version-mismatch' };
  }

  const entriesDir = path.resolve(path.join(getRenderCacheDir(vaultRoot), ENTRIES_DIR));

  for (const entry of versionMatches) {
    // Verify input file hashes from disk
    let stale = false;
    for (const inputFile of entry.inputFiles) {
      const diskPath = path.join(vaultRoot, ...inputFile.relPath.split('/'));
      const currentHash = await sha256File(diskPath);
      if (currentHash === null || currentHash !== inputFile.sha256) {
        stale = true;
        break;
      }
    }
    if (stale) continue;

    const entryFilePath = getEntryPath(vaultRoot, entry.cacheKey);
    if (!isInsideOrEqual(entriesDir, path.resolve(entryFilePath))) {
      continue;
    }

    try {
      const raw = await readJsonFile(entryFilePath);
      const cacheEntry = parseRenderCacheEntryV1(raw);

      const updatedManifest: RenderCacheManifestV1 = {
        ...manifest,
        updatedAt: new Date().toISOString(),
        entries: {
          ...manifest.entries,
          [entry.cacheKey]: { ...entry, lastUsedAt: new Date().toISOString() }
        }
      };
      await saveManifest(vaultRoot, updatedManifest).catch(() => undefined);

      return { hit: true, entry: cacheEntry, cacheKey: entry.cacheKey };
    } catch {
      continue;
    }
  }

  return { hit: false, reason: 'stale' };
};

export const writeRenderCache = async (
  vaultRoot: string,
  request: WriteRenderCacheRequest
): Promise<void> => {
  const entryPath = getEntryPath(vaultRoot, request.manifestEntry.cacheKey);
  const entriesDir = path.resolve(path.join(getRenderCacheDir(vaultRoot), ENTRIES_DIR));
  if (!isInsideOrEqual(entriesDir, path.resolve(entryPath))) {
    throw new Error('Cache entry path escapes entries directory');
  }

  // Write entry file first
  const entryJson = JSON.stringify(request.entry, null, 2);
  await atomicWriteString(entryPath, entryJson);

  // Update manifest
  const manifest = await loadManifest(vaultRoot);
  const updatedManifest: RenderCacheManifestV1 = {
    ...manifest,
    updatedAt: new Date().toISOString(),
    entries: {
      ...manifest.entries,
      [request.manifestEntry.cacheKey]: request.manifestEntry
    }
  };
  const evicted = evictManifest(updatedManifest);

  // Remove evicted entry files (best effort)
  const evictedKeys = new Set(Object.keys(evicted.entries));
  for (const key of Object.keys(updatedManifest.entries)) {
    if (!evictedKeys.has(key)) {
      await fs.unlink(getEntryPath(vaultRoot, key)).catch(() => undefined);
    }
  }

  await saveManifest(vaultRoot, evicted);
};

// ── Vault state manager (per open vault) ──────────────────────────────────────

export class VaultStateManager {
  private state: VaultStateFileV1 = defaultVaultState();

  constructor(private readonly vaultRoot: string) {}

  async load(): Promise<VaultStateFileV1> {
    this.state = await loadVaultState(this.vaultRoot);
    return this.state;
  }

  async update(patch: VaultStatePatch): Promise<VaultStateFileV1> {
    this.state = applyVaultStatePatch(this.state, patch);
    await saveVaultState(this.vaultRoot, this.state);
    return this.state;
  }

  async readRenderCache(request: ReadRenderCacheRequest): Promise<ReadRenderCacheResponse> {
    return readRenderCache(this.vaultRoot, request);
  }

  async writeRenderCache(request: WriteRenderCacheRequest): Promise<void> {
    return writeRenderCache(this.vaultRoot, request);
  }

  getState(): VaultStateFileV1 {
    return this.state;
  }
}
