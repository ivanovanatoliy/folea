import type { FoleaPrefs } from './ipc/vault-state';
import { DEFAULT_PREFS } from './ipc/vault-state';

export type ThemePreference = FoleaPrefs['theme'];

export interface PartialPrefs {
  readonly vaultCaseSensitive?: boolean;
  readonly inFileCaseSensitive?: boolean;
  readonly theme?: ThemePreference;
  readonly editorCommand?: string;
}

export interface ParsedPrefsConfig {
  readonly prefs: PartialPrefs;
  readonly warnings: readonly string[];
}

const KNOWN_KEYS = new Set([
  'search.vaultCaseSensitive',
  'search.inFileCaseSensitive',
  'theme',
  'editor.command'
]);

const warn = (warnings: string[], message: string): void => {
  warnings.push(message);
  console.warn(message);
};

const parseBoolean = (
  raw: string,
  key: string,
  warnings: string[]
): boolean | undefined => {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'true' || trimmed === '1') {
    return true;
  }

  if (trimmed === 'false' || trimmed === '0') {
    return false;
  }

  warn(warnings, `prefs.config: invalid boolean for key "${key}": "${raw}", using default`);
  return undefined;
};

const parseTheme = (raw: string, warnings: string[]): ThemePreference | undefined => {
  const value = raw.trim().toLowerCase();
  if (value === 'system' || value === 'light' || value === 'dark') {
    return value;
  }

  warn(warnings, `prefs.config: invalid theme "${raw}", using default`);
  return undefined;
};

export const parsePrefsConfigPartial = (content: string): ParsedPrefsConfig => {
  const prefs: PartialPrefs = {};
  const warnings: string[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex < 0) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    const rawValue = line.slice(eqIndex + 1).trim();

    if (!KNOWN_KEYS.has(key)) {
      warn(warnings, `prefs.config: unknown key "${key}", ignored`);
      continue;
    }

    if (key === 'search.vaultCaseSensitive') {
      const value = parseBoolean(rawValue, key, warnings);
      if (value !== undefined) {
        Object.assign(prefs, { vaultCaseSensitive: value });
      }
    } else if (key === 'search.inFileCaseSensitive') {
      const value = parseBoolean(rawValue, key, warnings);
      if (value !== undefined) {
        Object.assign(prefs, { inFileCaseSensitive: value });
      }
    } else if (key === 'theme') {
      const value = parseTheme(rawValue, warnings);
      if (value !== undefined) {
        Object.assign(prefs, { theme: value });
      }
    } else if (key === 'editor.command') {
      Object.assign(prefs, { editorCommand: rawValue });
    }
  }

  return { prefs, warnings };
};

export const mergePrefs = (
  globalPrefs: PartialPrefs,
  vaultPrefs: PartialPrefs = {},
  warnings: readonly string[] = []
): FoleaPrefs => ({
  vaultCaseSensitive:
    vaultPrefs.vaultCaseSensitive ??
    globalPrefs.vaultCaseSensitive ??
    DEFAULT_PREFS.vaultCaseSensitive,
  inFileCaseSensitive:
    vaultPrefs.inFileCaseSensitive ??
    globalPrefs.inFileCaseSensitive ??
    DEFAULT_PREFS.inFileCaseSensitive,
  theme: vaultPrefs.theme ?? globalPrefs.theme ?? DEFAULT_PREFS.theme,
  editorCommand:
    vaultPrefs.editorCommand ??
    globalPrefs.editorCommand ??
    DEFAULT_PREFS.editorCommand,
  warnings
});

export const parsePrefsConfig = (content: string): FoleaPrefs => {
  const parsed = parsePrefsConfigPartial(content);
  return mergePrefs(parsed.prefs, {}, parsed.warnings);
};
