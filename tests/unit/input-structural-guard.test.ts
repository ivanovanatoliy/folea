import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(process.cwd(), 'src');
const inputRoot = path.resolve(sourceRoot, 'renderer', 'input');

const collectTypeScriptFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectTypeScriptFiles(fullPath);
      }

      if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        return [fullPath];
      }

      return [];
    })
  );

  return files.flat();
};

describe('input structural guard', () => {
  it('no keydown addEventListener or onKeyDown outside src/renderer/input/', async () => {
    const allFiles = await collectTypeScriptFiles(sourceRoot);
    const outsideInput = allFiles.filter((f) => !f.startsWith(inputRoot + path.sep));
    const offenders: string[] = [];

    await Promise.all(
      outsideInput.map(async (file) => {
        const source = await readFile(file, 'utf8');
        const hasKeydown =
          source.includes("addEventListener('keydown'") ||
          source.includes('addEventListener("keydown"') ||
          source.includes('onKeyDown') ||
          source.includes('on:keydown');
        if (hasKeydown) {
          offenders.push(path.relative(process.cwd(), file));
        }
      })
    );

    expect(offenders).toEqual([]);
  });
});
