import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  atomicWriteJson,
  atomicWriteString,
  readJsonFile
} from '../../src/main/persistence/atomic-file';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('atomic persistence helpers', () => {
  it('creates parent directories and atomically replaces text', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-atomic-'));
    roots.push(root);
    const filePath = path.join(root, 'nested', 'state.json');

    await atomicWriteString(filePath, 'first');
    await atomicWriteString(filePath, 'second');

    expect(await fs.readFile(filePath, 'utf8')).toBe('second');
    expect(
      (await fs.readdir(path.dirname(filePath))).filter((name) => name.includes('.tmp-'))
    ).toEqual([]);
  });

  it('round-trips JSON without exposing parsing to state managers', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-json-'));
    roots.push(root);
    const filePath = path.join(root, 'state.json');

    await atomicWriteJson(filePath, { schemaVersion: 1, values: ['a', 'b'] });

    expect(await readJsonFile(filePath)).toEqual({ schemaVersion: 1, values: ['a', 'b'] });
  });
});
