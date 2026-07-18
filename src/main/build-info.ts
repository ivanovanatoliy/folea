import { readFileSync } from 'node:fs';
import path from 'node:path';

export const readBuildInfo = (resourcesPath: string): string =>
  readFileSync(path.join(resourcesPath, 'build-info'), 'utf8');
