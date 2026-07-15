import { describe, expect, it } from 'vitest';

import {
  ArtifactCache,
  createCacheKey,
  hashSource,
  TYPST_COMPILER_VERSION_TAG,
  type CachedRender
} from '../../src/workers/typst-compile/cache';
import { TypstCompileService } from '../../src/workers/typst-compile/service';
import type {
  TypstCompileInput,
  TypstEngine,
  TypstRenderOutput
} from '../../src/workers/typst-compile/engine';

const renderFor = (
  text: string,
  dependencies: CachedRender['dependencies'] = []
): CachedRender => ({
  artifact: { svg: `<svg><text>${text}</text></svg>`, width: 100, height: 200 },
  textLayer: {
    version: 1,
    text,
    spans: [],
    pages: [{ page: 0, width: 100, height: 200 }]
  },
  outline: [],
  dependencies
});

class FakeTypstEngine implements TypstEngine {
  compileCount = 0;

  constructor(
    private readonly dependencyPaths: (input: TypstCompileInput) => readonly string[] = (input) => [
      input.mainPath
    ]
  ) {}

  async compile(input: TypstCompileInput): Promise<TypstRenderOutput> {
    this.compileCount += 1;
    return {
      type: 'rendered',
      ...renderFor(input.source, []),
      dependencies: this.dependencyPaths(input)
    };
  }
}

describe('typst artifact cache', () => {
  it('creates deterministic SHA-256 content hashes', async () => {
    await expect(hashSource('= Alpha\n')).resolves.toBe(await hashSource('= Alpha\n'));
    await expect(hashSource('= Alpha\n')).resolves.not.toBe(await hashSource('= Beta\n'));
    await expect(hashSource('= Alpha\n')).resolves.toHaveLength(64);
  });

  it('includes the compiler version tag in cache keys', () => {
    expect(createCacheKey('abc')).toBe(`abc:${TYPST_COMPILER_VERSION_TAG}`);
    expect(createCacheKey('abc', 'typst.ts@next')).not.toBe(createCacheKey('abc'));
  });

  it('evicts the least recently used artifact', () => {
    const cache = new ArtifactCache(2, 'test-version');
    const a = cache.keyForContentHash('a');
    const b = cache.keyForContentHash('b');
    const c = cache.keyForContentHash('c');

    cache.put('a.typ', a, renderFor('A'));
    cache.put('b.typ', b, renderFor('B'));
    expect(cache.get('a.typ', a)?.textLayer.text).toBe('A');
    cache.put('c.typ', c, renderFor('C'));

    expect(cache.has(a)).toBe(true);
    expect(cache.has(b)).toBe(false);
    expect(cache.has(c)).toBe(true);
    expect(cache.size).toBe(2);
  });

  it('invalidates entries by note without dropping shared content early', () => {
    const cache = new ArtifactCache(4, 'test-version');
    const key = cache.keyForContentHash('shared');

    cache.put('a.typ', key, renderFor('Shared'));
    cache.put('b.typ', key, renderFor('Shared'));

    cache.invalidate('a.typ');
    expect(cache.has(key)).toBe(true);

    cache.invalidate('b.typ');
    expect(cache.has(key)).toBe(false);
  });

  it('returns cached service results without recompiling', async () => {
    const engine = new FakeTypstEngine();
    const service = new TypstCompileService(engine, new ArtifactCache(4, 'test-version'));

    const first = await service.compile('alpha.typ', '= Alpha\n');
    const second = await service.compile('alpha.typ', '= Alpha\n');

    expect(first.type).toBe('rendered');
    expect(second.type).toBe('rendered');
    expect(first.type === 'rendered' ? first.fromCache : undefined).toBe(false);
    expect(second.type === 'rendered' ? second.fromCache : undefined).toBe(true);
    expect(engine.compileCount).toBe(1);
  });

  it('prefetch warms the cache and returns a non-painting prefetch result', async () => {
    const engine = new FakeTypstEngine();
    const service = new TypstCompileService(engine, new ArtifactCache(4, 'test-version'));

    await service.handle({
      type: 'syncSnapshot',
      version: 1,
      files: new Map([['alpha.typ', '= Alpha\n']])
    });

    await expect(
      service.handle({ type: 'prefetch', noteId: 'alpha.typ', version: 1 })
    ).resolves.toMatchObject({
      type: 'prefetched',
      noteId: 'alpha.typ',
      fromCache: false
    });
    const rendered = await service.handle({
      type: 'compile',
      noteId: 'alpha.typ',
      version: 1
    });

    expect(rendered?.type).toBe('rendered');
    expect(rendered?.type === 'rendered' ? rendered.fromCache : undefined).toBe(true);
    expect(engine.compileCount).toBe(1);
  });

  it('does not invalidate cached renders when unrelated vault files change', async () => {
    const engine = new FakeTypstEngine(() => ['alpha.typ', 'shared.typ']);
    const service = new TypstCompileService(engine, new ArtifactCache(4, 'test-version'));

    await service.compile(
      'alpha.typ',
      '= Alpha\n',
      new Map([
        ['shared.typ', '#let x = 1'],
        ['unrelated.typ', '= Unrelated v1']
      ])
    );
    const second = await service.compile(
      'alpha.typ',
      '= Alpha\n',
      new Map([
        ['shared.typ', '#let x = 1'],
        ['unrelated.typ', '= Unrelated v2']
      ])
    );

    expect(second.type === 'rendered' ? second.fromCache : undefined).toBe(true);
    expect(engine.compileCount).toBe(1);
  });

  it('invalidates cached renders when imported vault files change', async () => {
    const engine = new FakeTypstEngine(() => ['alpha.typ', 'shared.typ']);
    const service = new TypstCompileService(engine, new ArtifactCache(4, 'test-version'));

    await service.compile('alpha.typ', '= Alpha\n', new Map([['shared.typ', '#let x = 1']]));
    const second = await service.compile(
      'alpha.typ',
      '= Alpha\n',
      new Map([['shared.typ', '#let x = 2']])
    );

    expect(second.type === 'rendered' ? second.fromCache : undefined).toBe(false);
    expect(engine.compileCount).toBe(2);
  });

  it('does not serve one note’s render for another with byte-identical source', async () => {
    // Two notes share identical source but live in different folders, so each resolves its own
    // neighbouring helper. The whole-vault snapshot contains both helpers, so a content-only key
    // would let note B reuse note A's render. The key must include noteId to keep them distinct.
    class FolderAwareEngine implements TypstEngine {
      compileCount = 0;

      async compile(input: TypstCompileInput): Promise<TypstRenderOutput> {
        this.compileCount += 1;
        const directory = input.mainPath.slice(0, input.mainPath.lastIndexOf('/'));
        return {
          type: 'rendered',
          artifact: { svg: `<svg><text>${input.mainPath}</text></svg>`, width: 10, height: 10 },
          textLayer: {
            version: 1,
            text: input.mainPath,
            spans: [],
            pages: [{ page: 0, width: 10, height: 10 }]
          },
          outline: [],
          dependencies: [input.mainPath, `${directory}/helper.typ`]
        };
      }
    }

    const engine = new FolderAwareEngine();
    const service = new TypstCompileService(engine, new ArtifactCache(4, 'test-version'));
    const snapshot = new Map([
      ['a/index.typ', '= Same\n'],
      ['a/helper.typ', '#let h = "A"'],
      ['b/index.typ', '= Same\n'],
      ['b/helper.typ', '#let h = "B"']
    ]);

    const a = await service.compile('a/index.typ', '= Same\n', snapshot);
    const b = await service.compile('b/index.typ', '= Same\n', snapshot);

    expect(b.type === 'rendered' ? b.fromCache : undefined).toBe(false);
    expect(engine.compileCount).toBe(2);
    expect(a.type === 'rendered' ? a.artifact.svg : '').toContain('a/index.typ');
    expect(b.type === 'rendered' ? b.artifact.svg : '').toContain('b/index.typ');
  });

  it('keeps one source snapshot and reports only dependency-affected notes for deltas', async () => {
    class StatefulEngine extends FakeTypstEngine {
      syncedSnapshots = 0;
      appliedDeltas = 0;
      compileInputs: TypstCompileInput[] = [];

      syncSnapshot(): void {
        this.syncedSnapshots += 1;
      }

      updateFiles(): void {
        this.appliedDeltas += 1;
      }

      override async compile(input: TypstCompileInput): Promise<TypstRenderOutput> {
        this.compileInputs.push(input);
        return super.compile(input);
      }
    }

    const engine = new StatefulEngine(() => ['alpha.typ', 'shared.typ']);
    const service = new TypstCompileService(engine, new ArtifactCache(8, 'test-version'));

    await expect(
      service.handle({
        type: 'syncSnapshot',
        version: 1,
        files: new Map([
          ['alpha.typ', '= Alpha'],
          ['shared.typ', '#let value = 1'],
          ['unrelated.typ', '= Unrelated']
        ])
      })
    ).resolves.toEqual({ type: 'snapshotSynced', version: 1 });
    await service.handle({ type: 'compile', noteId: 'alpha.typ', version: 1 });

    await expect(
      service.handle({
        type: 'updateFiles',
        version: 2,
        changed: new Map([['shared.typ', '#let value = 2']]),
        deleted: []
      })
    ).resolves.toEqual({
      type: 'filesUpdated',
      version: 2,
      affectedNoteIds: ['alpha.typ', 'shared.typ']
    });
    await service.handle({ type: 'compile', noteId: 'alpha.typ', version: 2 });

    expect(engine.syncedSnapshots).toBe(1);
    expect(engine.appliedDeltas).toBe(1);
    expect(engine.compileInputs).toHaveLength(2);
    expect(engine.compileInputs.every((input) => input.sourceFiles === undefined)).toBe(true);
    expect(engine.compileCount).toBe(2);
  });

  it('imports dependency knowledge from persistent-cache warmup hits', async () => {
    const service = new TypstCompileService(new FakeTypstEngine());
    await service.handle({
      type: 'syncSnapshot',
      version: 1,
      files: new Map([
        ['alpha.typ', '= Alpha'],
        ['shared.typ', '#let value = 1']
      ])
    });
    await service.handle({
      type: 'registerDependencies',
      noteId: 'alpha.typ',
      dependencies: ['alpha.typ', 'shared.typ']
    });

    await expect(
      service.handle({
        type: 'updateFiles',
        version: 2,
        changed: new Map([['shared.typ', '#let value = 2']]),
        deleted: []
      })
    ).resolves.toMatchObject({ affectedNoteIds: ['alpha.typ', 'shared.typ'] });
  });
});
