import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { NoteMeta, VaultPath } from '../../shared/ipc/vault';
import type { OpenVaultRoot } from './paths';
import { relPathFromAbsolute } from './paths';

export const noteMetaFromAbsolutePath = async (
  root: OpenVaultRoot,
  absolutePath: string,
  relPathOverride?: VaultPath
): Promise<NoteMeta> => {
  const relPath = relPathOverride ?? relPathFromAbsolute(root, absolutePath);
  const stats = await fs.stat(absolutePath);
  const basename = path.posix.basename(relPath);
  const extension = path.posix.extname(basename);
  const title = extension.length > 0 ? basename.slice(0, -extension.length) : basename;

  return {
    id: relPath,
    relPath,
    basename,
    title,
    byteSize: stats.size,
    mtimeMs: stats.mtimeMs
  };
};
