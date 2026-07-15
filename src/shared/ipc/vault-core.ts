import { assertSafeRelativePosixPath } from '../path';
import { parseVaultDirectoryPath, parseVaultEntryPath } from './vault-path';

export const VAULT_OPEN_CHANNEL = 'folea:vault:open' as const;
export const VAULT_LIST_CHANNEL = 'folea:vault:list' as const;
export const VAULT_READ_CHANNEL = 'folea:vault:read' as const;
export const VAULT_CREATE_CHANNEL = 'folea:vault:create' as const;
export const VAULT_RENAME_CHANNEL = 'folea:vault:rename' as const;
export const VAULT_DELETE_CHANNEL = 'folea:vault:delete' as const;
export const VAULT_RENDER_FILES_CHANNEL = 'folea:vault:render-files' as const;
export const VAULT_CHANGED_CHANNEL = 'folea:vault:changed' as const;
export const VAULT_SNAPSHOT_CHANNEL = 'folea:vault:snapshot' as const;
export const VAULT_TEMPLATES_CHANNEL = 'folea:vault:templates' as const;
export const VAULT_CREATE_DIRECTORY_CHANNEL = 'folea:vault:create-directory' as const;
export const VAULT_ANALYZE_OPERATION_CHANNEL = 'folea:vault:analyze-operation' as const;
export const VAULT_RENAME_ENTRY_CHANNEL = 'folea:vault:rename-entry' as const;
export const VAULT_MOVE_BATCH_CHANNEL = 'folea:vault:move-batch' as const;
export const VAULT_TRASH_BATCH_CHANNEL = 'folea:vault:trash-batch' as const;

export type VaultPath = string;

export interface VaultHandle {
  readonly rootName: string;
}

export interface NoteMeta {
  readonly id: string;
  readonly relPath: VaultPath;
  readonly basename: string;
  readonly title: string;
  readonly byteSize: number;
  readonly mtimeMs: number;
}

export interface VaultDirectory {
  readonly relPath: VaultPath;
  readonly name: string;
}

export interface VaultSnapshot {
  readonly notes: readonly NoteMeta[];
  readonly directories: readonly VaultDirectory[];
}

export interface VaultTemplate {
  readonly relPath: VaultPath;
  readonly name: string;
  readonly contents: string;
}

export type VaultEntryKind = 'note' | 'directory';

export interface VaultEntryCounts {
  readonly notes: number;
  readonly directories: number;
  readonly otherFiles: number;
}

export interface VaultReferenceImpact {
  readonly from: VaultPath;
  readonly to: VaultPath;
  readonly kind: 'link' | 'import' | 'include';
}

export interface VaultOperationImpact {
  readonly counts: VaultEntryCounts;
  readonly references: readonly VaultReferenceImpact[];
  readonly warnings: readonly string[];
}

export interface CreateDirectoryRequest {
  readonly relPath: VaultPath;
}

export interface AnalyzeVaultOperationRequest {
  readonly operation: 'rename' | 'move' | 'trash';
  readonly sources: readonly VaultPath[];
  readonly destination?: VaultPath;
}

export interface RenameVaultEntryRequest {
  readonly from: VaultPath;
  readonly to: VaultPath;
  readonly updateReferences?: boolean;
  readonly templateMode?: boolean;
}

export interface MoveVaultEntriesRequest {
  readonly sources: readonly VaultPath[];
  /** Empty string denotes the vault root. */
  readonly destinationDirectory: VaultPath | '';
  readonly updateReferences?: boolean;
}

export interface VaultPathMapping {
  readonly from: VaultPath;
  readonly to: VaultPath;
}

export interface MoveVaultEntriesResult {
  readonly mappings: readonly VaultPathMapping[];
  readonly referencesUpdated: number;
  readonly warnings: readonly string[];
}

export interface TrashVaultEntriesRequest {
  readonly sources: readonly VaultPath[];
  readonly removeReferences?: boolean;
  readonly templateMode?: boolean;
}

export interface TrashVaultEntryResult {
  readonly source: VaultPath;
  readonly success: boolean;
  readonly error?: string;
}

export interface TrashVaultEntriesResult {
  readonly results: readonly TrashVaultEntryResult[];
  readonly referencesUpdated: number;
  readonly warnings: readonly string[];
}

export interface VaultRenderFile {
  readonly relPath: VaultPath;
  readonly contents: string;
}

export type VaultChangeKind = 'created' | 'changed' | 'renamed' | 'deleted' | 'structural';

export interface NoteCreatedChange {
  readonly kind: 'created';
  readonly note: NoteMeta;
}

export interface NoteChangedChange {
  readonly kind: 'changed';
  readonly note: NoteMeta;
}

export interface NoteRenamedChange {
  readonly kind: 'renamed';
  readonly oldRelPath: VaultPath;
  readonly newRelPath: VaultPath;
  readonly note: NoteMeta;
}

export interface NoteDeletedChange {
  readonly kind: 'deleted';
  readonly relPath: VaultPath;
}

export interface VaultStructuralChange {
  readonly kind: 'structural';
  readonly relPath: VaultPath;
  readonly action: 'directory-created' | 'directory-deleted';
}

export type VaultChange =
  | NoteCreatedChange
  | NoteChangedChange
  | NoteRenamedChange
  | NoteDeletedChange
  | VaultStructuralChange;

export interface OpenVaultRequest {
  readonly type: typeof VAULT_OPEN_CHANNEL;
  readonly rootPath?: string;
}

export interface ListNotesRequest {
  readonly type: typeof VAULT_LIST_CHANNEL;
}

export interface ListRenderFilesRequest {
  readonly type: typeof VAULT_RENDER_FILES_CHANNEL;
}

export interface ReadNoteRequest {
  readonly relPath: VaultPath;
}

export interface ReadNoteInvokeRequest extends ReadNoteRequest {
  readonly type: typeof VAULT_READ_CHANNEL;
}

export interface CreateNoteRequest {
  readonly relPath: VaultPath;
  readonly contents?: string;
}

export interface CreateNoteInvokeRequest extends CreateNoteRequest {
  readonly type: typeof VAULT_CREATE_CHANNEL;
}

export interface RenameNoteRequest {
  readonly from: VaultPath;
  readonly to: VaultPath;
}

export interface RenameNoteInvokeRequest extends RenameNoteRequest {
  readonly type: typeof VAULT_RENAME_CHANNEL;
}

export interface DeleteNoteRequest {
  readonly relPath: VaultPath;
}

export interface DeleteNoteInvokeRequest extends DeleteNoteRequest {
  readonly type: typeof VAULT_DELETE_CHANNEL;
}

export interface FoleaVaultBridge {
  open(rootPath?: string): Promise<VaultHandle>;
  list(): Promise<NoteMeta[]>;
  renderFiles(): Promise<VaultRenderFile[]>;
  read(request: ReadNoteRequest): Promise<string>;
  create(request: CreateNoteRequest): Promise<NoteMeta>;
  rename(request: RenameNoteRequest): Promise<NoteMeta>;
  delete(request: DeleteNoteRequest): Promise<void>;
  snapshot(): Promise<VaultSnapshot>;
  templates(): Promise<VaultTemplate[]>;
  createDirectory(request: CreateDirectoryRequest): Promise<VaultDirectory>;
  analyzeOperation(request: AnalyzeVaultOperationRequest): Promise<VaultOperationImpact>;
  renameEntry(request: RenameVaultEntryRequest): Promise<MoveVaultEntriesResult>;
  moveBatch(request: MoveVaultEntriesRequest): Promise<MoveVaultEntriesResult>;
  trashBatch(request: TrashVaultEntriesRequest): Promise<TrashVaultEntriesResult>;
  onChanged(callback: (event: VaultChange) => void): () => void;
}

const NOTE_EXTENSION = '.typ';
const RENDER_FILE_SUFFIXES = ['.typ', '/typst.toml'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
};

const isFiniteNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const assertRootPath = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new TypeError('Vault root path must be a non-empty string');
  }

  return value;
};

export const parseVaultPath = (value: unknown): VaultPath => {
  if (typeof value !== 'string') {
    throw new TypeError('Vault path must be a string');
  }

  try {
    return assertSafeRelativePosixPath(value, {
      label: 'Vault path',
      allowedSuffixes: [NOTE_EXTENSION]
    });
  } catch (error) {
    if (error instanceof TypeError && error.message.endsWith('must use an allowed file suffix')) {
      throw new TypeError('Vault note path must target a .typ file', { cause: error });
    }

    throw error;
  }
};

const parseManagedNotePath = (value: unknown): VaultPath => {
  const parsed = parseVaultEntryPath(value);
  if (!parsed.endsWith(NOTE_EXTENSION)) {
    throw new TypeError('Vault note path must target a .typ file');
  }
  return parsed;
};

export const parseVaultHandle = (value: unknown): VaultHandle => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['rootName']) || typeof value.rootName !== 'string') {
    throw new TypeError('Malformed vault handle');
  }

  if (value.rootName.length === 0 || value.rootName.includes('\0')) {
    throw new TypeError('Malformed vault handle');
  }

  return { rootName: value.rootName };
};

export const parseNoteMeta = (value: unknown): NoteMeta => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['id', 'relPath', 'basename', 'title', 'byteSize', 'mtimeMs'])
  ) {
    throw new TypeError('Malformed note metadata');
  }

  const relPath = parseVaultPath(value.relPath);
  const basename = value.basename;
  const title = value.title;
  const id = value.id;

  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    typeof basename !== 'string' ||
    basename.length === 0 ||
    typeof title !== 'string' ||
    title.length === 0 ||
    !isFiniteNonNegativeNumber(value.byteSize) ||
    !isFiniteNonNegativeNumber(value.mtimeMs)
  ) {
    throw new TypeError('Malformed note metadata');
  }

  return {
    id,
    relPath,
    basename,
    title,
    byteSize: value.byteSize,
    mtimeMs: value.mtimeMs
  };
};

export const parseNoteMetaList = (value: unknown): NoteMeta[] => {
  if (!Array.isArray(value)) {
    throw new TypeError('Malformed note metadata list');
  }

  return value.map(parseNoteMeta);
};

export const parseVaultRenderFile = (value: unknown): VaultRenderFile => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['relPath', 'contents'])) {
    throw new TypeError('Malformed vault render file');
  }

  if (typeof value.relPath !== 'string' || typeof value.contents !== 'string') {
    throw new TypeError('Malformed vault render file');
  }

  try {
    assertSafeRelativePosixPath(value.relPath, {
      label: 'vault render file path',
      allowedSuffixes: RENDER_FILE_SUFFIXES
    });
  } catch {
    throw new TypeError('Malformed vault render file');
  }

  return { relPath: value.relPath, contents: value.contents };
};

export const parseVaultRenderFileList = (value: unknown): VaultRenderFile[] => {
  if (!Array.isArray(value)) {
    throw new TypeError('Malformed vault render file list');
  }

  return value.map(parseVaultRenderFile);
};

export const createOpenVaultRequest = (rootPath?: string): OpenVaultRequest =>
  rootPath === undefined ? { type: VAULT_OPEN_CHANNEL } : { type: VAULT_OPEN_CHANNEL, rootPath };

export const parseOpenVaultRequestArgs = (args: readonly unknown[]): OpenVaultRequest => {
  if (args.length > 1) {
    throw new TypeError('vault.open accepts zero or one argument');
  }

  if (args.length === 0 || args[0] === undefined) {
    return createOpenVaultRequest();
  }

  return createOpenVaultRequest(assertRootPath(args[0]));
};

export const parseOpenVaultInvokeRequest = (value: unknown): OpenVaultRequest => {
  if (!isRecord(value) || value.type !== VAULT_OPEN_CHANNEL) {
    throw new TypeError('Malformed vault.open request');
  }

  if (!hasOnlyKeys(value, ['type', 'rootPath'])) {
    throw new TypeError('Malformed vault.open request');
  }

  if (value.rootPath === undefined) {
    return createOpenVaultRequest();
  }

  return createOpenVaultRequest(assertRootPath(value.rootPath));
};

export const createListNotesRequest = (): ListNotesRequest => ({ type: VAULT_LIST_CHANNEL });

export const parseListNotesRequestArgs = (args: readonly unknown[]): ListNotesRequest => {
  if (args.length !== 0) {
    throw new TypeError('vault.list accepts no arguments');
  }

  return createListNotesRequest();
};

export const parseListNotesInvokeRequest = (value: unknown): ListNotesRequest => {
  if (!isRecord(value) || value.type !== VAULT_LIST_CHANNEL || !hasOnlyKeys(value, ['type'])) {
    throw new TypeError('Malformed vault.list request');
  }

  return createListNotesRequest();
};

export const createListRenderFilesRequest = (): ListRenderFilesRequest => ({
  type: VAULT_RENDER_FILES_CHANNEL
});

export const parseListRenderFilesRequestArgs = (
  args: readonly unknown[]
): ListRenderFilesRequest => {
  if (args.length !== 0) {
    throw new TypeError('vault.renderFiles accepts no arguments');
  }

  return createListRenderFilesRequest();
};

export const parseListRenderFilesInvokeRequest = (value: unknown): ListRenderFilesRequest => {
  if (
    !isRecord(value) ||
    value.type !== VAULT_RENDER_FILES_CHANNEL ||
    !hasOnlyKeys(value, ['type'])
  ) {
    throw new TypeError('Malformed vault.renderFiles request');
  }

  return createListRenderFilesRequest();
};

export const createReadNoteRequest = (request: ReadNoteRequest): ReadNoteInvokeRequest => ({
  type: VAULT_READ_CHANNEL,
  relPath: parseManagedNotePath(request.relPath)
});

export const parseReadNoteRequest = (value: unknown): ReadNoteRequest => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['relPath'])) {
    throw new TypeError('Malformed vault.read request');
  }

  return { relPath: parseManagedNotePath(value.relPath) };
};

export const parseReadNoteInvokeRequest = (value: unknown): ReadNoteInvokeRequest => {
  if (
    !isRecord(value) ||
    value.type !== VAULT_READ_CHANNEL ||
    !hasOnlyKeys(value, ['type', 'relPath'])
  ) {
    throw new TypeError('Malformed vault.read request');
  }

  return createReadNoteRequest({ relPath: parseManagedNotePath(value.relPath) });
};

export const createCreateNoteRequest = (request: CreateNoteRequest): CreateNoteInvokeRequest => ({
  type: VAULT_CREATE_CHANNEL,
  relPath: parseManagedNotePath(request.relPath),
  ...(request.contents === undefined ? {} : { contents: request.contents })
});

export const parseCreateNoteRequest = (value: unknown): CreateNoteRequest => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['relPath', 'contents'])) {
    throw new TypeError('Malformed vault.create request');
  }

  if (value.contents !== undefined && typeof value.contents !== 'string') {
    throw new TypeError('vault.create contents must be a string');
  }

  return {
    relPath: parseManagedNotePath(value.relPath),
    ...(value.contents === undefined ? {} : { contents: value.contents })
  };
};

export const parseCreateNoteInvokeRequest = (value: unknown): CreateNoteInvokeRequest => {
  if (
    !isRecord(value) ||
    value.type !== VAULT_CREATE_CHANNEL ||
    !hasOnlyKeys(value, ['type', 'relPath', 'contents'])
  ) {
    throw new TypeError('Malformed vault.create request');
  }

  if (value.contents !== undefined && typeof value.contents !== 'string') {
    throw new TypeError('vault.create contents must be a string');
  }

  return createCreateNoteRequest({
    relPath: parseManagedNotePath(value.relPath),
    ...(value.contents === undefined ? {} : { contents: value.contents })
  });
};

export const createRenameNoteRequest = (request: RenameNoteRequest): RenameNoteInvokeRequest => ({
  type: VAULT_RENAME_CHANNEL,
  from: parseManagedNotePath(request.from),
  to: parseManagedNotePath(request.to)
});

export const parseRenameNoteRequest = (value: unknown): RenameNoteRequest => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['from', 'to'])) {
    throw new TypeError('Malformed vault.rename request');
  }

  return { from: parseManagedNotePath(value.from), to: parseManagedNotePath(value.to) };
};

export const parseRenameNoteInvokeRequest = (value: unknown): RenameNoteInvokeRequest => {
  if (
    !isRecord(value) ||
    value.type !== VAULT_RENAME_CHANNEL ||
    !hasOnlyKeys(value, ['type', 'from', 'to'])
  ) {
    throw new TypeError('Malformed vault.rename request');
  }

  return createRenameNoteRequest({
    from: parseManagedNotePath(value.from),
    to: parseManagedNotePath(value.to)
  });
};

export const createDeleteNoteRequest = (request: DeleteNoteRequest): DeleteNoteInvokeRequest => ({
  type: VAULT_DELETE_CHANNEL,
  relPath: parseManagedNotePath(request.relPath)
});

export const parseDeleteNoteRequest = (value: unknown): DeleteNoteRequest => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['relPath'])) {
    throw new TypeError('Malformed vault.delete request');
  }

  return { relPath: parseManagedNotePath(value.relPath) };
};

export const parseDeleteNoteInvokeRequest = (value: unknown): DeleteNoteInvokeRequest => {
  if (
    !isRecord(value) ||
    value.type !== VAULT_DELETE_CHANNEL ||
    !hasOnlyKeys(value, ['type', 'relPath'])
  ) {
    throw new TypeError('Malformed vault.delete request');
  }

  return createDeleteNoteRequest({ relPath: parseManagedNotePath(value.relPath) });
};

export const parseReadNoteResponse = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new TypeError('Malformed vault.read response');
  }

  return value;
};

export const parseVoidResponse = (value: unknown): void => {
  if (value !== undefined && value !== null) {
    throw new TypeError('Malformed void response');
  }
};

export const parseVaultChange = (value: unknown): VaultChange => {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    throw new TypeError('Malformed vault change');
  }

  switch (value.kind) {
    case 'created':
    case 'changed': {
      if (!hasOnlyKeys(value, ['kind', 'note']) || value.note === undefined) {
        throw new TypeError('Malformed vault change');
      }

      return { kind: value.kind, note: parseNoteMeta(value.note) };
    }

    case 'deleted': {
      if (!hasOnlyKeys(value, ['kind', 'relPath']) || value.relPath === undefined) {
        throw new TypeError('Malformed vault change');
      }

      return { kind: 'deleted', relPath: parseVaultPath(value.relPath) };
    }

    case 'renamed': {
      if (
        !hasOnlyKeys(value, ['kind', 'oldRelPath', 'newRelPath', 'note']) ||
        value.oldRelPath === undefined ||
        value.newRelPath === undefined ||
        value.note === undefined
      ) {
        throw new TypeError('Malformed vault change');
      }

      return {
        kind: 'renamed',
        oldRelPath: parseVaultPath(value.oldRelPath),
        newRelPath: parseVaultPath(value.newRelPath),
        note: parseNoteMeta(value.note)
      };
    }

    case 'structural': {
      if (!hasOnlyKeys(value, ['kind', 'relPath', 'action'])) {
        throw new TypeError('Malformed vault change');
      }
      if (value.action !== 'directory-created' && value.action !== 'directory-deleted') {
        throw new TypeError('Malformed vault change');
      }
      return {
        kind: 'structural',
        relPath: parseVaultDirectoryPath(value.relPath),
        action: value.action
      };
    }

    default:
      throw new TypeError('Malformed vault change');
  }
};

// ── Managed entries (notes, directories, templates) ──────────────────────────
