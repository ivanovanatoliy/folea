import type { RenderArtifact, TextLayerModel, OutlineEntry } from '../worker/typst';
import { parseVaultPath, type VaultPath } from './vault';

export const VAULT_STATE_LOAD_CHANNEL = 'folea:vaultState:load' as const;
export const VAULT_STATE_UPDATE_CHANNEL = 'folea:vaultState:update' as const;
export const VAULT_STATE_READ_RENDER_CACHE_CHANNEL = 'folea:vaultState:readRenderCache' as const;
export const VAULT_STATE_WRITE_RENDER_CACHE_CHANNEL = 'folea:vaultState:writeRenderCache' as const;
export const VAULT_OPEN_LAST_CHANNEL = 'folea:vault:openLast' as const;
export const VAULT_OPEN_RECENT_CHANNEL = 'folea:vault:openRecent' as const;
export const VAULT_CLOSE_CHANNEL = 'folea:vault:close' as const;
export const PREFS_LOAD_CHANNEL = 'folea:prefs:load' as const;
export const PREFS_SET_THEME_CHANNEL = 'folea:prefs:setTheme' as const;

// ── Vault state ────────────────────────────────────────────────────────────────

export interface RecentNoteEntry {
  readonly relPath: VaultPath;
  readonly title: string;
  readonly openedAt: string;
}

export type NoteZoomMode = 'fitWidth' | 'fitContentWidth' | 'fitPage' | 'fixed';

export interface NotePositionState {
  readonly relPath: VaultPath;
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly viewportHeight: number;
  readonly contentHeight: number;
  readonly scrollRatio: number;
  readonly zoomMode: NoteZoomMode;
  readonly zoomLevel: number;
  readonly caretSpanIndex: number | null;
  readonly updatedAt: string;
}

export interface VaultStateFileV1 {
  readonly schemaVersion: 1;
  readonly updatedAt: string;
  readonly lastOpenedNote: VaultPath | null;
  readonly recentNotes: readonly RecentNoteEntry[];
  readonly notePositions: Record<VaultPath, NotePositionState>;
  readonly commandHistory: readonly string[];
}

export type VaultStatePatch =
  | {
      readonly type: 'noteOpened';
      readonly relPath: VaultPath;
      readonly title: string;
      readonly openedAt: string;
    }
  | { readonly type: 'positionChanged'; readonly position: NotePositionState }
  | { readonly type: 'commandExecuted'; readonly commandId: string }
  | { readonly type: 'removeMissingNotes'; readonly relPaths: readonly VaultPath[] };

export const RECENT_NOTES_MAX = 50;
export const NOTE_POSITIONS_MAX = 1000;
export const COMMAND_HISTORY_MAX = 50;

// ── Render cache ───────────────────────────────────────────────────────────────

export interface RenderCacheInputFile {
  readonly relPath: VaultPath;
  readonly sha256: string;
}

export interface RenderCacheManifestEntry {
  readonly cacheKey: string;
  readonly relPath: VaultPath;
  readonly entryPath: string;
  readonly rendererVersion: string;
  readonly compilerVersion: string;
  readonly inputHash: string;
  readonly inputFiles: readonly RenderCacheInputFile[];
  readonly createdAt: string;
  readonly lastUsedAt: string;
  readonly byteSize: number;
}

export interface RenderCacheManifestV1 {
  readonly schemaVersion: 1;
  readonly updatedAt: string;
  readonly entries: Record<string, RenderCacheManifestEntry>;
}

export interface RenderCacheEntryV1 {
  readonly schemaVersion: 1;
  readonly cacheKey: string;
  readonly relPath: VaultPath;
  readonly artifact: RenderArtifact;
  readonly textLayer: TextLayerModel;
  readonly outline: readonly OutlineEntry[];
}

export interface ReadRenderCacheRequest {
  readonly relPath: VaultPath;
}

export type ReadRenderCacheResponse =
  | { readonly hit: true; readonly entry: RenderCacheEntryV1; readonly cacheKey: string }
  | { readonly hit: false; readonly reason: 'missing' | 'stale' | 'invalid' | 'version-mismatch' };

export interface WriteRenderCacheRequest {
  readonly manifestEntry: RenderCacheManifestEntry;
  readonly entry: RenderCacheEntryV1;
}

// ── Prefs ──────────────────────────────────────────────────────────────────────

export interface FoleaPrefs {
  readonly vaultCaseSensitive: boolean;
  readonly inFileCaseSensitive: boolean;
  readonly theme: 'system' | 'light' | 'dark';
  readonly editorCommand: string;
  readonly warnings: readonly string[];
}

export const DEFAULT_PREFS: FoleaPrefs = {
  vaultCaseSensitive: false,
  inFileCaseSensitive: false,
  theme: 'system',
  editorCommand: '',
  warnings: []
};

export type FoleaThemePreference = FoleaPrefs['theme'];

// ── Validators ─────────────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
};

const isFiniteNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const parseIsoTimestamp = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be an ISO timestamp string`);
  }

  return value;
};

export const parseRecentNoteEntry = (value: unknown): RecentNoteEntry => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['relPath', 'title', 'openedAt'])) {
    throw new TypeError('Malformed recent note entry');
  }

  return {
    relPath: parseVaultPath(value.relPath),
    title: typeof value.title === 'string' ? value.title : '',
    openedAt: parseIsoTimestamp(value.openedAt, 'openedAt')
  };
};

export const parseNotePositionState = (value: unknown): NotePositionState => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'relPath',
      'scrollTop',
      'scrollLeft',
      'viewportHeight',
      'contentHeight',
      'scrollRatio',
      'zoomMode',
      'zoomLevel',
      'caretSpanIndex',
      'updatedAt'
    ])
  ) {
    throw new TypeError('Malformed note position state');
  }

  const caretSpanIndex = value.caretSpanIndex;
  if (caretSpanIndex !== null && typeof caretSpanIndex !== 'number') {
    throw new TypeError('Malformed note position state');
  }

  return {
    relPath: parseVaultPath(value.relPath),
    scrollTop: isFiniteNonNegativeNumber(value.scrollTop) ? value.scrollTop : 0,
    scrollLeft: isFiniteNonNegativeNumber(value.scrollLeft) ? value.scrollLeft : 0,
    viewportHeight: isFiniteNonNegativeNumber(value.viewportHeight) ? value.viewportHeight : 0,
    contentHeight: isFiniteNonNegativeNumber(value.contentHeight) ? value.contentHeight : 0,
    scrollRatio:
      typeof value.scrollRatio === 'number' ? Math.max(0, Math.min(1, value.scrollRatio)) : 0,
    zoomMode: parseNoteZoomMode(value.zoomMode),
    zoomLevel:
      typeof value.zoomLevel === 'number' && Number.isFinite(value.zoomLevel)
        ? Math.max(0.1, Math.min(10, value.zoomLevel))
        : 1,
    caretSpanIndex: typeof caretSpanIndex === 'number' ? caretSpanIndex : null,
    updatedAt: parseIsoTimestamp(value.updatedAt, 'updatedAt')
  };
};

const parseNoteZoomMode = (value: unknown): NoteZoomMode => {
  switch (value) {
    case 'fitWidth':
    case 'fitContentWidth':
    case 'fitPage':
    case 'fixed':
      return value;
    default:
      return 'fitWidth';
  }
};

export const parseVaultStateFileV1 = (value: unknown): VaultStateFileV1 => {
  if (!isRecord(value)) {
    throw new TypeError('Malformed vault state');
  }

  if (value.schemaVersion !== 1) {
    throw new TypeError('Unsupported vault state schema version');
  }

  const recentNotes = Array.isArray(value.recentNotes)
    ? (value.recentNotes as unknown[]).flatMap((entry) => {
        try {
          return [parseRecentNoteEntry(entry)];
        } catch {
          return [];
        }
      })
    : [];

  const notePositions: Record<VaultPath, NotePositionState> = {};
  if (isRecord(value.notePositions)) {
    for (const [key, pos] of Object.entries(value.notePositions)) {
      try {
        const parsed = parseNotePositionState(pos);
        notePositions[parseVaultPath(key)] = parsed;
      } catch {
        // skip corrupt entries
      }
    }
  }

  let lastOpenedNote: VaultPath | null = null;
  if (typeof value.lastOpenedNote === 'string') {
    try {
      lastOpenedNote = parseVaultPath(value.lastOpenedNote);
    } catch {
      lastOpenedNote = null;
    }
  }

  return {
    schemaVersion: 1,
    updatedAt: parseIsoTimestamp(value.updatedAt ?? new Date().toISOString(), 'updatedAt'),
    lastOpenedNote,
    recentNotes,
    notePositions,
    commandHistory: parseCommandHistory(value.commandHistory)
  };
};

export const defaultVaultState = (): VaultStateFileV1 => ({
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  lastOpenedNote: null,
  recentNotes: [],
  notePositions: {},
  commandHistory: []
});

const parseCommandHistory = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const history: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || item.includes('\0') || seen.has(item)) {
      continue;
    }

    seen.add(item);
    history.push(item);
    if (history.length >= COMMAND_HISTORY_MAX) {
      break;
    }
  }

  return history;
};

const parseCommandId = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new TypeError('Malformed command id');
  }

  return value;
};

export const parseVaultStatePatch = (value: unknown): VaultStatePatch => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new TypeError('Malformed vault state patch');
  }

  switch (value.type) {
    case 'noteOpened': {
      return {
        type: 'noteOpened',
        relPath: parseVaultPath(value.relPath),
        title: typeof value.title === 'string' ? value.title : '',
        openedAt: parseIsoTimestamp(value.openedAt, 'openedAt')
      };
    }

    case 'positionChanged': {
      if (!isRecord(value.position)) {
        throw new TypeError('Malformed position patch');
      }

      return { type: 'positionChanged', position: parseNotePositionState(value.position) };
    }

    case 'commandExecuted': {
      return { type: 'commandExecuted', commandId: parseCommandId(value.commandId) };
    }

    case 'removeMissingNotes': {
      if (!Array.isArray(value.relPaths)) {
        throw new TypeError('Malformed removeMissingNotes patch');
      }

      return {
        type: 'removeMissingNotes',
        relPaths: (value.relPaths as unknown[]).map((rp) => parseVaultPath(rp))
      };
    }

    default:
      throw new TypeError('Unknown vault state patch type');
  }
};

export const parseReadRenderCacheRequest = (value: unknown): ReadRenderCacheRequest => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['relPath'])) {
    throw new TypeError('Malformed readRenderCache request');
  }

  return { relPath: parseVaultPath(value.relPath) };
};

const parseRenderCacheInputFile = (value: unknown): RenderCacheInputFile => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['relPath', 'sha256'])) {
    throw new TypeError('Malformed render cache input file');
  }

  if (typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256)) {
    throw new TypeError('Malformed render cache input file sha256');
  }

  return { relPath: parseVaultPath(value.relPath), sha256: value.sha256 };
};

export const parseRenderCacheManifestEntry = (value: unknown): RenderCacheManifestEntry => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'cacheKey',
      'relPath',
      'entryPath',
      'rendererVersion',
      'compilerVersion',
      'inputHash',
      'inputFiles',
      'createdAt',
      'lastUsedAt',
      'byteSize'
    ])
  ) {
    throw new TypeError('Malformed render cache manifest entry');
  }

  if (
    typeof value.cacheKey !== 'string' ||
    !/^[0-9a-f]{64}:[a-zA-Z0-9@._-]+$/.test(value.cacheKey) ||
    typeof value.entryPath !== 'string' ||
    typeof value.rendererVersion !== 'string' ||
    typeof value.compilerVersion !== 'string' ||
    typeof value.inputHash !== 'string' ||
    !Array.isArray(value.inputFiles) ||
    !isFiniteNonNegativeNumber(value.byteSize)
  ) {
    throw new TypeError('Malformed render cache manifest entry');
  }

  return {
    cacheKey: value.cacheKey,
    relPath: parseVaultPath(value.relPath),
    entryPath: value.entryPath,
    rendererVersion: value.rendererVersion,
    compilerVersion: value.compilerVersion,
    inputHash: value.inputHash,
    inputFiles: (value.inputFiles as unknown[]).map(parseRenderCacheInputFile),
    createdAt: parseIsoTimestamp(value.createdAt, 'createdAt'),
    lastUsedAt: parseIsoTimestamp(value.lastUsedAt, 'lastUsedAt'),
    byteSize: value.byteSize
  };
};

export const parseWriteRenderCacheRequest = (value: unknown): WriteRenderCacheRequest => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['manifestEntry', 'entry'])) {
    throw new TypeError('Malformed writeRenderCache request');
  }

  return {
    manifestEntry: parseRenderCacheManifestEntry(value.manifestEntry),
    entry: parseRenderCacheEntryV1(value.entry)
  };
};

export const parseRenderCacheEntryV1 = (value: unknown): RenderCacheEntryV1 => {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new TypeError('Malformed render cache entry');
  }

  if (
    typeof value.cacheKey !== 'string' ||
    !/^[0-9a-f]{64}:[a-zA-Z0-9@._-]+$/.test(value.cacheKey) ||
    !isRecord(value.artifact) ||
    !isRecord(value.textLayer) ||
    !Array.isArray(value.outline)
  ) {
    throw new TypeError('Malformed render cache entry');
  }

  return {
    schemaVersion: 1,
    cacheKey: value.cacheKey,
    relPath: parseVaultPath(value.relPath),
    artifact: value.artifact as unknown as RenderArtifact,
    textLayer: value.textLayer as unknown as TextLayerModel,
    outline: value.outline as readonly OutlineEntry[]
  };
};

export const parseReadRenderCacheResponse = (value: unknown): ReadRenderCacheResponse => {
  if (!isRecord(value) || typeof value.hit !== 'boolean') {
    throw new TypeError('Malformed readRenderCache response');
  }

  if (!value.hit) {
    const reason = value.reason;
    if (
      reason !== 'missing' &&
      reason !== 'stale' &&
      reason !== 'invalid' &&
      reason !== 'version-mismatch'
    ) {
      throw new TypeError('Malformed readRenderCache response reason');
    }

    return { hit: false, reason };
  }

  return {
    hit: true,
    entry: parseRenderCacheEntryV1(value.entry),
    cacheKey: typeof value.cacheKey === 'string' ? value.cacheKey : ''
  };
};

export const parseFoleaPrefs = (value: unknown): FoleaPrefs => {
  if (!isRecord(value)) {
    return { ...DEFAULT_PREFS };
  }

  const theme =
    value.theme === 'system' || value.theme === 'dark' || value.theme === 'light'
      ? value.theme
      : DEFAULT_PREFS.theme;

  return {
    vaultCaseSensitive:
      typeof value.vaultCaseSensitive === 'boolean'
        ? value.vaultCaseSensitive
        : DEFAULT_PREFS.vaultCaseSensitive,
    inFileCaseSensitive:
      typeof value.inFileCaseSensitive === 'boolean'
        ? value.inFileCaseSensitive
        : DEFAULT_PREFS.inFileCaseSensitive,
    theme,
    editorCommand: typeof value.editorCommand === 'string' ? value.editorCommand : '',
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((warning): warning is string => typeof warning === 'string')
      : []
  };
};

export const parseFoleaThemePreference = (value: unknown): FoleaThemePreference => {
  if (value === 'system' || value === 'light' || value === 'dark') {
    return value;
  }

  throw new TypeError('Malformed theme preference');
};
