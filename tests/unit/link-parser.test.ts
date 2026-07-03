import { describe, expect, it } from 'vitest';

import { parseRefs } from '../../src/renderer/nav/link-parser';

describe('parseRefs — #link', () => {
  it('extracts a simple #link string-literal target', () => {
    const refs = parseRefs('#link("notes/b.typ")');
    expect(refs).toEqual([{ rawTarget: 'notes/b.typ', kind: 'link' }]);
  });

  it('extracts #link with optional body', () => {
    const refs = parseRefs('#link("a.typ")[see here]');
    expect(refs).toEqual([{ rawTarget: 'a.typ', kind: 'link' }]);
  });

  it('extracts #link with whitespace inside call', () => {
    const refs = parseRefs('#link( "a.typ" )');
    expect(refs).toEqual([{ rawTarget: 'a.typ', kind: 'link' }]);
  });

  it('skips http:// and https:// link targets', () => {
    const refs = parseRefs('#link("https://example.com") #link("http://example.com")');
    expect(refs).toHaveLength(0);
  });

  it('skips #-anchor link targets', () => {
    const refs = parseRefs('#link("#section")');
    expect(refs).toHaveLength(0);
  });

  it('skips #link(<label>) — non-string first arg', () => {
    const refs = parseRefs('#link(<intro>)[Jump to intro]');
    expect(refs).toHaveLength(0);
  });

  it('skips #link(variable) — non-string arg', () => {
    const refs = parseRefs('#link(url)');
    expect(refs).toHaveLength(0);
  });

  it('extracts relative path targets', () => {
    const refs = parseRefs('#link("../sibling/note.typ")');
    expect(refs).toEqual([{ rawTarget: '../sibling/note.typ', kind: 'link' }]);
  });

  it('extracts multiple links', () => {
    const refs = parseRefs('#link("a.typ") some text #link("b.typ")');
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ rawTarget: 'a.typ', kind: 'link' });
    expect(refs[1]).toMatchObject({ rawTarget: 'b.typ', kind: 'link' });
  });
});

describe('parseRefs — #import', () => {
  it('extracts a bare #import', () => {
    const refs = parseRefs('#import "template.typ"');
    expect(refs).toEqual([{ rawTarget: 'template.typ', kind: 'import' }]);
  });

  it('extracts #import with selective binding', () => {
    const refs = parseRefs('#import "template.typ": foo, bar');
    expect(refs).toEqual([{ rawTarget: 'template.typ', kind: 'import' }]);
  });

  it('extracts #import with alias', () => {
    const refs = parseRefs('#import "template.typ" as T');
    expect(refs).toEqual([{ rawTarget: 'template.typ', kind: 'import' }]);
  });

  it('skips @namespace/name package imports', () => {
    const refs = parseRefs('#import "@preview/polylux:0.3.1"');
    expect(refs).toHaveLength(0);
  });

  it('skips @-prefixed targets generally', () => {
    const refs = parseRefs('#import "@local/foo:1.0.0": *');
    expect(refs).toHaveLength(0);
  });
});

describe('parseRefs — #include', () => {
  it('extracts #include targets', () => {
    const refs = parseRefs('#include "sections/intro.typ"');
    expect(refs).toEqual([{ rawTarget: 'sections/intro.typ', kind: 'include' }]);
  });
});

describe('parseRefs — comment stripping', () => {
  it('ignores targets inside line comments', () => {
    const refs = parseRefs('// #link("commented.typ")\n#link("real.typ")');
    expect(refs).toEqual([{ rawTarget: 'real.typ', kind: 'link' }]);
  });

  it('ignores targets inside block comments', () => {
    const refs = parseRefs('/* #link("in-block.typ") */ #link("real.typ")');
    expect(refs).toEqual([{ rawTarget: 'real.typ', kind: 'link' }]);
  });

  it('ignores multiline block comments', () => {
    const refs = parseRefs('/*\n#import "hidden.typ"\n*/\n#import "visible.typ"');
    expect(refs).toEqual([{ rawTarget: 'visible.typ', kind: 'import' }]);
  });
});

describe('parseRefs — mixed content', () => {
  it('extracts all three kinds from a realistic source', () => {
    const source = [
      '#import "template.typ": setup',
      '#include "header.typ"',
      '= My Note',
      'See #link("other.typ")[this note].'
    ].join('\n');

    const refs = parseRefs(source);
    expect(refs).toHaveLength(3);
    expect(refs.find((r) => r.kind === 'import')).toMatchObject({
      rawTarget: 'template.typ',
      kind: 'import'
    });
    expect(refs.find((r) => r.kind === 'include')).toMatchObject({
      rawTarget: 'header.typ',
      kind: 'include'
    });
    expect(refs.find((r) => r.kind === 'link')).toMatchObject({
      rawTarget: 'other.typ',
      kind: 'link'
    });
  });

  it('returns empty array for source with no refs', () => {
    expect(parseRefs('= Hello\n\nJust text.')).toEqual([]);
  });
});
