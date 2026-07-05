import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { setScopedThemePreference } from '../../src/main/config';

const tempRoots: string[] = [];

const makeTempDir = async (prefix: string): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
};

describe('setScopedThemePreference', () => {
  afterEach(async () => {
    delete process.env.FOLEA_TEST_USER_DATA_DIR;
    delete process.env.FOLEA_ALLOW_TEST_VAULT_OPEN;

    await Promise.all(
      tempRoots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))
    );
  });

  it('writes the global prefs when no vault is open', async () => {
    const userDataRoot = await makeTempDir('folea-config-user-');
    process.env.FOLEA_TEST_USER_DATA_DIR = userDataRoot;
    process.env.FOLEA_ALLOW_TEST_VAULT_OPEN = '1';

    const prefs = await setScopedThemePreference('dark');

    await expect(fs.readFile(path.join(userDataRoot, 'prefs.config'), 'utf8')).resolves.toBe(
      'theme = dark\n'
    );
    expect(prefs.theme).toBe('dark');
  });

  it('writes the vault-local prefs when a vault is open', async () => {
    const userDataRoot = await makeTempDir('folea-config-user-');
    const vaultRoot = await makeTempDir('folea-config-vault-');
    process.env.FOLEA_TEST_USER_DATA_DIR = userDataRoot;
    process.env.FOLEA_ALLOW_TEST_VAULT_OPEN = '1';

    await fs.writeFile(path.join(userDataRoot, 'prefs.config'), 'theme = dark\n', 'utf8');
    const prefs = await setScopedThemePreference('light', vaultRoot);

    await expect(fs.readFile(path.join(vaultRoot, '.folea', 'prefs.config'), 'utf8')).resolves.toBe(
      'theme = light\n'
    );
    await expect(fs.readFile(path.join(userDataRoot, 'prefs.config'), 'utf8')).resolves.toBe(
      'theme = dark\n'
    );
    expect(prefs.theme).toBe('light');
  });
});
