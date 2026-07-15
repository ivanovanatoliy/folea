import { describe, expect, it } from 'vitest';

import {
  buildTree,
  calculateVirtualWindow,
  collectFolderPaths,
  flattenTree,
  getFolderAncestors,
  pruneTreeMarks,
  toggleTreeMark
} from '../../src/renderer/app/tree-model';
import type { NoteMeta } from '../../src/shared/ipc/vault';

const note = (relPath: string): NoteMeta => {
  const basename = relPath.split('/').at(-1)!;
  return {
    id: relPath,
    relPath,
    basename,
    title: basename.slice(0, -'.typ'.length),
    byteSize: 1,
    mtimeMs: 1
  };
};

describe('tree model', () => {
  it('builds a deterministic folder-first tree from relPaths', () => {
    const tree = buildTree([
      note('zeta.typ'),
      note('projects/beta.typ'),
      note('alpha.typ'),
      note('projects/alpha.typ'),
      note('archive/old.typ')
    ]);

    expect(tree.map((node) => `${node.kind}:${node.relPath}`)).toEqual([
      'folder:archive',
      'folder:projects',
      'note:alpha.typ',
      'note:zeta.typ'
    ]);

    const projects = tree.find((node) => node.kind === 'folder' && node.relPath === 'projects');
    if (projects?.kind !== 'folder') {
      throw new Error('projects folder missing');
    }
    expect(projects.children.map((node) => node.relPath)).toEqual([
      'projects/alpha.typ',
      'projects/beta.typ'
    ]);
  });

  it('flattens visible rows and respects collapsed folders', () => {
    const tree = buildTree([
      note('root.typ'),
      note('projects/alpha.typ'),
      note('projects/nested/beta.typ')
    ]);

    expect(
      flattenTree(tree, new Set()).map((row) => `${row.kind}:${row.relPath}:${row.depth}`)
    ).toEqual([
      'folder:projects:0',
      'folder:projects/nested:1',
      'note:projects/nested/beta.typ:2',
      'note:projects/alpha.typ:1',
      'note:root.typ:0'
    ]);

    expect(
      flattenTree(tree, new Set(['projects'])).map((row) => `${row.kind}:${row.relPath}`)
    ).toEqual(['folder:projects', 'note:root.typ']);
  });

  it('keeps empty directories from the vault snapshot', () => {
    const tree = buildTree(
      [],
      [
        { relPath: 'empty', name: 'empty' },
        { relPath: 'parent/child', name: 'child' },
        { relPath: 'parent', name: 'parent' }
      ]
    );
    expect(flattenTree(tree, new Set()).map((row) => row.relPath)).toEqual([
      'empty',
      'parent',
      'parent/child'
    ]);
  });

  it('collects every folder and resolves the ancestors of a note', () => {
    const tree = buildTree([note('projects/nested/beta.typ'), note('archive/old.typ')]);

    expect(collectFolderPaths(tree)).toEqual(['archive', 'projects', 'projects/nested']);
    expect(getFolderAncestors('projects/nested/beta.typ')).toEqual(['projects', 'projects/nested']);
  });

  it('bounds the virtual row window independent of total row count', () => {
    const window = calculateVirtualWindow(10_000, 5_000, 280, 28, 6);

    expect(window.start).toBeGreaterThan(0);
    expect(window.end - window.start).toBeLessThanOrEqual(22);
    expect(window.totalHeight).toBe(280_000);
  });

  it('toggles and prunes persistent marks', () => {
    const marks = toggleTreeMark(new Set(), 'a.typ');
    expect([...marks]).toEqual(['a.typ']);
    expect([...toggleTreeMark(marks, 'a.typ')]).toEqual([]);
    expect([...pruneTreeMarks(new Set(['a.typ', 'missing.typ']), [{ relPath: 'a.typ' }])]).toEqual([
      'a.typ'
    ]);
  });
});
