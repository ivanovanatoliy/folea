import { parseVaultDirectoryPath, parseVaultEntryPath } from './vault-path';
import {
  VAULT_SNAPSHOT_CHANNEL,
  VAULT_TEMPLATES_CHANNEL,
  VAULT_CREATE_DIRECTORY_CHANNEL,
  VAULT_ANALYZE_OPERATION_CHANNEL,
  VAULT_RENAME_ENTRY_CHANNEL,
  VAULT_MOVE_BATCH_CHANNEL,
  VAULT_TRASH_BATCH_CHANNEL,
  parseVaultPath,
  parseNoteMeta,
  type AnalyzeVaultOperationRequest,
  type CreateDirectoryRequest,
  type MoveVaultEntriesRequest,
  type RenameVaultEntryRequest,
  type TrashVaultEntriesRequest,
  type MoveVaultEntriesResult,
  type TrashVaultEntriesResult,
  type VaultDirectory,
  type VaultEntryCounts,
  type VaultOperationImpact,
  type VaultPath,
  type VaultReferenceImpact,
  type VaultSnapshot,
  type VaultTemplate
} from './vault-core';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
};
const isFiniteNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export const parseVaultDirectory = (value: unknown): VaultDirectory => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['relPath', 'name'])) {
    throw new TypeError('Malformed vault directory');
  }
  const relPath = parseVaultDirectoryPath(value.relPath);
  const expectedName = relPath.split('/').at(-1);
  if (typeof value.name !== 'string' || value.name !== expectedName) {
    throw new TypeError('Malformed vault directory');
  }
  return { relPath, name: value.name };
};

export const parseVaultSnapshot = (value: unknown): VaultSnapshot => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['notes', 'directories'])) {
    throw new TypeError('Malformed vault snapshot');
  }
  if (!Array.isArray(value.notes) || !Array.isArray(value.directories)) {
    throw new TypeError('Malformed vault snapshot');
  }
  return {
    notes: value.notes.map(parseNoteMeta),
    directories: value.directories.map(parseVaultDirectory)
  };
};

export const parseVaultTemplate = (value: unknown): VaultTemplate => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['relPath', 'name', 'contents'])) {
    throw new TypeError('Malformed vault template');
  }
  const relPath = parseVaultEntryPath(value.relPath, { allowTemplates: true });
  if (!/^_templates\/[^/]+\.typ$/.test(relPath)) {
    throw new TypeError('Template must be a direct _templates/*.typ file');
  }
  if (
    typeof value.name !== 'string' ||
    value.name !== relPath.slice('_templates/'.length, -'.typ'.length) ||
    typeof value.contents !== 'string'
  ) {
    throw new TypeError('Malformed vault template');
  }
  return { relPath, name: value.name, contents: value.contents };
};

export const parseVaultTemplateList = (value: unknown): VaultTemplate[] => {
  if (!Array.isArray(value)) throw new TypeError('Malformed vault template list');
  return value.map(parseVaultTemplate);
};

const parseNoArgRequest = (
  value: unknown,
  type: string,
  label: string
): { readonly type: string } => {
  if (!isRecord(value) || value.type !== type || !hasOnlyKeys(value, ['type'])) {
    throw new TypeError(`Malformed ${label} request`);
  }
  return { type };
};

const stripRequestType = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'type'));

export const createVaultSnapshotRequest = () => ({ type: VAULT_SNAPSHOT_CHANNEL });
export const parseVaultSnapshotInvokeRequest = (value: unknown) =>
  parseNoArgRequest(value, VAULT_SNAPSHOT_CHANNEL, 'vault.snapshot');
export const createVaultTemplatesRequest = () => ({ type: VAULT_TEMPLATES_CHANNEL });
export const parseVaultTemplatesInvokeRequest = (value: unknown) =>
  parseNoArgRequest(value, VAULT_TEMPLATES_CHANNEL, 'vault.templates');

export const parseCreateDirectoryRequest = (value: unknown): CreateDirectoryRequest => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['relPath'])) {
    throw new TypeError('Malformed vault.createDirectory request');
  }
  return { relPath: parseVaultDirectoryPath(value.relPath) };
};
export const createCreateDirectoryRequest = (request: CreateDirectoryRequest) => ({
  type: VAULT_CREATE_DIRECTORY_CHANNEL,
  ...parseCreateDirectoryRequest(request)
});
export const parseCreateDirectoryInvokeRequest = (value: unknown): CreateDirectoryRequest => {
  if (
    !isRecord(value) ||
    value.type !== VAULT_CREATE_DIRECTORY_CHANNEL ||
    !hasOnlyKeys(value, ['type', 'relPath'])
  ) {
    throw new TypeError('Malformed vault.createDirectory request');
  }
  return parseCreateDirectoryRequest({ relPath: value.relPath });
};

const parseSourceList = (value: unknown): VaultPath[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('Vault operation requires at least one source');
  }
  const sources = value.map((source) => parseVaultEntryPath(source));
  if (new Set(sources).size !== sources.length) {
    throw new TypeError('Vault operation sources must be unique');
  }
  return sources;
};

export const parseAnalyzeVaultOperationRequest = (value: unknown): AnalyzeVaultOperationRequest => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['operation', 'sources', 'destination'])) {
    throw new TypeError('Malformed vault.analyzeOperation request');
  }
  if (value.operation !== 'rename' && value.operation !== 'move' && value.operation !== 'trash') {
    throw new TypeError('Malformed vault operation kind');
  }
  const destination = value.destination;
  if (
    (value.operation === 'rename' || value.operation === 'move') &&
    typeof destination !== 'string'
  ) {
    throw new TypeError('Move and rename analysis require a destination');
  }
  return {
    operation: value.operation,
    sources: parseSourceList(value.sources),
    ...(typeof destination === 'string'
      ? { destination: destination === '' ? '' : parseVaultEntryPath(destination) }
      : {})
  };
};
export const createAnalyzeVaultOperationRequest = (request: AnalyzeVaultOperationRequest) => ({
  type: VAULT_ANALYZE_OPERATION_CHANNEL,
  ...parseAnalyzeVaultOperationRequest(request)
});
export const parseAnalyzeVaultOperationInvokeRequest = (value: unknown) => {
  if (!isRecord(value) || value.type !== VAULT_ANALYZE_OPERATION_CHANNEL) {
    throw new TypeError('Malformed vault.analyzeOperation request');
  }
  return parseAnalyzeVaultOperationRequest(stripRequestType(value));
};

export const parseRenameVaultEntryRequest = (value: unknown): RenameVaultEntryRequest => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['from', 'to', 'updateReferences', 'templateMode'])) {
    throw new TypeError('Malformed vault.renameEntry request');
  }
  if (value.updateReferences !== undefined && typeof value.updateReferences !== 'boolean') {
    throw new TypeError('updateReferences must be a boolean');
  }
  if (value.templateMode !== undefined && typeof value.templateMode !== 'boolean') {
    throw new TypeError('templateMode must be a boolean');
  }
  const templateMode = value.templateMode === true;
  const from = parseVaultEntryPath(value.from, { allowTemplates: templateMode });
  const to = parseVaultEntryPath(value.to, { allowTemplates: templateMode });
  if (
    templateMode &&
    (!/^_templates\/[^/]+\.typ$/.test(from) || !/^_templates\/[^/]+\.typ$/.test(to))
  ) {
    throw new TypeError('Template rename must stay directly inside _templates');
  }
  return {
    from,
    to,
    ...(value.updateReferences === undefined ? {} : { updateReferences: value.updateReferences }),
    ...(value.templateMode === undefined ? {} : { templateMode: value.templateMode })
  };
};
export const createRenameVaultEntryRequest = (request: RenameVaultEntryRequest) => ({
  type: VAULT_RENAME_ENTRY_CHANNEL,
  ...parseRenameVaultEntryRequest(request)
});
export const parseRenameVaultEntryInvokeRequest = (value: unknown) => {
  if (!isRecord(value) || value.type !== VAULT_RENAME_ENTRY_CHANNEL) {
    throw new TypeError('Malformed vault.renameEntry request');
  }
  return parseRenameVaultEntryRequest(stripRequestType(value));
};

export const parseMoveVaultEntriesRequest = (value: unknown): MoveVaultEntriesRequest => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['sources', 'destinationDirectory', 'updateReferences'])
  ) {
    throw new TypeError('Malformed vault.moveBatch request');
  }
  if (value.updateReferences !== undefined && typeof value.updateReferences !== 'boolean') {
    throw new TypeError('updateReferences must be a boolean');
  }
  if (typeof value.destinationDirectory !== 'string') {
    throw new TypeError('destinationDirectory must be a string');
  }
  return {
    sources: parseSourceList(value.sources),
    destinationDirectory:
      value.destinationDirectory === '' ? '' : parseVaultDirectoryPath(value.destinationDirectory),
    ...(value.updateReferences === undefined ? {} : { updateReferences: value.updateReferences })
  };
};
export const createMoveVaultEntriesRequest = (request: MoveVaultEntriesRequest) => ({
  type: VAULT_MOVE_BATCH_CHANNEL,
  ...parseMoveVaultEntriesRequest(request)
});
export const parseMoveVaultEntriesInvokeRequest = (value: unknown) => {
  if (!isRecord(value) || value.type !== VAULT_MOVE_BATCH_CHANNEL) {
    throw new TypeError('Malformed vault.moveBatch request');
  }
  return parseMoveVaultEntriesRequest(stripRequestType(value));
};

export const parseTrashVaultEntriesRequest = (value: unknown): TrashVaultEntriesRequest => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['sources', 'removeReferences', 'templateMode'])) {
    throw new TypeError('Malformed vault.trashBatch request');
  }
  if (value.removeReferences !== undefined && typeof value.removeReferences !== 'boolean') {
    throw new TypeError('removeReferences must be a boolean');
  }
  if (value.templateMode !== undefined && typeof value.templateMode !== 'boolean') {
    throw new TypeError('templateMode must be a boolean');
  }
  const templateMode = value.templateMode === true;
  const sources = templateMode
    ? (() => {
        if (!Array.isArray(value.sources) || value.sources.length === 0)
          throw new TypeError('Vault operation requires at least one source');
        const parsed = value.sources.map((source) =>
          parseVaultEntryPath(source, { allowTemplates: true })
        );
        if (parsed.some((source) => !/^_templates\/[^/]+\.typ$/.test(source)))
          throw new TypeError('Template trash must target direct templates');
        if (new Set(parsed).size !== parsed.length)
          throw new TypeError('Vault operation sources must be unique');
        return parsed;
      })()
    : parseSourceList(value.sources);
  return {
    sources,
    ...(value.removeReferences === undefined ? {} : { removeReferences: value.removeReferences }),
    ...(value.templateMode === undefined ? {} : { templateMode: value.templateMode })
  };
};
export const createTrashVaultEntriesRequest = (request: TrashVaultEntriesRequest) => ({
  type: VAULT_TRASH_BATCH_CHANNEL,
  ...parseTrashVaultEntriesRequest(request)
});
export const parseTrashVaultEntriesInvokeRequest = (value: unknown) => {
  if (!isRecord(value) || value.type !== VAULT_TRASH_BATCH_CHANNEL) {
    throw new TypeError('Malformed vault.trashBatch request');
  }
  return parseTrashVaultEntriesRequest(stripRequestType(value));
};

export const parseVaultEntryCounts = (value: unknown): VaultEntryCounts => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['notes', 'directories', 'otherFiles'])) {
    throw new TypeError('Malformed vault entry counts');
  }
  if (
    !isFiniteNonNegativeNumber(value.notes) ||
    !isFiniteNonNegativeNumber(value.directories) ||
    !isFiniteNonNegativeNumber(value.otherFiles)
  ) {
    throw new TypeError('Malformed vault entry counts');
  }
  return { notes: value.notes, directories: value.directories, otherFiles: value.otherFiles };
};

export const parseVaultReferenceImpact = (value: unknown): VaultReferenceImpact => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['from', 'to', 'kind'])) {
    throw new TypeError('Malformed vault reference impact');
  }
  if (value.kind !== 'link' && value.kind !== 'import' && value.kind !== 'include') {
    throw new TypeError('Malformed vault reference impact');
  }
  return { from: parseVaultPath(value.from), to: parseVaultPath(value.to), kind: value.kind };
};

export const parseVaultOperationImpact = (value: unknown): VaultOperationImpact => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['counts', 'references', 'warnings']) ||
    !Array.isArray(value.references) ||
    !Array.isArray(value.warnings)
  ) {
    throw new TypeError('Malformed vault operation impact');
  }
  return {
    counts: parseVaultEntryCounts(value.counts),
    references: value.references.map(parseVaultReferenceImpact),
    warnings: value.warnings.map((warning) => {
      if (typeof warning !== 'string') throw new TypeError('Malformed vault operation warning');
      return warning;
    })
  };
};

export const parseMoveVaultEntriesResult = (value: unknown): MoveVaultEntriesResult => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['mappings', 'referencesUpdated', 'warnings']) ||
    !Array.isArray(value.mappings) ||
    !Array.isArray(value.warnings) ||
    !isFiniteNonNegativeNumber(value.referencesUpdated)
  ) {
    throw new TypeError('Malformed vault move result');
  }
  return {
    mappings: value.mappings.map((mapping) => {
      if (!isRecord(mapping) || !hasOnlyKeys(mapping, ['from', 'to']))
        throw new TypeError('Malformed vault path mapping');
      return {
        from: parseVaultEntryPath(mapping.from, { allowTemplates: true }),
        to: parseVaultEntryPath(mapping.to, { allowTemplates: true })
      };
    }),
    referencesUpdated: value.referencesUpdated,
    warnings: value.warnings.map((warning) => {
      if (typeof warning !== 'string') throw new TypeError('Malformed vault move warning');
      return warning;
    })
  };
};

export const parseTrashVaultEntriesResult = (value: unknown): TrashVaultEntriesResult => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['results', 'referencesUpdated', 'warnings']) ||
    !Array.isArray(value.results) ||
    !Array.isArray(value.warnings) ||
    !isFiniteNonNegativeNumber(value.referencesUpdated)
  ) {
    throw new TypeError('Malformed vault trash result');
  }
  return {
    results: value.results.map((result) => {
      if (
        !isRecord(result) ||
        !hasOnlyKeys(result, ['source', 'success', 'error']) ||
        typeof result.success !== 'boolean' ||
        (result.error !== undefined && typeof result.error !== 'string')
      ) {
        throw new TypeError('Malformed vault trash item result');
      }
      return {
        source: parseVaultEntryPath(result.source, { allowTemplates: true }),
        success: result.success,
        ...(result.error === undefined ? {} : { error: result.error })
      };
    }),
    referencesUpdated: value.referencesUpdated,
    warnings: value.warnings.map((warning) => {
      if (typeof warning !== 'string') throw new TypeError('Malformed vault trash warning');
      return warning;
    })
  };
};
