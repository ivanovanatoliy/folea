import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  NoteMeta,
  VaultDirectory,
  VaultRenderFile,
  VaultSnapshot,
  VaultTemplate
} from '../../shared/ipc/vault';
import { OBSIDIAN_TYPST_PACKAGE_CACHE_RELATIVE_PATH } from '../../shared/obsidian-typst';
import { noteMetaFromAbsolutePath } from './metadata';
import {
  IGNORED_VAULT_DIRECTORIES,
  RENDER_IGNORED_VAULT_DIRECTORIES,
  isInsideOrEqual,
  isNodeError,
  pathExists,
  resolveExistingNotePath,
  toPosixPath,
  type OpenVaultRoot
} from './paths';
import { mapWithConcurrency, VAULT_IO_CONCURRENCY } from './concurrency';

export const VAULT_RENDER_FILES_MAX_COUNT = 10_000;
export const VAULT_RENDER_FILES_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export interface VaultReaderOptions {
  readonly renderFilesMaxCount?: number;
  readonly renderFilesMaxTotalBytes?: number;
}

interface RenderFilesBudget {
  fileCount: number;
  totalBytes: number;
}

export class VaultIndexReader {
  constructor(
    private readonly root: OpenVaultRoot,
    private readonly options: VaultReaderOptions = {}
  ) {}

  async list(): Promise<NoteMeta[]> {
    const notes = await this.listDirectory(this.root.realRoot, new Set([this.root.realRoot]));
    return notes.sort((left, right) => left.relPath.localeCompare(right.relPath));
  }

  async snapshot(): Promise<VaultSnapshot> {
    const directories: VaultDirectory[] = [];
    const notes = await this.listDirectory(
      this.root.realRoot,
      new Set([this.root.realRoot]),
      directories
    );
    return {
      notes: notes.sort((left, right) => left.relPath.localeCompare(right.relPath)),
      directories: directories.sort((left, right) => left.relPath.localeCompare(right.relPath))
    };
  }

  async templates(): Promise<VaultTemplate[]> {
    const templatesRoot = path.join(this.root.realRoot, '_templates');
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(templatesRoot, { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return [];
      throw error;
    }
    const templates = await mapWithConcurrency(
      entries.filter((entry) => entry.isFile() && entry.name.endsWith('.typ')),
      VAULT_IO_CONCURRENCY,
      async (entry) => ({
        relPath: `_templates/${entry.name}`,
        name: entry.name.slice(0, -'.typ'.length),
        contents: await fs.readFile(path.join(templatesRoot, entry.name), 'utf8')
      })
    );
    return templates.sort((left, right) => left.name.localeCompare(right.name));
  }

  async renderFiles(): Promise<VaultRenderFile[]> {
    const budget: RenderFilesBudget = { fileCount: 0, totalBytes: 0 };
    const files = await this.listRenderDirectory(
      this.root.realRoot,
      new Set([this.root.realRoot]),
      budget
    );
    const packageRoot = path.join(
      this.root.realRoot,
      ...OBSIDIAN_TYPST_PACKAGE_CACHE_RELATIVE_PATH.split('/')
    );
    if (await pathExists(packageRoot)) {
      files.push(
        ...(await this.listRenderDirectory(
          packageRoot,
          new Set([await fs.realpath(packageRoot)]),
          budget,
          { includeIgnoredDirectories: true, packageCacheOnly: true }
        ))
      );
    }
    return [...new Map(files.map((file) => [file.relPath, file])).values()].sort((left, right) =>
      left.relPath.localeCompare(right.relPath)
    );
  }

  async read(relPath: string): Promise<string> {
    const resolved = await resolveExistingNotePath(this.root, relPath);
    return fs.readFile(resolved.absolutePath, 'utf8');
  }

  private async listDirectory(
    absoluteDirectory: string,
    visited: Set<string>,
    directories?: VaultDirectory[]
  ): Promise<NoteMeta[]> {
    const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
    const batches = await mapWithConcurrency(entries, VAULT_IO_CONCURRENCY, async (entry) => {
      if (entry.isDirectory() && IGNORED_VAULT_DIRECTORIES.has(entry.name)) return [];
      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        const realDirectory = await fs.realpath(absolutePath);
        if (!isInsideOrEqual(this.root.realRoot, realDirectory) || visited.has(realDirectory))
          return [];
        visited.add(realDirectory);
        const relPath = toPosixPath(path.relative(this.root.realRoot, absolutePath));
        directories?.push({ relPath, name: entry.name });
        return this.listDirectory(absolutePath, visited, directories);
      }
      if (entry.isSymbolicLink()) return this.listSymlink(absolutePath, visited);
      return entry.isFile() && entry.name.endsWith('.typ')
        ? [await noteMetaFromAbsolutePath(this.root, absolutePath)]
        : [];
    });
    return batches.flat();
  }

  private async listRenderDirectory(
    absoluteDirectory: string,
    visited: Set<string>,
    budget: RenderFilesBudget,
    options: { includeIgnoredDirectories?: boolean; packageCacheOnly?: boolean } = {}
  ): Promise<VaultRenderFile[]> {
    const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
    const batches = await mapWithConcurrency(entries, VAULT_IO_CONCURRENCY, async (entry) => {
      if (
        !options.includeIgnoredDirectories &&
        entry.isDirectory() &&
        RENDER_IGNORED_VAULT_DIRECTORIES.has(entry.name)
      )
        return [];
      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        const realDirectory = await fs.realpath(absolutePath);
        if (!isInsideOrEqual(this.root.realRoot, realDirectory) || visited.has(realDirectory))
          return [];
        visited.add(realDirectory);
        return this.listRenderDirectory(absolutePath, visited, budget, options);
      }
      const isText =
        entry.isFile() &&
        (entry.name.endsWith('.typ') ||
          (options.packageCacheOnly === true && entry.name === 'typst.toml'));
      if (!isText) return [];
      const relPath = toPosixPath(path.relative(this.root.realRoot, absolutePath));
      this.reserveRenderBudget(relPath, (await fs.stat(absolutePath)).size, budget);
      return [{ relPath, contents: await fs.readFile(absolutePath, 'utf8') }];
    });
    return batches.flat();
  }

  private reserveRenderBudget(relPath: string, byteSize: number, budget: RenderFilesBudget): void {
    const maxCount = this.options.renderFilesMaxCount ?? VAULT_RENDER_FILES_MAX_COUNT;
    const maxBytes = this.options.renderFilesMaxTotalBytes ?? VAULT_RENDER_FILES_MAX_TOTAL_BYTES;
    if (budget.fileCount + 1 > maxCount)
      throw new Error(
        `Vault render snapshot exceeds ${maxCount} text files while adding ${relPath}`
      );
    if (budget.totalBytes + byteSize > maxBytes)
      throw new Error(`Vault render snapshot exceeds ${maxBytes} bytes while adding ${relPath}`);
    budget.fileCount++;
    budget.totalBytes += byteSize;
  }

  private async listSymlink(absolutePath: string, visited: Set<string>): Promise<NoteMeta[]> {
    let realPath: string;
    try {
      realPath = await fs.realpath(absolutePath);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return [];
      throw error;
    }
    if (!isInsideOrEqual(this.root.realRoot, realPath)) return [];
    const stats = await fs.stat(realPath);
    if (stats.isDirectory()) {
      if (visited.has(realPath)) return [];
      visited.add(realPath);
      return this.listDirectory(absolutePath, visited);
    }
    if (!stats.isFile() || !absolutePath.endsWith('.typ')) return [];
    const relPath = toPosixPath(path.relative(this.root.realRoot, absolutePath));
    return [await noteMetaFromAbsolutePath(this.root, absolutePath, relPath)];
  }
}
