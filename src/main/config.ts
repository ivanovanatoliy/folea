import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { FoleaPrefs } from '../shared/ipc/vault-state';
import type { FoleaThemePreference } from '../shared/ipc/vault-state';
import { mergePrefs, parsePrefsConfigPartial, type ParsedPrefsConfig } from '../shared/prefs';

const PREFS_FILE = 'prefs.config';
const KEYS_FILE = 'keys.config';
const FOLEA_DIR = '.folea';

const readOptionalText = async (
  filePath: string,
  label: string
): Promise<{ readonly content: string; readonly warnings: readonly string[] } | null> => {
  try {
    return { content: await fs.readFile(filePath, 'utf8'), warnings: [] };
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { readonly code?: unknown }).code
        : undefined;
    if (code === 'ENOENT') {
      return null;
    }

    return {
      content: '',
      warnings: [`${label}: unable to read config file, using defaults`]
    };
  }
};

export const getGlobalConfigDir = (): string => {
  const testDir = process.env.FOLEA_TEST_USER_DATA_DIR;
  if (testDir && process.env.FOLEA_ALLOW_TEST_VAULT_OPEN === '1') {
    return testDir;
  }

  return app.getPath('userData');
};

const parseOptionalPrefs = async (filePath: string, label: string): Promise<ParsedPrefsConfig> => {
  const loaded = await readOptionalText(filePath, label);
  if (!loaded) {
    return { prefs: {}, warnings: [] };
  }

  const parsed = parsePrefsConfigPartial(loaded.content);
  return { prefs: parsed.prefs, warnings: [...loaded.warnings, ...parsed.warnings] };
};

export const loadResolvedPrefs = async (vaultRoot?: string): Promise<FoleaPrefs> => {
  const global = await parseOptionalPrefs(
    path.join(getGlobalConfigDir(), PREFS_FILE),
    'prefs.config'
  );
  const vault = vaultRoot
    ? await parseOptionalPrefs(path.join(vaultRoot, FOLEA_DIR, PREFS_FILE), 'prefs.config')
    : { prefs: {}, warnings: [] };

  return mergePrefs(global.prefs, vault.prefs, [...global.warnings, ...vault.warnings]);
};

export const loadKeysConfigContent = async (): Promise<{
  readonly content: string;
  readonly warnings: readonly string[];
}> => {
  const loaded = await readOptionalText(path.join(getGlobalConfigDir(), KEYS_FILE), 'keys.config');
  return loaded ?? { content: '', warnings: [] };
};

const setThemePreference = async (
  prefsPath: string,
  theme: FoleaThemePreference
): Promise<void> => {
  let content = '';

  try {
    content = await fs.readFile(prefsPath, 'utf8');
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { readonly code?: unknown }).code
        : undefined;
    if (code !== 'ENOENT') {
      throw error;
    }
  }

  const lines = content.length > 0 ? content.split('\n') : [];
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (/^\s*theme\s*=/.test(line)) {
      replaced = true;
      return `theme = ${theme}`;
    }

    return line;
  });

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') {
      nextLines.push('');
    }
    nextLines.push(`theme = ${theme}`);
  }

  await fs.mkdir(path.dirname(prefsPath), { recursive: true });
  await fs.writeFile(prefsPath, `${nextLines.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
};

export const setScopedThemePreference = async (
  theme: FoleaThemePreference,
  vaultRoot?: string
): Promise<FoleaPrefs> => {
  const prefsPath = vaultRoot
    ? path.join(vaultRoot, FOLEA_DIR, PREFS_FILE)
    : path.join(getGlobalConfigDir(), PREFS_FILE);
  await setThemePreference(prefsPath, theme);
  return loadResolvedPrefs(vaultRoot);
};
