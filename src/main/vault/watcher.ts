import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';

import {
  parseVaultChange,
  parseVaultDirectoryPath,
  type VaultChange,
  type VaultPath
} from '../../shared/ipc/vault';
import { noteMetaFromAbsolutePath } from './metadata';
import {
  IGNORED_VAULT_DIRECTORIES,
  isInsideOrEqual,
  isNodeError,
  relPathFromAbsolute,
  type OpenVaultRoot
} from './paths';

const DELETE_COALESCE_MS = 150;
const STRUCTURAL_DEBOUNCE_MS = 80;

export const observeWatcherTask = (
  task: Promise<void>,
  onError: (error: unknown) => void
): void => {
  void task.catch(onError);
};

export class VaultWatcher {
  private watcher: FSWatcher | undefined;
  private readonly pendingDeletes = new Map<VaultPath, ReturnType<typeof setTimeout>>();
  private structuralTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly root: OpenVaultRoot,
    private readonly emit: (event: VaultChange) => void
  ) {}

  async start(): Promise<void> {
    const ready = new Promise<void>((resolve, reject) => {
      this.watcher = chokidar.watch(this.root.realRoot, {
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 20
        },
        ignored: (candidatePath, stats) => this.shouldIgnore(candidatePath.toString(), stats),
        followSymlinks: false
      });

      this.watcher.once('ready', resolve);
      this.watcher.once('error', reject);
      this.watcher.on('add', (absolutePath) =>
        observeWatcherTask(this.handleAdd(absolutePath), this.reportError)
      );
      this.watcher.on('change', (absolutePath) =>
        observeWatcherTask(this.handleChange(absolutePath), this.reportError)
      );
      this.watcher.on('unlink', (absolutePath) => this.handleUnlink(absolutePath));
      this.watcher.on('addDir', (absolutePath) =>
        this.handleDirectory(absolutePath, 'directory-created')
      );
      this.watcher.on('unlinkDir', (absolutePath) =>
        this.handleDirectory(absolutePath, 'directory-deleted')
      );
    });

    await ready;
  }

  private readonly reportError = (error: unknown): void => {
    console.error('[vault-watcher] Failed to process filesystem event:', error);
  };

  async close(): Promise<void> {
    for (const timer of this.pendingDeletes.values()) {
      clearTimeout(timer);
    }
    this.pendingDeletes.clear();
    if (this.structuralTimer) clearTimeout(this.structuralTimer);
    this.structuralTimer = undefined;

    if (this.watcher) {
      const watcher = this.watcher;
      this.watcher = undefined;
      await watcher.close();
    }
  }

  private shouldIgnore(candidatePath: string, stats?: import('node:fs').Stats): boolean {
    const basename = path.basename(candidatePath);
    if (stats?.isDirectory() && IGNORED_VAULT_DIRECTORIES.has(basename)) {
      return true;
    }

    if (stats && !stats.isDirectory() && !candidatePath.endsWith('.typ')) {
      return true;
    }

    return false;
  }

  private toRelPath(absolutePath: string): VaultPath | undefined {
    const resolvedPath = path.resolve(absolutePath);
    if (!isInsideOrEqual(this.root.realRoot, resolvedPath)) {
      return undefined;
    }

    try {
      return relPathFromAbsolute(this.root, resolvedPath);
    } catch {
      return undefined;
    }
  }

  private async noteChange(
    kind: 'created' | 'changed',
    absolutePath: string,
    relPath?: VaultPath
  ): Promise<VaultChange | undefined> {
    try {
      const note = await noteMetaFromAbsolutePath(this.root, absolutePath, relPath);
      return { kind, note };
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return undefined;
      }

      throw error;
    }
  }

  private async handleAdd(absolutePath: string): Promise<void> {
    const relPath = this.toRelPath(absolutePath);
    if (!relPath) {
      return;
    }

    const pendingDelete = this.pendingDeletes.get(relPath);
    if (pendingDelete) {
      clearTimeout(pendingDelete);
      this.pendingDeletes.delete(relPath);
      const event = await this.noteChange('changed', absolutePath, relPath);
      if (event) {
        this.safeEmit(event);
      }
      return;
    }

    const event = await this.noteChange('created', absolutePath, relPath);
    if (event) {
      this.safeEmit(event);
    }
  }

  private async handleChange(absolutePath: string): Promise<void> {
    const relPath = this.toRelPath(absolutePath);
    if (!relPath) {
      return;
    }

    const event = await this.noteChange('changed', absolutePath, relPath);
    if (event) {
      this.safeEmit(event);
    }
  }

  private handleUnlink(absolutePath: string): void {
    const relPath = this.toRelPath(absolutePath);
    if (!relPath) {
      return;
    }

    const existing = this.pendingDeletes.get(relPath);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.pendingDeletes.delete(relPath);
      this.safeEmit({ kind: 'deleted', relPath });
    }, DELETE_COALESCE_MS);

    this.pendingDeletes.set(relPath, timer);
  }

  private handleDirectory(
    absolutePath: string,
    action: 'directory-created' | 'directory-deleted'
  ): void {
    const rel = toPosixDirectory(this.root.realRoot, absolutePath);
    if (!rel) return;
    if (this.structuralTimer) clearTimeout(this.structuralTimer);
    this.structuralTimer = setTimeout(() => {
      this.structuralTimer = undefined;
      this.safeEmit({ kind: 'structural', relPath: rel, action });
    }, STRUCTURAL_DEBOUNCE_MS);
  }

  private safeEmit(event: VaultChange): void {
    this.emit(parseVaultChange(event));
  }
}

const toPosixDirectory = (root: string, absolutePath: string): string | undefined => {
  const resolved = path.resolve(absolutePath);
  if (!isInsideOrEqual(root, resolved) || resolved === root) return undefined;
  try {
    return parseVaultDirectoryPath(path.relative(root, resolved).split(path.sep).join('/'));
  } catch {
    return undefined;
  }
};
