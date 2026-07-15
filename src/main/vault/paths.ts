import { promises as fs } from 'node:fs';
import path from 'node:path';

import { parseVaultEntryPath, parseVaultPath, type VaultPath } from '../../shared/ipc/vault';

export class VaultPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultPathError';
  }
}

export interface OpenVaultRoot {
  readonly rootPath: string;
  readonly realRoot: string;
  readonly rootName: string;
}

export interface ResolvedNotePath {
  readonly relPath: VaultPath;
  readonly absolutePath: string;
  readonly realPath?: string;
}

export const IGNORED_VAULT_DIRECTORIES = new Set([
  '.obsidian',
  '.git',
  'node_modules',
  '.folea',
  '.folea-cache',
  '_templates'
]);

export const RENDER_IGNORED_VAULT_DIRECTORIES = new Set(
  [...IGNORED_VAULT_DIRECTORIES].filter((name) => name !== '_templates')
);

export const toPosixPath = (value: string): string => value.split(path.sep).join('/');

export const isInsideOrEqual = (rootPath: string, candidatePath: string): boolean => {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

export const openVaultRoot = async (rootPath: string): Promise<OpenVaultRoot> => {
  if (!path.isAbsolute(rootPath)) {
    throw new VaultPathError('Vault root must be an absolute path');
  }

  const realRoot = await fs.realpath(rootPath);
  const stats = await fs.stat(realRoot);
  if (!stats.isDirectory()) {
    throw new VaultPathError('Vault root must be a directory');
  }

  return {
    rootPath: realRoot,
    realRoot,
    rootName: path.basename(realRoot)
  };
};

export const resolveRelativeNotePath = (
  root: OpenVaultRoot,
  relPath: unknown
): ResolvedNotePath => {
  const safeRelPath = parseVaultEntryPath(relPath);
  if (!safeRelPath.endsWith('.typ')) {
    throw new TypeError('Vault note path must target a .typ file');
  }
  const absolutePath = path.resolve(root.realRoot, ...safeRelPath.split('/'));

  if (!isInsideOrEqual(root.realRoot, absolutePath)) {
    throw new VaultPathError('Vault path resolves outside the vault');
  }

  return { relPath: safeRelPath, absolutePath };
};

export const resolveRelativeEntryPath = (
  root: OpenVaultRoot,
  relPath: unknown,
  options: { readonly allowTemplates?: boolean } = {}
): ResolvedNotePath => {
  const safeRelPath = parseVaultEntryPath(relPath, options);
  const absolutePath = path.resolve(root.realRoot, ...safeRelPath.split('/'));
  if (!isInsideOrEqual(root.realRoot, absolutePath)) {
    throw new VaultPathError('Vault path resolves outside the vault');
  }
  return { relPath: safeRelPath, absolutePath };
};

const nearestExistingAncestor = async (absolutePath: string): Promise<string> => {
  let current = absolutePath;

  for (;;) {
    try {
      const stats = await fs.lstat(current);
      if (!stats.isDirectory() && !stats.isSymbolicLink()) {
        throw new VaultPathError('Vault path parent is not a directory');
      }

      return current;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        const parent = path.dirname(current);
        if (parent === current) {
          throw new VaultPathError('No existing parent directory found');
        }

        current = parent;
        continue;
      }

      throw error;
    }
  }
};

const ensureRealPathInsideRoot = async (
  root: OpenVaultRoot,
  candidatePath: string,
  message: string
): Promise<string> => {
  const realPath = await fs.realpath(candidatePath);
  if (!isInsideOrEqual(root.realRoot, realPath)) {
    throw new VaultPathError(message);
  }

  return realPath;
};

export const resolveExistingNotePath = async (
  root: OpenVaultRoot,
  relPath: unknown
): Promise<ResolvedNotePath> => {
  const resolved = resolveRelativeNotePath(root, relPath);
  const realPath = await ensureRealPathInsideRoot(
    root,
    resolved.absolutePath,
    'Vault note symlink resolves outside the vault'
  );

  const stats = await fs.stat(realPath);
  if (!stats.isFile()) {
    throw new VaultPathError('Vault note path must resolve to a file');
  }

  return { ...resolved, realPath };
};

export const resolveNewNotePath = async (
  root: OpenVaultRoot,
  relPath: unknown
): Promise<ResolvedNotePath> => {
  const resolved = resolveRelativeNotePath(root, relPath);
  const parentPath = path.dirname(resolved.absolutePath);
  const existingAncestor = await nearestExistingAncestor(parentPath);
  const realAncestor = await ensureRealPathInsideRoot(
    root,
    existingAncestor,
    'Vault note parent symlink resolves outside the vault'
  );

  if (!isInsideOrEqual(root.realRoot, realAncestor)) {
    throw new VaultPathError('Vault note parent resolves outside the vault');
  }

  return resolved;
};

export const resolveExistingEntryPath = async (
  root: OpenVaultRoot,
  relPath: unknown,
  options: { readonly allowTemplates?: boolean } = {}
): Promise<ResolvedNotePath> => {
  const resolved = resolveRelativeEntryPath(root, relPath, options);
  const realPath = await ensureRealPathInsideRoot(
    root,
    resolved.absolutePath,
    'Vault entry symlink resolves outside the vault'
  );
  return { ...resolved, realPath };
};

export const resolveNewEntryPath = async (
  root: OpenVaultRoot,
  relPath: unknown,
  options: { readonly allowTemplates?: boolean } = {}
): Promise<ResolvedNotePath> => {
  const resolved = resolveRelativeEntryPath(root, relPath, options);
  const existingAncestor = await nearestExistingAncestor(path.dirname(resolved.absolutePath));
  await ensureRealPathInsideRoot(
    root,
    existingAncestor,
    'Vault entry parent symlink resolves outside the vault'
  );
  return resolved;
};

export const relPathFromAbsolute = (root: OpenVaultRoot, absolutePath: string): VaultPath => {
  const relPath = toPosixPath(path.relative(root.realRoot, absolutePath));
  return parseVaultPath(relPath);
};

export const pathExists = async (absolutePath: string): Promise<boolean> => {
  try {
    await fs.lstat(absolutePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
};

export interface ErrorWithCode extends Error {
  readonly code?: string;
}

export const isNodeError = (error: unknown): error is ErrorWithCode =>
  error instanceof Error && 'code' in error;
