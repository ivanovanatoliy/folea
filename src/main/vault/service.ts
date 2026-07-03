import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  parseVaultChange,
  type CreateNoteRequest,
  type DeleteNoteRequest,
  type NoteMeta,
  type ReadNoteRequest,
  type RenameNoteRequest,
  type VaultChange,
  type VaultHandle,
  type VaultRenderFile
} from '../../shared/ipc/vault';
import { OBSIDIAN_TYPST_PACKAGE_CACHE_RELATIVE_PATH } from '../../shared/obsidian-typst';
import { noteMetaFromAbsolutePath } from './metadata';
import {
  IGNORED_VAULT_DIRECTORIES,
  isInsideOrEqual,
  isNodeError,
  openVaultRoot,
  pathExists,
  resolveExistingNotePath,
  resolveNewNotePath,
  toPosixPath,
  type OpenVaultRoot
} from './paths';
import { VaultWatcher } from './watcher';

type VaultChangeListener = (event: VaultChange) => void;

// Render dependency snapshots are IPC payloads: generous for normal vaults, bounded for safety.
export const VAULT_RENDER_FILES_MAX_COUNT = 10_000;
export const VAULT_RENDER_FILES_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export interface VaultServiceOptions {
  readonly renderFilesMaxCount?: number;
  readonly renderFilesMaxTotalBytes?: number;
}

interface RenderFilesBudget {
  fileCount: number;
  totalBytes: number;
}

export class VaultService {
  private root: OpenVaultRoot | undefined;
  private watcher: VaultWatcher | undefined;
  private readonly listeners = new Set<VaultChangeListener>();

  constructor(private readonly options: VaultServiceOptions = {}) {}

  onChanged(listener: VaultChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async open(rootPath: string): Promise<VaultHandle> {
    const nextRoot = await openVaultRoot(rootPath);
    await this.closeWatcher();
    this.root = nextRoot;

    const watcher = new VaultWatcher(nextRoot, (event) => this.emit(event));
    await watcher.start();
    this.watcher = watcher;

    return { rootName: nextRoot.rootName };
  }

  async close(): Promise<void> {
    await this.closeWatcher();
    this.root = undefined;
  }

  async dispose(): Promise<void> {
    await this.close();
    this.listeners.clear();
  }

  async list(): Promise<NoteMeta[]> {
    const root = this.requireRoot();
    const notes = await this.listFromDirectory(root, root.realRoot, new Set([root.realRoot]));
    return notes.sort((left, right) => left.relPath.localeCompare(right.relPath));
  }

  async renderFiles(): Promise<VaultRenderFile[]> {
    const root = this.requireRoot();
    const budget: RenderFilesBudget = { fileCount: 0, totalBytes: 0 };
    const files = await this.listRenderFilesFromDirectory(
      root,
      root.realRoot,
      new Set([root.realRoot]),
      budget
    );
    const packageCacheRoot = path.join(
      root.realRoot,
      ...OBSIDIAN_TYPST_PACKAGE_CACHE_RELATIVE_PATH.split('/')
    );

    if (await pathExists(packageCacheRoot)) {
      files.push(
        ...(await this.listRenderFilesFromDirectory(
          root,
          packageCacheRoot,
          new Set([await fs.realpath(packageCacheRoot)]),
          budget,
          { includeIgnoredDirectories: true, packageCacheOnly: true }
        ))
      );
    }

    const unique = new Map(files.map((file) => [file.relPath, file]));
    return [...unique.values()].sort((left, right) => left.relPath.localeCompare(right.relPath));
  }

  async read(request: ReadNoteRequest): Promise<string> {
    const root = this.requireRoot();
    const resolved = await resolveExistingNotePath(root, request.relPath);
    return fs.readFile(resolved.absolutePath, 'utf8');
  }

  async create(request: CreateNoteRequest): Promise<NoteMeta> {
    const root = this.requireRoot();
    const resolved = await resolveNewNotePath(root, request.relPath);

    if (await pathExists(resolved.absolutePath)) {
      throw new Error('Vault note already exists');
    }

    await fs.mkdir(path.dirname(resolved.absolutePath), { recursive: true });
    await fs.writeFile(resolved.absolutePath, request.contents ?? '', {
      encoding: 'utf8',
      flag: 'wx'
    });

    const note = await noteMetaFromAbsolutePath(root, resolved.absolutePath, resolved.relPath);
    this.emit({ kind: 'created', note });
    return note;
  }

  async rename(request: RenameNoteRequest): Promise<NoteMeta> {
    const root = this.requireRoot();
    const from = await resolveExistingNotePath(root, request.from);
    const to = await resolveNewNotePath(root, request.to);

    if (await pathExists(to.absolutePath)) {
      throw new Error('Vault note destination already exists');
    }

    await fs.mkdir(path.dirname(to.absolutePath), { recursive: true });
    await fs.rename(from.absolutePath, to.absolutePath);

    const note = await noteMetaFromAbsolutePath(root, to.absolutePath, to.relPath);
    this.emit({ kind: 'renamed', oldRelPath: from.relPath, newRelPath: to.relPath, note });
    return note;
  }

  async delete(request: DeleteNoteRequest): Promise<void> {
    const root = this.requireRoot();
    const resolved = await resolveExistingNotePath(root, request.relPath);
    await fs.unlink(resolved.absolutePath);
    this.emit({ kind: 'deleted', relPath: resolved.relPath });
  }

  private requireRoot(): OpenVaultRoot {
    if (!this.root) {
      throw new Error('No vault is open');
    }

    return this.root;
  }

  getOpenRoot(): OpenVaultRoot | undefined {
    return this.root;
  }

  private async closeWatcher(): Promise<void> {
    if (this.watcher) {
      const watcher = this.watcher;
      this.watcher = undefined;
      await watcher.close();
    }
  }

  private async listFromDirectory(
    root: OpenVaultRoot,
    absoluteDirectory: string,
    visitedRealDirectories: Set<string>
  ): Promise<NoteMeta[]> {
    const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
    const notes: NoteMeta[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && IGNORED_VAULT_DIRECTORIES.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        const realDirectory = await fs.realpath(absolutePath);
        if (
          !isInsideOrEqual(root.realRoot, realDirectory) ||
          visitedRealDirectories.has(realDirectory)
        ) {
          continue;
        }

        visitedRealDirectories.add(realDirectory);
        notes.push(...(await this.listFromDirectory(root, absolutePath, visitedRealDirectories)));
        continue;
      }

      if (entry.isSymbolicLink()) {
        notes.push(...(await this.listSymlink(root, absolutePath, visitedRealDirectories)));
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.typ')) {
        notes.push(await noteMetaFromAbsolutePath(root, absolutePath));
      }
    }

    return notes;
  }

  private async listRenderFilesFromDirectory(
    root: OpenVaultRoot,
    absoluteDirectory: string,
    visitedRealDirectories: Set<string>,
    budget: RenderFilesBudget,
    options: {
      readonly includeIgnoredDirectories?: boolean;
      readonly packageCacheOnly?: boolean;
    } = {}
  ): Promise<VaultRenderFile[]> {
    const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
    const files: VaultRenderFile[] = [];

    for (const entry of entries) {
      if (
        !options.includeIgnoredDirectories &&
        entry.isDirectory() &&
        IGNORED_VAULT_DIRECTORIES.has(entry.name)
      ) {
        continue;
      }

      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        const realDirectory = await fs.realpath(absolutePath);
        if (
          !isInsideOrEqual(root.realRoot, realDirectory) ||
          visitedRealDirectories.has(realDirectory)
        ) {
          continue;
        }

        visitedRealDirectories.add(realDirectory);
        files.push(
          ...(await this.listRenderFilesFromDirectory(
            root,
            absolutePath,
            visitedRealDirectories,
            budget,
            options
          ))
        );
        continue;
      }

      if (!entry.isFile() || !this.isRenderTextFile(entry.name, options.packageCacheOnly)) {
        continue;
      }

      const relPath = toPosixPath(path.relative(root.realRoot, absolutePath));
      const stats = await fs.stat(absolutePath);
      this.reserveRenderFileBudget(relPath, stats.size, budget);
      files.push({
        relPath,
        contents: await fs.readFile(absolutePath, 'utf8')
      });
    }

    return files;
  }

  private isRenderTextFile(filename: string, packageCacheOnly?: boolean): boolean {
    if (filename.endsWith('.typ')) {
      return true;
    }

    return packageCacheOnly === true && filename === 'typst.toml';
  }

  private reserveRenderFileBudget(
    relPath: string,
    byteSize: number,
    budget: RenderFilesBudget
  ): void {
    const maxCount = this.options.renderFilesMaxCount ?? VAULT_RENDER_FILES_MAX_COUNT;
    const maxTotalBytes =
      this.options.renderFilesMaxTotalBytes ?? VAULT_RENDER_FILES_MAX_TOTAL_BYTES;
    const nextFileCount = budget.fileCount + 1;
    const nextTotalBytes = budget.totalBytes + byteSize;

    if (nextFileCount > maxCount) {
      throw new Error(
        `Vault render snapshot exceeds ${maxCount} text files while adding ${relPath}`
      );
    }

    if (nextTotalBytes > maxTotalBytes) {
      throw new Error(
        `Vault render snapshot exceeds ${maxTotalBytes} bytes while adding ${relPath}`
      );
    }

    budget.fileCount = nextFileCount;
    budget.totalBytes = nextTotalBytes;
  }

  private async listSymlink(
    root: OpenVaultRoot,
    absolutePath: string,
    visitedRealDirectories: Set<string>
  ): Promise<NoteMeta[]> {
    let realPath: string;
    try {
      realPath = await fs.realpath(absolutePath);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return [];
      }

      throw error;
    }

    if (!isInsideOrEqual(root.realRoot, realPath)) {
      return [];
    }

    const stats = await fs.stat(realPath);
    if (stats.isDirectory()) {
      if (visitedRealDirectories.has(realPath)) {
        return [];
      }

      visitedRealDirectories.add(realPath);
      return this.listFromDirectory(root, absolutePath, visitedRealDirectories);
    }

    if (stats.isFile() && absolutePath.endsWith('.typ')) {
      const relPath = toPosixPath(path.relative(root.realRoot, absolutePath));
      return [await noteMetaFromAbsolutePath(root, absolutePath, relPath)];
    }

    return [];
  }

  private emit(event: VaultChange): void {
    const safeEvent = parseVaultChange(event);
    for (const listener of this.listeners) {
      listener(safeEvent);
    }
  }
}

export const vaultService = new VaultService();
