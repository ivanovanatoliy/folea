import type { NoteMeta, VaultPath } from '../../shared/ipc/vault';
import { resolveTypstReferencePath } from '../../shared/typst-links';
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

export interface LinkGraphIndex {
  updateSource(relPath: VaultPath, source: string): void;
  snapshot(): LinkGraph;
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
  let resolved = resolveTypstReferencePath(rawHref, fromRelPath);
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
  return createLinkGraphIndex(files, notes).snapshot();
}

export function createLinkGraphIndex(
  files: ReadonlyMap<VaultPath, string>,
  notes: readonly NoteMeta[]
): LinkGraphIndex {
  const noteSet = new Set(notes.map((n) => n.relPath));
  const titleMap = new Map(notes.map((n) => [n.relPath, n.title]));

  const backlinksMap = new Map<VaultPath, LinkEdge[]>();
  const outgoingMap = new Map<VaultPath, LinkEdge[]>();

  const edgesForSource = (relPath: VaultPath, source: string): LinkEdge[] => {
    if (!noteSet.has(relPath)) return [];
    const edgeKeys = new Set<string>();
    const edges: LinkEdge[] = [];
    for (const ref of parseRefs(source)) {
      const resolved = resolveNoteHref(ref.rawTarget, relPath, noteSet);
      if (resolved === null) continue;

      const key = `${relPath}\0${resolved}\0${ref.kind}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({ from: relPath, to: resolved, kind: ref.kind });
    }
    return edges;
  };

  const replaceEdges = (relPath: VaultPath, nextEdges: LinkEdge[]): void => {
    for (const edge of outgoingMap.get(relPath) ?? []) {
      const backlinks = backlinksMap
        .get(edge.to)
        ?.filter(
          (candidate) =>
            candidate.from !== edge.from || candidate.to !== edge.to || candidate.kind !== edge.kind
        );
      if (backlinks && backlinks.length > 0) backlinksMap.set(edge.to, backlinks);
      else backlinksMap.delete(edge.to);
    }

    if (nextEdges.length > 0) outgoingMap.set(relPath, nextEdges);
    else outgoingMap.delete(relPath);
    for (const edge of nextEdges) {
      const backlinks = backlinksMap.get(edge.to) ?? [];
      backlinks.push(edge);
      backlinksMap.set(edge.to, backlinks);
    }
  };

  for (const [relPath, source] of files) {
    replaceEdges(relPath, edgesForSource(relPath, source));
  }

  const toNoteRef = (relPath: VaultPath, kind: LinkEdgeKind): NoteRef => ({
    relPath,
    title: titleMap.get(relPath) ?? basenameOf(relPath),
    kind
  });

  const sortRefs = (refs: NoteRef[]): NoteRef[] =>
    refs.sort((a, b) => a.title.localeCompare(b.title) || a.relPath.localeCompare(b.relPath));

  const snapshot = (): LinkGraph => ({
    backlinks: (relPath) =>
      sortRefs([...(backlinksMap.get(relPath) ?? [])].map((e) => toNoteRef(e.from, e.kind))),
    outgoing: (relPath) =>
      sortRefs([...(outgoingMap.get(relPath) ?? [])].map((e) => toNoteRef(e.to, e.kind)))
  });

  return {
    updateSource(relPath, source): void {
      replaceEdges(relPath, edgesForSource(relPath, source));
    },
    snapshot
  };
}
