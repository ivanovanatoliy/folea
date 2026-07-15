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
import { noteMetaFromAbsolutePath } from './metadata';
import {
  openVaultRoot,
  pathExists,
  resolveExistingNotePath,
  resolveExistingEntryPath,
  resolveNewEntryPath,
  resolveNewNotePath,
  type OpenVaultRoot
} from './paths';
import { VaultWatcher } from './watcher';
import { mapWithConcurrency, VAULT_IO_CONCURRENCY } from './concurrency';
import { VaultIndexReader, type VaultReaderOptions } from './index-reader';
import { VaultReferenceService } from './reference-service';
export { VAULT_RENDER_FILES_MAX_COUNT, VAULT_RENDER_FILES_MAX_TOTAL_BYTES } from './index-reader';

type VaultChangeListener = (event: VaultChange) => void;

export interface VaultServiceOptions extends VaultReaderOptions {
  readonly trashItem?: (absolutePath: string) => Promise<void>;
  readonly renamePath?: (from: string, to: string) => Promise<void>;
}

export class VaultService {
  private root: OpenVaultRoot | undefined;
  private reader: VaultIndexReader | undefined;
  private references: VaultReferenceService | undefined;
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
    this.reader = new VaultIndexReader(nextRoot, this.options);
    this.references = new VaultReferenceService(nextRoot, this.reader);

    const watcher = new VaultWatcher(nextRoot, (event) => this.emit(event));
    await watcher.start();
    this.watcher = watcher;

    return { rootName: nextRoot.rootName };
  }

  async close(): Promise<void> {
    await this.closeWatcher();
    this.root = undefined;
    this.reader = undefined;
    this.references = undefined;
  }

  async dispose(): Promise<void> {
    await this.close();
    this.listeners.clear();
  }

  async list(): Promise<NoteMeta[]> {
    return this.requireReader().list();
  }

  async snapshot(): Promise<VaultSnapshot> {
    return this.requireReader().snapshot();
  }

  async templates(): Promise<VaultTemplate[]> {
    return this.requireReader().templates();
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
    const allReferences = await this.requireReferences().findReferencesTo(selectedNotes);
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
      const cleanup = await this.requireReferences().cleanupReferences(deletedNotes);
      referencesUpdated = cleanup.updated;
      warnings = cleanup.warnings;
    }
    return { results, referencesUpdated, warnings };
  }

  async renderFiles(): Promise<VaultRenderFile[]> {
    return this.requireReader().renderFiles();
  }

  async read(request: ReadNoteRequest): Promise<string> {
    return this.requireReader().read(request.relPath);
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

  private requireReader(): VaultIndexReader {
    this.requireRoot();
    return this.reader!;
  }

  private requireReferences(): VaultReferenceService {
    this.requireRoot();
    return this.references!;
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
    this.requireRoot();
    const snapshot = await this.snapshot();
    const sources = new Map<string, string>();
    if (updateReferences) {
      await mapWithConcurrency(snapshot.notes, VAULT_IO_CONCURRENCY, async (note) =>
        sources.set(note.relPath, await this.read({ relPath: note.relPath }))
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
    const references = updateReferences
      ? await this.requireReferences().rewriteMovedReferences(snapshot, sources, mappings)
      : { updated: 0, warnings: [] };
    return {
      mappings: moves.map(({ from, to }) => ({ from, to })),
      referencesUpdated: references.updated,
      warnings: references.warnings
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
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    const children = await mapWithConcurrency(entries, VAULT_IO_CONCURRENCY, async (entry) => {
      const childRelPath = `${relPath}/${entry.name}`;
      return this.countEntry(path.join(absolutePath, entry.name), childRelPath);
    });
    for (const child of children) {
      counts.notes += child.counts.notes;
      counts.directories += child.counts.directories;
      counts.otherFiles += child.counts.otherFiles;
      notes.push(...child.notes);
    }
    return { counts, notes };
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
