import { afterEach, describe, expect, it } from 'vitest';

import { buildEditorArgs, EditorLauncher, nvimSockPath } from '../../src/main/editor-launcher';

const SOCK = '/tmp/folea-nvim-test.sock';

describe('nvimSockPath', () => {
  it('returns a string', () => {
    expect(typeof nvimSockPath('/home/user/vault')).toBe('string');
  });

  it('different vaults produce different paths', () => {
    expect(nvimSockPath('/vault/a')).not.toBe(nvimSockPath('/vault/b'));
  });

  it('same vault always produces the same path', () => {
    expect(nvimSockPath('/vault')).toBe(nvimSockPath('/vault'));
  });
});

describe('buildEditorArgs', () => {
  afterEach(() => {
    delete process.env.FOLEA_EDITOR_CMD;
  });

  it('uses FOLEA_EDITOR_CMD when set, replacing %FILE% token', () => {
    process.env.FOLEA_EDITOR_CMD = 'kitty -e nvim %FILE%';
    expect(buildEditorArgs('/vault/note.typ', SOCK)).toEqual([
      'kitty',
      '-e',
      'nvim',
      '/vault/note.typ'
    ]);
  });

  it('FOLEA_EDITOR_CMD without %FILE% passes no file path', () => {
    process.env.FOLEA_EDITOR_CMD = 'kitty -e nvim';
    expect(buildEditorArgs('/vault/note.typ', SOCK)).toEqual(['kitty', '-e', 'nvim']);
  });

  it('FOLEA_EDITOR_CMD with multiple %FILE% tokens replaces all', () => {
    process.env.FOLEA_EDITOR_CMD = 'wrapper %FILE% %FILE%';
    expect(buildEditorArgs('/a/b.typ', SOCK)).toEqual(['wrapper', '/a/b.typ', '/a/b.typ']);
  });

  it('replaces %SOCK% token with the socket path', () => {
    process.env.FOLEA_EDITOR_CMD = 'kitty -e nvim --listen %SOCK% %FILE%';
    expect(buildEditorArgs('/vault/note.typ', SOCK)).toEqual([
      'kitty',
      '-e',
      'nvim',
      '--listen',
      SOCK,
      '/vault/note.typ'
    ]);
  });

  it('returns an argument array, not a shell string', () => {
    process.env.FOLEA_EDITOR_CMD = 'kitty -e nvim %FILE%';
    const args = buildEditorArgs('/path/with spaces/note.typ', SOCK);
    expect(Array.isArray(args)).toBe(true);
    expect(args.length).toBeGreaterThan(0);
    expect(args.every((a) => typeof a === 'string')).toBe(true);
  });

  it('uses configured editor.command when env override is absent', () => {
    expect(buildEditorArgs('/vault/note.typ', SOCK, 'alacritty -e nvim %FILE%')).toEqual([
      'alacritty',
      '-e',
      'nvim',
      '/vault/note.typ'
    ]);
  });

  it('FOLEA_EDITOR_CMD overrides configured editor.command', () => {
    process.env.FOLEA_EDITOR_CMD = 'kitty -e nvim %FILE%';
    expect(buildEditorArgs('/vault/note.typ', SOCK, 'alacritty -e nvim %FILE%')).toEqual([
      'kitty',
      '-e',
      'nvim',
      '/vault/note.typ'
    ]);
  });

  it('default: opens file in VS Code', () => {
    expect(buildEditorArgs('/vault/note.typ', SOCK)).toEqual([
      'code',
      '--reuse-window',
      '/vault/note.typ'
    ]);
  });
});

describe('EditorLauncher.open path validation', () => {
  it('rejects path traversal', () => {
    const launcher = new EditorLauncher();
    expect(() => launcher.open('/vault', '../secret')).toThrow('path escapes vault root');
  });

  it('accepts a simple relative path without throwing', () => {
    const launcher = new EditorLauncher();
    expect(() => launcher.open('/tmp', 'note.typ')).not.toThrow();
    launcher.dispose();
  });
});

describe('EditorLauncher.dispose', () => {
  it('is a no-op', () => {
    const launcher = new EditorLauncher();
    expect(() => launcher.dispose()).not.toThrow();
  });
});
