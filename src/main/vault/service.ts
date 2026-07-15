import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  parseVaultEntryPath,
  parseVaultChange,
  type AnalyzeVaultOperationRequest,
  type CreateDirectoryRequest,
  type CreateNoteRequest,
  type DeleteNoteRequest,
  type NoteMeta,
  type ReadNoteRequest,
  type RenameNoteRequest,
  type RenameVaultEntryRequest,
  type MoveVaultEntriesRequest,
  type MoveVaultEntriesResult,
  type TrashVaultEntriesRequest,
  type TrashVaultEntriesResult,
  type VaultChange,
  type VaultDirectory,
  type VaultHandle,
  type VaultOperationImpact,
  type VaultRenderFile,
  type VaultSnapshot,
  type VaultTemplate
} from '../../shared/ipc/vault';
import {
  cleanupTypstReferences,
  parseTypstReferences,
  resolveTypstReferencePath,
  rewriteTypstReferences
} from '../../shared/typst-links';
import { OBSIDIAN_TYPST_PACKAGE_CACHE_RELATIVE_PATH } from '../../shared/obsidian-typst';
import { noteMetaFromAbsolutePath } from './metadata';
import {
  IGNORED_VAULT_DIRECTORIES,
  RENDER_IGNORED_VAULT_DIRECTORIES,
  isInsideOrEqual,
  isNodeError,
  openVaultRoot,
  pathExists,
  resolveExistingNotePath,
  resolveExistingEntryPath,
  resolveNewEntryPath,
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
  readonly trashItem?: (absolutePath: string) => Promise<void>;
  readonly renamePath?: (from: string, to: string) => Promise<void>;
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

  async snapshot(): Promise<VaultSnapshot> {
    const root = this.requireRoot();
    const directories: VaultDirectory[] = [];
    const notes = await this.listFromDirectory(
      root,
      root.realRoot,
      new Set([root.realRoot]),
      directories
    );
    return {
      notes: notes.sort((left, right) => left.relPath.localeCompare(right.relPath)),
      directories: directories.sort((left, right) => left.relPath.localeCompare(right.relPath))
    };
  }

  async templates(): Promise<VaultTemplate[]> {
    const root = this.requireRoot();
    const templatesRoot = path.join(root.realRoot, '_templates');
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(templatesRoot, { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return [];
      throw error;
    }
    const templates = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.typ'))
        .map(async (entry) => ({
          relPath: `_templates/${entry.name}`,
          name: entry.name.slice(0, -'.typ'.length),
          contents: await fs.readFile(path.join(templatesRoot, entry.name), 'utf8')
        }))
    );
    return templates.sort((left, right) => left.name.localeCompare(right.name));
  }

  async createDirectory(request: CreateDirectoryRequest): Promise<VaultDirectory> {
    const root = this.requireRoot();
    const resolved = await resolveNewEntryPath(root, request.relPath);
    await fs.mkdir(resolved.absolutePath, { recursive: false });
    return { relPath: resolved.relPath, name: path.posix.basename(resolved.relPath) };
  }

  async analyzeOperation(request: AnalyzeVaultOperationRequest): Promise<VaultOperationImpact> {
    const sources = await this.preflightSources(request.sources);
    if (request.operation !== 'trash' && request.destination !== undefined) {
      if (request.operation === 'move') {
        await this.preflightMoveTargets(request.sources, request.destination);
      } else if (request.sources[0]) {
        await this.preflightRenameTarget(request.sources[0], request.destination);
      }
    }
    const counts = { notes: 0, directories: 0, otherFiles: 0 };
    const selectedNotes = new Set<string>();
    for (const source of sources) {
      const result = await this.countEntry(source.absolutePath, source.relPath);
      counts.notes += result.counts.notes;
      counts.directories += result.counts.directories;
      counts.otherFiles += result.counts.otherFiles;
      result.notes.forEach((note) => selectedNotes.add(note));
    }
    const allReferences = await this.findReferencesTo(selectedNotes);
    const references =
      request.operation === 'trash'
        ? allReferences.filter((reference) => !selectedNotes.has(reference.from))
        : allReferences;
    return { counts, references, warnings: [] };
  }

  async renameEntry(request: RenameVaultEntryRequest): Promise<MoveVaultEntriesResult> {
    const mapping = await this.preflightRenameTarget(
      request.from,
      request.to,
      request.templateMode === true
    );
    return this.executeMoves([mapping], request.updateReferences !== false);
  }

  async moveBatch(request: MoveVaultEntriesRequest): Promise<MoveVaultEntriesResult> {
    const mappings = await this.preflightMoveTargets(request.sources, request.destinationDirectory);
    return this.executeMoves(mappings, request.updateReferences !== false);
  }

  async trashBatch(request: TrashVaultEntriesRequest): Promise<TrashVaultEntriesResult> {
    this.requireRoot();
    const parsedSources = request.sources.map((source) =>
      parseVaultEntryPath(source, { allowTemplates: request.templateMode === true })
    );
    if (new Set(parsedSources).size !== parsedSources.length) {
      throw new Error('Duplicate vault operation source');
    }
    for (const source of parsedSources) {
      if (parsedSources.some((other) => other !== source && source.startsWith(`${other}/`))) {
        throw new Error('Vault operation sources must not overlap');
      }
    }
    const results: TrashVaultEntriesResult['results'][number][] = [];
    const deletedNotes = new Set<string>();
    const trashItem =
      this.options.trashItem ??
      (async (absolutePath: string) => {
        const { shell } = await import('electron');
        await shell.trashItem(absolutePath);
      });
    for (const sourcePath of parsedSources) {
      try {
        const [source] = await this.preflightSources([sourcePath], request.templateMode === true);
        if (!source) throw new Error('Vault entry does not exist');
        const counted = await this.countEntry(source.absolutePath, source.relPath);
        await trashItem(source.absolutePath);
        counted.notes.forEach((note) => deletedNotes.add(note));
        results.push({ source: source.relPath, success: true });
      } catch (error) {
        results.push({
          source: sourcePath,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    let referencesUpdated = 0;
    let warnings: readonly string[] = [];
    if (request.removeReferences === true && deletedNotes.size > 0) {
      const cleanup = await this.cleanupReferences(deletedNotes);
      referencesUpdated = cleanup.updated;
      warnings = cleanup.warnings;
    }
    return { results, referencesUpdated, warnings };
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
    visitedRealDirectories: Set<string>,
    directories?: VaultDirectory[]
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
        const relPath = toPosixPath(path.relative(root.realRoot, absolutePath));
        directories?.push({ relPath, name: entry.name });
        notes.push(
          ...(await this.listFromDirectory(root, absolutePath, visitedRealDirectories, directories))
        );
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
        RENDER_IGNORED_VAULT_DIRECTORIES.has(entry.name)
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

  private async preflightSources(
    sources: readonly string[],
    allowTemplates = false
  ): Promise<ResolvedManagedEntry[]> {
    const root = this.requireRoot();
    if (sources.length === 0) throw new Error('Vault operation requires at least one source');
    const parsed = sources.map((source) => parseVaultEntryPath(source, { allowTemplates }));
    if (new Set(parsed).size !== parsed.length) throw new Error('Duplicate vault operation source');
    for (const source of parsed) {
      if (parsed.some((other) => other !== source && source.startsWith(`${other}/`))) {
        throw new Error('Vault operation sources must not overlap');
      }
    }
    return Promise.all(
      parsed.map(async (relPath) => {
        const resolved = await resolveExistingEntryPath(root, relPath, { allowTemplates });
        const stats = await fs.lstat(resolved.absolutePath);
        if (!stats.isFile() && !stats.isDirectory()) {
          throw new Error(`Unsupported vault entry: ${relPath}`);
        }
        return {
          relPath: resolved.relPath,
          absolutePath: resolved.absolutePath,
          isDirectory: stats.isDirectory()
        };
      })
    );
  }

  private async preflightRenameTarget(
    from: string,
    to: string,
    allowTemplates = false
  ): Promise<EntryMove> {
    const root = this.requireRoot();
    const [source] = await this.preflightSources([from], allowTemplates);
    if (!source) throw new Error('Missing rename source');
    const target = await resolveNewEntryPath(root, to, { allowTemplates });
    if (source.relPath === target.relPath) throw new Error('Source and destination are the same');
    if (source.isDirectory && target.relPath.startsWith(`${source.relPath}/`)) {
      throw new Error('Cannot move a directory inside itself');
    }
    if (!source.isDirectory && !target.relPath.endsWith('.typ')) {
      throw new Error('Note destination must end in .typ');
    }
    if (await pathExists(target.absolutePath))
      throw new Error('Vault entry destination already exists');
    return {
      from: source.relPath,
      to: target.relPath,
      fromAbsolute: source.absolutePath,
      toAbsolute: target.absolutePath
    };
  }

  private async preflightMoveTargets(
    sourcePaths: readonly string[],
    destinationDirectory: string
  ): Promise<EntryMove[]> {
    const root = this.requireRoot();
    const sources = await this.preflightSources(sourcePaths);
    let destinationAbsolute = root.realRoot;
    let destinationRelPath = '';
    if (destinationDirectory !== '') {
      const destination = await resolveExistingEntryPath(root, destinationDirectory);
      const stats = await fs.stat(destination.absolutePath);
      if (!stats.isDirectory()) throw new Error('Move destination must be a directory');
      destinationAbsolute = destination.absolutePath;
      destinationRelPath = destination.relPath;
    }
    const moves = sources.map<EntryMove>((source) => {
      if (
        source.isDirectory &&
        (destinationRelPath === source.relPath ||
          destinationRelPath.startsWith(`${source.relPath}/`))
      ) {
        throw new Error('Cannot move a directory inside itself');
      }
      const basename = path.posix.basename(source.relPath);
      const to = destinationRelPath === '' ? basename : `${destinationRelPath}/${basename}`;
      return {
        from: source.relPath,
        to,
        fromAbsolute: source.absolutePath,
        toAbsolute: path.join(destinationAbsolute, basename)
      };
    });
    if (new Set(moves.map((move) => move.to)).size !== moves.length) {
      throw new Error('Multiple sources have the same destination');
    }
    for (const move of moves) {
      if (move.from === move.to) throw new Error('Source is already in the destination directory');
      if (await pathExists(move.toAbsolute))
        throw new Error(`Vault entry destination already exists: ${move.to}`);
    }
    return moves;
  }

  private async executeMoves(
    moves: readonly EntryMove[],
    updateReferences: boolean
  ): Promise<MoveVaultEntriesResult> {
    const root = this.requireRoot();
    const snapshot = await this.snapshot();
    const sources = new Map<string, string>();
    if (updateReferences) {
      await Promise.all(
        snapshot.notes.map(async (note) =>
          sources.set(note.relPath, await this.read({ relPath: note.relPath }))
        )
      );
    }
    const completed: EntryMove[] = [];
    const renamePath = this.options.renamePath ?? fs.rename;
    try {
      for (const move of moves) {
        await fs.mkdir(path.dirname(move.toAbsolute), { recursive: true });
        await renamePath(move.fromAbsolute, move.toAbsolute);
        completed.push(move);
      }
    } catch (error) {
      for (const move of completed.reverse()) {
        await renamePath(move.toAbsolute, move.fromAbsolute).catch(() => undefined);
      }
      throw error;
    }

    const mappings = new Map(moves.map((move) => [move.from, move.to]));
    let referencesUpdated = 0;
    const warnings: string[] = [];
    if (updateReferences) {
      for (const note of snapshot.notes) {
        const contents = sources.get(note.relPath);
        if (contents === undefined) continue;
        const nextPath = mapManagedPath(note.relPath, mappings);
        const result = rewriteTypstReferences(contents, note.relPath, nextPath, mappings);
        referencesUpdated += result.updated;
        warnings.push(...result.warnings);
        if (result.source !== contents) {
          const absolutePath = path.join(root.realRoot, ...nextPath.split('/'));
          try {
            await fs.writeFile(absolutePath, result.source, 'utf8');
          } catch (error) {
            warnings.push(
              `${nextPath}: unable to update references: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
    }
    return {
      mappings: moves.map(({ from, to }) => ({ from, to })),
      referencesUpdated,
      warnings
    };
  }

  private async countEntry(
    absolutePath: string,
    relPath: string
  ): Promise<{
    readonly counts: { notes: number; directories: number; otherFiles: number };
    readonly notes: string[];
  }> {
    const stats = await fs.lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      return { counts: { notes: 0, directories: 0, otherFiles: 1 }, notes: [] };
    }
    if (stats.isFile()) {
      return {
        counts: {
          notes: relPath.endsWith('.typ') ? 1 : 0,
          directories: 0,
          otherFiles: relPath.endsWith('.typ') ? 0 : 1
        },
        notes: relPath.endsWith('.typ') ? [relPath] : []
      };
    }
    const counts = { notes: 0, directories: 1, otherFiles: 0 };
    const notes: string[] = [];
    for (const entry of await fs.readdir(absolutePath, { withFileTypes: true })) {
      const childRelPath = `${relPath}/${entry.name}`;
      const child = await this.countEntry(path.join(absolutePath, entry.name), childRelPath);
      counts.notes += child.counts.notes;
      counts.directories += child.counts.directories;
      counts.otherFiles += child.counts.otherFiles;
      notes.push(...child.notes);
    }
    return { counts, notes };
  }

  private async findReferencesTo(
    selectedNotes: ReadonlySet<string>
  ): Promise<import('../../shared/ipc/vault').VaultReferenceImpact[]> {
    const snapshot = await this.snapshot();
    const references: import('../../shared/ipc/vault').VaultReferenceImpact[] = [];
    for (const note of snapshot.notes) {
      const contents = await this.read({ relPath: note.relPath });
      for (const ref of parseTypstReferences(contents)) {
        const resolved = resolveTypstReferencePath(ref.rawTarget, note.relPath);
        if (!resolved) continue;
        const target = selectedNotes.has(resolved)
          ? resolved
          : selectedNotes.has(`${resolved}.typ`)
            ? `${resolved}.typ`
            : undefined;
        if (target) references.push({ from: note.relPath, to: target, kind: ref.kind });
      }
    }
    return references;
  }

  private async cleanupReferences(
    deletedNotes: ReadonlySet<string>
  ): Promise<{ readonly updated: number; readonly warnings: readonly string[] }> {
    const snapshot = await this.snapshot();
    let updated = 0;
    const warnings: string[] = [];
    for (const note of snapshot.notes) {
      const source = await this.read({ relPath: note.relPath });
      const result = cleanupTypstReferences(source, note.relPath, deletedNotes);
      updated += result.updated;
      warnings.push(...result.warnings);
      if (source !== result.source) {
        const root = this.requireRoot();
        await fs.writeFile(
          path.join(root.realRoot, ...note.relPath.split('/')),
          result.source,
          'utf8'
        );
      }
    }
    return { updated, warnings };
  }

  private emit(event: VaultChange): void {
    const safeEvent = parseVaultChange(event);
    for (const listener of this.listeners) {
      listener(safeEvent);
    }
  }
}

interface ResolvedManagedEntry {
  readonly relPath: string;
  readonly absolutePath: string;
  readonly isDirectory: boolean;
}

interface EntryMove {
  readonly from: string;
  readonly to: string;
  readonly fromAbsolute: string;
  readonly toAbsolute: string;
}

const mapManagedPath = (relPath: string, mappings: ReadonlyMap<string, string>): string => {
  const direct = mappings.get(relPath);
  if (direct) return direct;
  for (const [from, to] of [...mappings].sort(([left], [right]) => right.length - left.length)) {
    if (relPath.startsWith(`${from}/`)) return `${to}${relPath.slice(from.length)}`;
  }
  return relPath;
};

const testTrashDeletesPermanently =
  process.env.FOLEA_ALLOW_TEST_VAULT_OPEN === '1' && process.env.FOLEA_TEST_TRASH_DELETE === '1';

export const vaultService = new VaultService(
  testTrashDeletesPermanently
    ? {
        trashItem: async (absolutePath) => {
          await fs.rm(absolutePath, { recursive: true });
        }
      }
    : {}
);
