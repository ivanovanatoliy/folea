import { describe, expect, it } from 'vitest';

import {
  cleanupTypstReferences,
  parseTypstReferences,
  rewriteTypstReferences
} from '../../src/shared/typst-links';
import { buildLinkGraph } from '../../src/renderer/nav/link-graph';

describe('managed Typst references', () => {
  it('returns exact ranges and ignores comments and strings containing fake markup', () => {
    const source =
      '// #link("ignored.typ")\n#link("real.typ")[Real]\n#let x = "#include \\"fake.typ\\""';
    expect(parseTypstReferences(source).map((ref) => [ref.kind, ref.rawTarget])).toEqual([
      ['link', 'real.typ']
    ]);
  });

  it('preserves extension style and query/fragment while rewriting', () => {
    const result = rewriteTypstReferences(
      '#link("../old/note?q=1#part")[N]',
      'pages/index.typ',
      'archive/pages/index.typ',
      new Map([['old/note.typ', 'new/note.typ']])
    );
    expect(result.source).toBe('#link("../../new/note?q=1#part")[N]');
  });

  it('rewrites only relative template imports when creating a note elsewhere', () => {
    const result = rewriteTypstReferences(
      '#import "helpers.typ": helper\n#include "sections/body.typ"\n#link("related.typ")[Related]',
      '_templates/daily.typ',
      'journal/2026-07-15.typ',
      new Map(),
      new Set(['import', 'include'])
    );
    expect(result.source).toBe(
      '#import "../_templates/helpers.typ": helper\n#include "../_templates/sections/body.typ"\n#link("related.typ")[Related]'
    );
  });

  it('preserves import style and suffixes while rebasing from a template directory', () => {
    const result = rewriteTypstReferences(
      [
        '#import "./helper": helper',
        '#import "../shared.typ": shared',
        '#import "/absolute.typ": absolute',
        '#import "@preview/example:1.0.0": package',
        '#include "sections/body.typ?mode=compact#intro"'
      ].join('\n'),
      '_templates/daily.typ',
      'journal/2026/note.typ',
      new Map(),
      new Set(['import', 'include'])
    );

    expect(result.source).toBe(
      [
        '#import "../../_templates/helper": helper',
        '#import "../../shared.typ": shared',
        '#import "/absolute.typ": absolute',
        '#import "@preview/example:1.0.0": package',
        '#include "../../_templates/sections/body.typ?mode=compact#intro"'
      ].join('\n')
    );
  });

  it('preserves the Obsidian template import placeholder', () => {
    expect(parseTypstReferences('#import "__TEMPLATE_IMPORT__": helper')).toEqual([]);
  });

  it('keeps link bodies, removes safe statements, and warns for ambiguous imports', () => {
    const source =
      '#link("gone.typ")[Visible]\n#include "gone.typ"\n#import "gone.typ": item + other\n';
    const result = cleanupTypstReferences(source, 'current.typ', new Set(['gone.typ']));
    expect(result.source).toContain('Visible\n');
    expect(result.source).not.toContain('#include');
    expect(result.source).toContain('#import');
    expect(result.warnings).toHaveLength(1);
  });

  it('does not create navigation backlinks from render-only templates', () => {
    const notes = [
      {
        id: 'note.typ',
        relPath: 'note.typ',
        basename: 'note.typ',
        title: 'note',
        byteSize: 1,
        mtimeMs: 1
      }
    ];
    const graph = buildLinkGraph(
      new Map([
        ['note.typ', '= Note'],
        ['_templates/daily.typ', '#link("../note.typ")']
      ]),
      notes
    );
    expect(graph.backlinks('note.typ')).toEqual([]);
  });
});
