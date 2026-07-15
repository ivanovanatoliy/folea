import type { NoteMeta, VaultDirectory } from '../../shared/ipc/vault';

export type TreeNode =
  | {
      readonly kind: 'folder';
      readonly relPath: string;
      readonly name: string;
      readonly children: readonly TreeNode[];
    }
  | {
      readonly kind: 'note';
      readonly relPath: string;
      readonly name: string;
      readonly note: NoteMeta;
    };

export type TreeRow =
  | {
      readonly kind: 'folder';
      readonly relPath: string;
      readonly name: string;
      readonly depth: number;
      readonly expanded: boolean;
    }
  | {
      readonly kind: 'note';
      readonly relPath: string;
      readonly name: string;
      readonly depth: number;
      readonly note: NoteMeta;
    };

export interface VirtualWindow {
  readonly start: number;
  readonly end: number;
  readonly offsetTop: number;
  readonly totalHeight: number;
}

interface MutableFolder {
  readonly children: Map<string, MutableFolder | NoteMeta>;
}

export const TREE_ROW_HEIGHT = 28;
export const TREE_OVERSCAN_ROWS = 6;

export const buildTree = (
  notes: readonly NoteMeta[],
  directories: readonly VaultDirectory[] = []
): readonly TreeNode[] => {
  const root: MutableFolder = { children: new Map<string, MutableFolder | NoteMeta>() };

  for (const directory of directories) {
    let folder = root;
    for (const part of directory.relPath.split('/')) {
      const existing = folder.children.get(part);
      if (isMutableFolder(existing)) {
        folder = existing;
      } else {
        const next: MutableFolder = { children: new Map() };
        folder.children.set(part, next);
        folder = next;
      }
    }
  }

  for (const note of notes) {
    const parts = note.relPath.split('/').filter((part) => part.length > 0);
    let folder = root;

    for (const part of parts.slice(0, -1)) {
      const existing = folder.children.get(part);
      if (isMutableFolder(existing)) {
        folder = existing;
        continue;
      }

      const next: MutableFolder = { children: new Map<string, MutableFolder | NoteMeta>() };
      folder.children.set(part, next);
      folder = next;
    }

    const name = parts[parts.length - 1];
    if (name) {
      folder.children.set(name, note);
    }
  }

  return materializeChildren(root, '');
};

export const toggleTreeMark = (
  marks: ReadonlySet<string>,
  relPath: string
): ReadonlySet<string> => {
  const next = new Set(marks);
  if (next.has(relPath)) next.delete(relPath);
  else next.add(relPath);
  return next;
};

export const pruneTreeMarks = (
  marks: ReadonlySet<string>,
  rows: readonly Pick<TreeRow, 'relPath'>[]
): ReadonlySet<string> => {
  const available = new Set(rows.map((row) => row.relPath));
  return new Set([...marks].filter((mark) => available.has(mark)));
};

export const dragSources = (relPath: string, marks: ReadonlySet<string>): readonly string[] =>
  marks.has(relPath) ? [...marks] : [relPath];

export const flattenTree = (
  nodes: readonly TreeNode[],
  collapsedFolders: ReadonlySet<string>,
  depth = 0
): readonly TreeRow[] => {
  const rows: TreeRow[] = [];

  for (const node of nodes) {
    if (node.kind === 'note') {
      rows.push({
        kind: 'note',
        relPath: node.relPath,
        name: node.name,
        depth,
        note: node.note
      });
      continue;
    }

    const expanded = !collapsedFolders.has(node.relPath);
    rows.push({
      kind: 'folder',
      relPath: node.relPath,
      name: node.name,
      depth,
      expanded
    });

    if (expanded) {
      rows.push(...flattenTree(node.children, collapsedFolders, depth + 1));
    }
  }

  return rows;
};

export const clampTreeIndex = (index: number, rows: readonly TreeRow[]): number => {
  if (rows.length === 0) {
    return 0;
  }

  return Math.min(Math.max(index, 0), rows.length - 1);
};

export const getParentFolderPath = (relPath: string): string | undefined => {
  const lastSlash = relPath.lastIndexOf('/');
  return lastSlash > 0 ? relPath.slice(0, lastSlash) : undefined;
};

export const getFolderAncestors = (relPath: string): readonly string[] => {
  const parts = relPath.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
};

export const collectFolderPaths = (nodes: readonly TreeNode[]): readonly string[] => {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind !== 'folder') continue;
    paths.push(node.relPath, ...collectFolderPaths(node.children));
  }
  return paths;
};

export const calculateVirtualWindow = (
  rowCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight = TREE_ROW_HEIGHT,
  overscan = TREE_OVERSCAN_ROWS
): VirtualWindow => {
  if (rowCount <= 0 || viewportHeight <= 0) {
    return { start: 0, end: 0, offsetTop: 0, totalHeight: Math.max(0, rowCount) * rowHeight };
  }

  const firstVisible = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visibleCount = Math.ceil(viewportHeight / rowHeight);
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(rowCount, firstVisible + visibleCount + overscan);

  return {
    start,
    end,
    offsetTop: start * rowHeight,
    totalHeight: rowCount * rowHeight
  };
};

const isMutableFolder = (value: MutableFolder | NoteMeta | undefined): value is MutableFolder =>
  typeof value === 'object' && value !== null && 'children' in value;

const materializeChildren = (folder: MutableFolder, parentPath: string): readonly TreeNode[] => {
  const folders: TreeNode[] = [];
  const notes: TreeNode[] = [];

  for (const [name, entry] of folder.children) {
    if (isMutableFolder(entry)) {
      const relPath = parentPath.length === 0 ? name : `${parentPath}/${name}`;
      folders.push({
        kind: 'folder',
        relPath,
        name,
        children: materializeChildren(entry, relPath)
      });
      continue;
    }

    notes.push({
      kind: 'note',
      relPath: entry.relPath,
      name,
      note: entry
    });
  }

  const compare = (left: TreeNode, right: TreeNode): number =>
    left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });

  return [...folders.sort(compare), ...notes.sort(compare)];
};
