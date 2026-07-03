import { describe, expect, it } from 'vitest';
import { mergePrefs, parsePrefsConfig, parsePrefsConfigPartial } from '../../src/shared/prefs';
import { DEFAULT_PREFS } from '../../src/shared/ipc/vault-state';

describe('parsePrefsConfig', () => {
  it('returns defaults for empty input', () => {
    expect(parsePrefsConfig('')).toEqual(DEFAULT_PREFS);
  });

  it('returns defaults for comment-only input', () => {
    expect(parsePrefsConfig('# this is a comment\n# another')).toEqual(DEFAULT_PREFS);
  });

  it('parses true values', () => {
    const result = parsePrefsConfig(
      'search.vaultCaseSensitive = true\nsearch.inFileCaseSensitive = true'
    );
    expect(result.vaultCaseSensitive).toBe(true);
    expect(result.inFileCaseSensitive).toBe(true);
  });

  it('parses false values', () => {
    const result = parsePrefsConfig(
      'search.vaultCaseSensitive = false\nsearch.inFileCaseSensitive = false'
    );
    expect(result.vaultCaseSensitive).toBe(false);
    expect(result.inFileCaseSensitive).toBe(false);
  });

  it('accepts 1 and 0 as boolean synonyms', () => {
    const result = parsePrefsConfig(
      'search.vaultCaseSensitive = 1\nsearch.inFileCaseSensitive = 0'
    );
    expect(result.vaultCaseSensitive).toBe(true);
    expect(result.inFileCaseSensitive).toBe(false);
  });

  it('ignores unknown keys and keeps defaults', () => {
    const result = parsePrefsConfig('unknown.key = true');
    expect(result.vaultCaseSensitive).toBe(DEFAULT_PREFS.vaultCaseSensitive);
    expect(result.warnings).toHaveLength(1);
  });

  it('uses default for invalid boolean values', () => {
    const result = parsePrefsConfig('search.vaultCaseSensitive = yes');
    expect(result.vaultCaseSensitive).toBe(DEFAULT_PREFS.vaultCaseSensitive);
    expect(result.warnings).toHaveLength(1);
  });

  it('ignores lines without = sign', () => {
    const result = parsePrefsConfig('search.vaultCaseSensitive');
    expect(result).toEqual(DEFAULT_PREFS);
  });

  it('trims whitespace around key and value', () => {
    const result = parsePrefsConfig('  search.vaultCaseSensitive  =  true  ');
    expect(result.vaultCaseSensitive).toBe(true);
  });

  it('parses dark theme', () => {
    expect(parsePrefsConfig('theme = dark').theme).toBe('dark');
  });

  it('parses system theme', () => {
    expect(parsePrefsConfig('theme = system').theme).toBe('system');
  });

  it('warns and defaults invalid theme to system', () => {
    const result = parsePrefsConfig('theme = neon');
    expect(result.theme).toBe('system');
    expect(result.warnings[0]).toContain('invalid theme');
  });

  it('parses editor.command as a free string', () => {
    const result = parsePrefsConfig('editor.command = kitty -e nvim %FILE%');
    expect(result.editorCommand).toBe('kitty -e nvim %FILE%');
  });

  it('merges vault prefs over global prefs key by key', () => {
    const global = parsePrefsConfigPartial(
      'theme = dark\nsearch.vaultCaseSensitive = true\neditor.command = global %FILE%'
    );
    const vault = parsePrefsConfigPartial('search.vaultCaseSensitive = false');

    expect(mergePrefs(global.prefs, vault.prefs)).toMatchObject({
      theme: 'dark',
      vaultCaseSensitive: false,
      inFileCaseSensitive: false,
      editorCommand: 'global %FILE%'
    });
  });
});
