import type { OutlineEntry, RenderArtifact, TextLayerModel } from '../../shared/worker/typst';
import { TYPST_COMPILER_VERSION_TAG } from '../../shared/build-identity';

export const ARTIFACT_CACHE_CAPACITY = 32;
export { TYPST_COMPILER_VERSION_TAG } from '../../shared/build-identity';

export interface CachedRender {
  readonly artifact: RenderArtifact;
  readonly textLayer: TextLayerModel;
  readonly outline: readonly OutlineEntry[];
  readonly dependencies: readonly CachedDependency[];
}

export interface CachedDependency {
  readonly path: string;
  readonly contentHash: string;
}

interface CacheEntry extends CachedRender {
  readonly noteIds: Set<string>;
}

export const createCacheKey = (
  contentHash: string,
  versionTag = TYPST_COMPILER_VERSION_TAG
): string => `${contentHash}:${versionTag}`;

export const hashSource = async (source: string): Promise<string> => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA-256 is unavailable in this worker context');
  }

  const bytes = new TextEncoder().encode(source);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export class ArtifactCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly noteKeys = new Map<string, Set<string>>();

  constructor(
    private readonly capacity = ARTIFACT_CACHE_CAPACITY,
    private readonly versionTag = TYPST_COMPILER_VERSION_TAG
  ) {}

  keyForContentHash(contentHash: string): string {
    return createCacheKey(contentHash, this.versionTag);
  }

  get(noteId: string, cacheKey: string): CachedRender | undefined {
    const entry = this.entries.get(cacheKey);
    if (!entry) {
      return undefined;
    }

    this.entries.delete(cacheKey);
    this.entries.set(cacheKey, entry);
    this.linkNoteToKey(noteId, cacheKey, entry);

    return {
      artifact: entry.artifact,
      textLayer: entry.textLayer,
      outline: entry.outline,
      dependencies: entry.dependencies
    };
  }

  put(noteId: string, cacheKey: string, render: CachedRender): void {
    const existing = this.entries.get(cacheKey);

    if (existing) {
      this.entries.delete(cacheKey);
      this.entries.set(cacheKey, {
        ...render,
        noteIds: new Set([...existing.noteIds, noteId])
      });
      this.linkNoteToKey(noteId, cacheKey, this.entries.get(cacheKey)!);
      return;
    }

    const entry: CacheEntry = { ...render, noteIds: new Set([noteId]) };
    this.entries.set(cacheKey, entry);
    this.linkNoteToKey(noteId, cacheKey, entry);
    this.evictLeastRecentlyUsed();
  }

  invalidate(noteId: string): void {
    const keys = this.noteKeys.get(noteId);
    if (!keys) {
      return;
    }

    for (const key of keys) {
      const entry = this.entries.get(key);
      if (!entry) {
        continue;
      }

      entry.noteIds.delete(noteId);
      if (entry.noteIds.size === 0) {
        this.entries.delete(key);
      }
    }

    this.noteKeys.delete(noteId);
  }

  clear(): void {
    this.entries.clear();
    this.noteKeys.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  has(cacheKey: string): boolean {
    return this.entries.has(cacheKey);
  }

  private linkNoteToKey(noteId: string, cacheKey: string, entry: CacheEntry): void {
    entry.noteIds.add(noteId);

    const keys = this.noteKeys.get(noteId) ?? new Set<string>();
    keys.add(cacheKey);
    this.noteKeys.set(noteId, keys);
  }

  private evictLeastRecentlyUsed(): void {
    while (this.entries.size > this.capacity) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }

      const entry = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);

      if (!entry) {
        continue;
      }

      for (const noteId of entry.noteIds) {
        const keys = this.noteKeys.get(noteId);
        keys?.delete(oldestKey);
        if (keys?.size === 0) {
          this.noteKeys.delete(noteId);
        }
      }
    }
  }
}
