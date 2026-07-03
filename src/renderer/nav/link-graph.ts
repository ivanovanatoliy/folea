import type { NoteMeta, VaultPath } from '../../shared/ipc/vault';
import { parseRefs } from './link-parser';
import type { LinkEdgeKind } from './link-parser';

export type { LinkEdgeKind };

export interface LinkEdge {
  readonly from: VaultPath;
  readonly to: VaultPath;
  readonly kind: LinkEdgeKind;
}

export interface NoteRef {
  readonly relPath: VaultPath;
  readonly title: string;
  readonly kind: LinkEdgeKind;
}

export interface LinkGraph {
  /** Notes that reference `relPath` (incoming edges). */
  backlinks(relPath: VaultPath): readonly NoteRef[];
  /** Notes that `relPath` references (outgoing edges). */
  outgoing(relPath: VaultPath): readonly NoteRef[];
}

// Collapse `.` and `..` components. Returns null if the path escapes the vault root.
function normalizePath(raw: string): string | null {
  const resolved: string[] = [];
  for (const part of raw.split('/')) {
    if (part === '' || part === '.') {
      continue;
    } else if (part === '..') {
      if (resolved.length === 0) {
        return null;
      }
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return resolved.join('/');
}

function resolveTarget(rawTarget: string, fromDir: string): string | null {
  if (rawTarget.startsWith('/')) {
    return normalizePath(rawTarget.slice(1));
  }
  const joined = fromDir.length > 0 ? `${fromDir}/${rawTarget}` : rawTarget;
  return normalizePath(joined);
}

function dirnameOf(relPath: string): string {
  const idx = relPath.lastIndexOf('/');
  return idx >= 0 ? relPath.slice(0, idx) : '';
}

/**
 * Resolve a raw `#link()` href (as written in Typst, relative to the linking note's
 * directory) to an actual vault-root-relative note path that exists in `noteSet`.
 *
 * This is the single source of truth used by the link graph, mouse-click navigation,
 * and keyboard smart-jump. It strips query/fragment, collapses `.`/`..` (rejecting
 * vault escapes), and appends `.typ` when the bare target names an existing note.
 * Returns null when the target cannot be resolved to a known note.
 */
export function resolveNoteHref(
  rawHref: string,
  fromRelPath: string,
  noteSet: ReadonlySet<string>
): string | null {
  const rawTarget = rawHref.split(/[?#]/)[0] ?? rawHref;
  if (rawTarget.length === 0) return null;

  let resolved = resolveTarget(rawTarget, dirnameOf(fromRelPath));
  if (resolved === null) return null;

  if (!resolved.endsWith('.typ') && !noteSet.has(resolved)) {
    const withExt = `${resolved}.typ`;
    if (noteSet.has(withExt)) {
      resolved = withExt;
    }
  }

  return noteSet.has(resolved) ? resolved : null;
}

function basenameOf(relPath: string): string {
  const idx = relPath.lastIndexOf('/');
  return idx >= 0 ? relPath.slice(idx + 1) : relPath;
}

/** Build the link graph from the vault snapshot + note metadata. Pure: no IPC, no FS. */
export function buildLinkGraph(
  files: ReadonlyMap<VaultPath, string>,
  notes: readonly NoteMeta[]
): LinkGraph {
  const noteSet = new Set(notes.map((n) => n.relPath));
  const titleMap = new Map(notes.map((n) => [n.relPath, n.title]));

  const edgeKeys = new Set<string>();
  const backlinksMap = new Map<VaultPath, LinkEdge[]>();
  const outgoingMap = new Map<VaultPath, LinkEdge[]>();

  for (const [relPath, source] of files) {
    for (const ref of parseRefs(source)) {
      const resolved = resolveNoteHref(ref.rawTarget, relPath, noteSet);
      if (resolved === null) continue;

      const key = `${relPath}\0${resolved}\0${ref.kind}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);

      const edge: LinkEdge = { from: relPath, to: resolved, kind: ref.kind };

      if (!backlinksMap.has(resolved)) backlinksMap.set(resolved, []);
      backlinksMap.get(resolved)!.push(edge);

      if (!outgoingMap.has(relPath)) outgoingMap.set(relPath, []);
      outgoingMap.get(relPath)!.push(edge);
    }
  }

  const toNoteRef = (relPath: VaultPath, kind: LinkEdgeKind): NoteRef => ({
    relPath,
    title: titleMap.get(relPath) ?? basenameOf(relPath),
    kind
  });

  const sortRefs = (refs: NoteRef[]): NoteRef[] =>
    refs.sort((a, b) => a.title.localeCompare(b.title) || a.relPath.localeCompare(b.relPath));

  return {
    backlinks: (relPath) =>
      sortRefs((backlinksMap.get(relPath) ?? []).map((e) => toNoteRef(e.from, e.kind))),
    outgoing: (relPath) =>
      sortRefs((outgoingMap.get(relPath) ?? []).map((e) => toNoteRef(e.to, e.kind)))
  };
}
