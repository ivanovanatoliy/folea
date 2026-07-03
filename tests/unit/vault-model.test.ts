import { describe, expect, it } from 'vitest';

import { VaultIndex } from '../../src/renderer/vault';
import type { NoteMeta } from '../../src/shared/ipc/vault';

const note = (relPath: string, byteSize = 1): NoteMeta => {
  const basename = relPath.split('/').at(-1)!;
  return {
    id: relPath,
    relPath,
    basename,
    title: basename.slice(0, -'.typ'.length),
    byteSize,
    mtimeMs: byteSize
  };
};

describe('VaultIndex', () => {
  it('rebuilds deterministic state from note lists', () => {
    const index = new VaultIndex();

    expect(index.rebuild([note('b.typ'), note('a.typ')]).map((item) => item.relPath)).toEqual([
      'a.typ',
      'b.typ'
    ]);
    expect(index.rebuild([note('b.typ')]).map((item) => item.relPath)).toEqual(['b.typ']);
    expect(index.getByRelPath('b.typ')).toEqual(note('b.typ'));
    expect(index.getById('b.typ')).toEqual(note('b.typ'));
    expect(index.getById('a.typ')).toBeUndefined();
  });

  it('applies created, changed, renamed, and deleted events', () => {
    const index = new VaultIndex();
    index.rebuild([note('a.typ')]);

    expect(
      index.applyChange({ kind: 'created', note: note('b.typ') }).map((item) => item.relPath)
    ).toEqual(['a.typ', 'b.typ']);
    expect(index.applyChange({ kind: 'changed', note: note('b.typ', 10) })).toContainEqual(
      note('b.typ', 10)
    );
    expect(
      index.applyChange({
        kind: 'renamed',
        oldRelPath: 'b.typ',
        newRelPath: 'nested/c.typ',
        note: note('nested/c.typ')
      })
    ).toEqual([note('a.typ'), note('nested/c.typ')]);
    expect(index.getById('b.typ')).toBeUndefined();
    expect(index.getById('nested/c.typ')).toEqual(note('nested/c.typ'));
    expect(index.applyChange({ kind: 'deleted', relPath: 'a.typ' })).toEqual([
      note('nested/c.typ')
    ]);
    expect(index.getById('a.typ')).toBeUndefined();
  });
});
