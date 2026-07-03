import {
  parseNoteMeta,
  parseNoteMetaList,
  parseVaultChange,
  type NoteMeta,
  type VaultChange,
  type VaultPath
} from '../../shared/ipc/vault';

export class VaultIndex {
  private readonly notesByRelPath = new Map<VaultPath, NoteMeta>();
  private readonly notesById = new Map<string, NoteMeta>();

  rebuild(notes: readonly NoteMeta[]): NoteMeta[] {
    this.notesByRelPath.clear();
    this.notesById.clear();
    for (const note of parseNoteMetaList([...notes])) {
      this.upsert(note);
    }

    return this.all();
  }

  applyChange(change: VaultChange): NoteMeta[] {
    const safeChange = parseVaultChange(change);

    switch (safeChange.kind) {
      case 'created':
      case 'changed':
        this.upsert(safeChange.note);
        break;

      case 'renamed':
        this.removeByRelPath(safeChange.oldRelPath);
        this.upsert(safeChange.note);
        break;

      case 'deleted':
        this.removeByRelPath(safeChange.relPath);
        break;
    }

    return this.all();
  }

  all(): NoteMeta[] {
    return [...this.notesByRelPath.values()].sort((left, right) =>
      left.relPath.localeCompare(right.relPath)
    );
  }

  getByRelPath(relPath: VaultPath): NoteMeta | undefined {
    return this.notesByRelPath.get(relPath);
  }

  getById(id: string): NoteMeta | undefined {
    return this.notesById.get(id);
  }

  private upsert(note: NoteMeta): void {
    const safeNote = parseNoteMeta(note);
    this.removeByRelPath(safeNote.relPath);
    this.notesByRelPath.set(safeNote.relPath, safeNote);
    this.notesById.set(safeNote.id, safeNote);
  }

  private removeByRelPath(relPath: VaultPath): void {
    const existing = this.notesByRelPath.get(relPath);
    if (existing) {
      this.notesById.delete(existing.id);
    }

    this.notesByRelPath.delete(relPath);
  }
}
