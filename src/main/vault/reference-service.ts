import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { VaultReferenceImpact, VaultSnapshot } from '../../shared/ipc/vault';
import {
  cleanupTypstReferences,
  parseTypstReferences,
  resolveTypstReferencePath,
  rewriteTypstReferences
} from '../../shared/typst-links';
import type { OpenVaultRoot } from './paths';
import { mapWithConcurrency, VAULT_IO_CONCURRENCY } from './concurrency';
import type { VaultIndexReader } from './index-reader';

export class VaultReferenceService {
  constructor(
    private readonly root: OpenVaultRoot,
    private readonly reader: VaultIndexReader
  ) {}

  async findReferencesTo(selectedNotes: ReadonlySet<string>): Promise<VaultReferenceImpact[]> {
    const snapshot = await this.reader.snapshot();
    const batches = await mapWithConcurrency(snapshot.notes, VAULT_IO_CONCURRENCY, async (note) => {
      const references: VaultReferenceImpact[] = [];
      const contents = await this.reader.read(note.relPath);
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
      return references;
    });
    return batches.flat();
  }

  async cleanupReferences(
    deletedNotes: ReadonlySet<string>
  ): Promise<{ readonly updated: number; readonly warnings: readonly string[] }> {
    const snapshot = await this.reader.snapshot();
    const results = await mapWithConcurrency(snapshot.notes, VAULT_IO_CONCURRENCY, async (note) => {
      const source = await this.reader.read(note.relPath);
      const result = cleanupTypstReferences(source, note.relPath, deletedNotes);
      if (source !== result.source) {
        await fs.writeFile(
          path.join(this.root.realRoot, ...note.relPath.split('/')),
          result.source,
          'utf8'
        );
      }
      return result;
    });
    return {
      updated: results.reduce((total, result) => total + result.updated, 0),
      warnings: results.flatMap((result) => result.warnings)
    };
  }

  async rewriteMovedReferences(
    snapshot: VaultSnapshot,
    sources: ReadonlyMap<string, string>,
    mappings: ReadonlyMap<string, string>
  ): Promise<{ readonly updated: number; readonly warnings: readonly string[] }> {
    const results = await mapWithConcurrency(snapshot.notes, VAULT_IO_CONCURRENCY, async (note) => {
      const source = sources.get(note.relPath);
      if (source === undefined) return { updated: 0, warnings: [] };
      const nextPath = mapManagedPath(note.relPath, mappings);
      const result = rewriteTypstReferences(source, note.relPath, nextPath, mappings);
      if (result.source === source) return result;
      try {
        await fs.writeFile(
          path.join(this.root.realRoot, ...nextPath.split('/')),
          result.source,
          'utf8'
        );
        return result;
      } catch (error) {
        return {
          updated: result.updated,
          warnings: [
            ...result.warnings,
            `${nextPath}: unable to update references: ${error instanceof Error ? error.message : String(error)}`
          ]
        };
      }
    });
    return {
      updated: results.reduce((total, result) => total + result.updated, 0),
      warnings: results.flatMap((result) => result.warnings)
    };
  }
}

const mapManagedPath = (relPath: string, mappings: ReadonlyMap<string, string>): string => {
  const direct = mappings.get(relPath);
  if (direct) return direct;
  for (const [from, to] of [...mappings].sort(([left], [right]) => right.length - left.length)) {
    if (relPath.startsWith(`${from}/`)) return `${to}${relPath.slice(from.length)}`;
  }
  return relPath;
};
