import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(process.cwd(), 'src');
const workersRoot = path.resolve(sourceRoot, 'workers');

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

describe('typst worker confinement', () => {
  it('keeps @myriaddreamin imports under src/workers only', async () => {
    const files = await collectTypeScriptFiles(sourceRoot);
    const offenders: string[] = [];

    await Promise.all(
      files.map(async (file) => {
        const source = await readFile(file, 'utf8');
        if (source.includes('@myriaddreamin/') && !file.startsWith(workersRoot + path.sep)) {
          offenders.push(path.relative(process.cwd(), file));
        }
      })
    );

    expect(offenders).toEqual([]);
  });
});
