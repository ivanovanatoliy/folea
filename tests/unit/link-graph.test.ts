import { describe, expect, it } from 'vitest';

import { buildLinkGraph, createLinkGraphIndex } from '../../src/renderer/nav/link-graph';
import type { NoteMeta, VaultPath } from '../../src/shared/ipc/vault';

const meta = (relPath: VaultPath, title?: string): NoteMeta => ({
  id: relPath,
  relPath,
  basename: relPath.split('/').at(-1) ?? relPath,
  title: title ?? relPath,
  byteSize: 0,
  mtimeMs: 0
});

describe('buildLinkGraph — basic resolution', () => {
  it('resolves a simple same-directory #link', () => {
    const files = new Map([
      ['a.typ', '#link("b.typ")'],
      ['b.typ', '= B']
    ]);
    const notes = [meta('a.typ', 'Note A'), meta('b.typ', 'Note B')];
    const graph = buildLinkGraph(files, notes);

    expect(graph.outgoing('a.typ')).toEqual([{ relPath: 'b.typ', title: 'Note B', kind: 'link' }]);
    expect(graph.backlinks('b.typ')).toEqual([{ relPath: 'a.typ', title: 'Note A', kind: 'link' }]);
  });

  it('resolves a target with a query and fragment', () => {
    const files = new Map([
      ['a.typ', '#link("b.typ?query=1#fragment")'],
      ['b.typ', '= B']
    ]);
    const graph = buildLinkGraph(files, [meta('a.typ'), meta('b.typ', 'B')]);

    expect(graph.outgoing('a.typ')).toEqual([{ relPath: 'b.typ', title: 'B', kind: 'link' }]);
  });

  it('resolves a relative ../path target', () => {
    const files = new Map([
      ['sub/a.typ', '#link("../root.typ")'],
      ['root.typ', '= Root']
    ]);
    const notes = [meta('sub/a.typ'), meta('root.typ', 'Root')];
    const graph = buildLinkGraph(files, notes);

    expect(graph.outgoing('sub/a.typ')).toEqual([
      { relPath: 'root.typ', title: 'Root', kind: 'link' }
    ]);
    expect(graph.backlinks('root.typ')).toHaveLength(1);
  });

  it('resolves ./path targets', () => {
    const files = new Map([
      ['notes/a.typ', '#link("./b.typ")'],
      ['notes/b.typ', '= B']
    ]);
    const notes = [meta('notes/a.typ'), meta('notes/b.typ', 'B')];
    const graph = buildLinkGraph(files, notes);

    expect(graph.outgoing('notes/a.typ')).toEqual([
      { relPath: 'notes/b.typ', title: 'B', kind: 'link' }
    ]);
  });

  it('resolves extension-less targets by appending .typ', () => {
    const files = new Map([
      ['a.typ', '#link("b")'],
      ['b.typ', '= B']
    ]);
    const notes = [meta('a.typ'), meta('b.typ', 'B')];
    const graph = buildLinkGraph(files, notes);

    expect(graph.outgoing('a.typ')).toEqual([{ relPath: 'b.typ', title: 'B', kind: 'link' }]);
  });

  it('resolves extension-less relative targets', () => {
    const files = new Map([
      ['sub/a.typ', '#link("../root")'],
      ['root.typ', '= Root']
    ]);
    const notes = [meta('sub/a.typ'), meta('root.typ', 'Root')];
    const graph = buildLinkGraph(files, notes);

    expect(graph.outgoing('sub/a.typ')).toHaveLength(1);
    expect(graph.outgoing('sub/a.typ')[0]).toMatchObject({ relPath: 'root.typ' });
  });
});

describe('buildLinkGraph — #import and #include', () => {
  it('creates import edges', () => {
    const files = new Map([
      ['note.typ', '#import "shared.typ": foo'],
      ['shared.typ', '#let foo = "bar"']
    ]);
    const notes = [meta('note.typ'), meta('shared.typ', 'Shared')];
    const graph = buildLinkGraph(files, notes);

    expect(graph.outgoing('note.typ')).toEqual([
      { relPath: 'shared.typ', title: 'Shared', kind: 'import' }
    ]);
    expect(graph.backlinks('shared.typ')).toHaveLength(1);
  });

  it('creates include edges', () => {
    const files = new Map([
      ['main.typ', '#include "section.typ"'],
      ['section.typ', '= Section']
    ]);
    const notes = [meta('main.typ'), meta('section.typ')];
    const graph = buildLinkGraph(files, notes);

    expect(graph.outgoing('main.typ')[0]).toMatchObject({ kind: 'include' });
  });
});

describe('buildLinkGraph — filtering', () => {
  it('drops targets that escape the vault root', () => {
    const files = new Map([['a.typ', '#link("../../outside.typ")']]);
    const notes = [meta('a.typ')];
    const graph = buildLinkGraph(files, notes);

    expect(graph.outgoing('a.typ')).toHaveLength(0);
  });

  it('drops targets not in the note set', () => {
    const files = new Map([['a.typ', '#link("ghost.typ")']]);
    const notes = [meta('a.typ')];
    const graph = buildLinkGraph(files, notes);

    expect(graph.outgoing('a.typ')).toHaveLength(0);
  });

  it('drops http:// and https:// targets', () => {
    const files = new Map([['a.typ', '#link("https://example.com")']]);
    const notes = [meta('a.typ')];
    const graph = buildLinkGraph(files, notes);

    expect(graph.outgoing('a.typ')).toHaveLength(0);
  });

  it('drops @namespace/name package imports', () => {
    const files = new Map([
      ['a.typ', '#import "@preview/polylux:0.3.1"'],
      ['polylux.typ', '']
    ]);
    const notes = [meta('a.typ')];
    const graph = buildLinkGraph(files, notes);

    expect(graph.outgoing('a.typ')).toHaveLength(0);
  });
});

describe('buildLinkGraph — deduplication', () => {
  it('de-duplicates identical (from, to, kind) triples', () => {
    const files = new Map([
      ['a.typ', '#link("b.typ")\n#link("b.typ")'],
      ['b.typ', '= B']
    ]);
    const notes = [meta('a.typ'), meta('b.typ')];
    const graph = buildLinkGraph(files, notes);

    expect(graph.outgoing('a.typ')).toHaveLength(1);
    expect(graph.backlinks('b.typ')).toHaveLength(1);
  });

  it('keeps different kinds as separate edges', () => {
    const files = new Map([
      ['a.typ', '#import "b.typ"\n#include "b.typ"'],
      ['b.typ', '']
    ]);
    const notes = [meta('a.typ'), meta('b.typ')];
    const graph = buildLinkGraph(files, notes);

    expect(graph.outgoing('a.typ')).toHaveLength(2);
  });
});

describe('buildLinkGraph — sorting', () => {
  it('sorts backlinks and outgoing by title then relPath', () => {
    const files = new Map([
      ['z.typ', '#link("a.typ")\n#link("b.typ")'],
      ['a.typ', ''],
      ['b.typ', '']
    ]);
    const notes = [meta('z.typ', 'Z'), meta('a.typ', 'Bravo'), meta('b.typ', 'Alpha')];
    const graph = buildLinkGraph(files, notes);

    const og = graph.outgoing('z.typ');
    expect(og[0]?.title).toBe('Alpha');
    expect(og[1]?.title).toBe('Bravo');
  });
});

describe('buildLinkGraph — title fallback', () => {
  it('falls back to basename when title matches relPath (i.e. raw path)', () => {
    const files = new Map([
      ['a.typ', '#link("b.typ")'],
      ['b.typ', '']
    ]);
    // meta() uses relPath as title when no title given — basename is relPath for root files
    const notes = [meta('a.typ'), meta('b.typ')];
    const graph = buildLinkGraph(files, notes);

    const ref = graph.outgoing('a.typ')[0];
    expect(ref?.title).toBe('b.typ');
  });
});

describe('buildLinkGraph — rebuild reflects changes', () => {
  it('updates one note without reparsing unchanged note sources', () => {
    const files = new Map([
      ['a.typ', '#link("b.typ")'],
      ['b.typ', '#link("c.typ")'],
      ['c.typ', '']
    ]);
    const index = createLinkGraphIndex(files, [meta('a.typ'), meta('b.typ'), meta('c.typ')]);

    index.updateSource('a.typ', '#link("c.typ")');
    const graph = index.snapshot();

    expect(graph.outgoing('a.typ').map((ref) => ref.relPath)).toEqual(['c.typ']);
    expect(graph.backlinks('b.typ')).toEqual([]);
    expect(graph.backlinks('c.typ').map((ref) => ref.relPath)).toEqual(['a.typ', 'b.typ']);
  });

  it('updated file set is reflected when rebuilding', () => {
    const notesArr = [meta('a.typ'), meta('b.typ'), meta('c.typ')];

    const files1 = new Map([
      ['a.typ', '#link("b.typ")'],
      ['b.typ', ''],
      ['c.typ', '']
    ]);
    const graph1 = buildLinkGraph(files1, notesArr);
    expect(graph1.outgoing('a.typ')).toHaveLength(1);

    const files2 = new Map([
      ['a.typ', '#link("b.typ")\n#link("c.typ")'],
      ['b.typ', ''],
      ['c.typ', '']
    ]);
    const graph2 = buildLinkGraph(files2, notesArr);
    expect(graph2.outgoing('a.typ')).toHaveLength(2);
  });

  it('removed note drops its edges on rebuild', () => {
    const files = new Map([
      ['a.typ', '#link("b.typ")'],
      ['b.typ', '']
    ]);

    const graph1 = buildLinkGraph(files, [meta('a.typ'), meta('b.typ')]);
    expect(graph1.backlinks('b.typ')).toHaveLength(1);

    const filesWithout = new Map([['a.typ', '#link("b.typ")']]);
    const graph2 = buildLinkGraph(filesWithout, [meta('a.typ')]);
    expect(graph2.backlinks('b.typ')).toHaveLength(0);
    expect(graph2.outgoing('a.typ')).toHaveLength(0);
  });
});

describe('buildLinkGraph — empty graph', () => {
  it('returns empty arrays for unknown relPaths', () => {
    const graph = buildLinkGraph(new Map(), []);
    expect(graph.backlinks('nonexistent.typ')).toEqual([]);
    expect(graph.outgoing('nonexistent.typ')).toEqual([]);
  });
});
