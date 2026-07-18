import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';

import {
  buildEditorArgs,
  EditorLauncher,
  getEditorSpawnEnvironment,
  nvimSockPath,
  parseEditorCommand
} from '../../src/main/editor-launcher';

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return {
    ...original,
    spawn: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() }))
  };
});

const SOCK = '/tmp/folea-nvim-test.sock';

describe('getEditorSpawnEnvironment', () => {
  it('uses the login-shell PATH on macOS', () => {
    const environment = { PATH: '/usr/bin', SHELL: '/bin/zsh' };
    const readPath = vi.fn(() => '/custom/bin:/usr/bin');

    const result = getEditorSpawnEnvironment('darwin', environment, readPath);

    expect(readPath).toHaveBeenCalledWith('/bin/zsh', environment);
    expect(result.PATH).toBe('/custom/bin:/usr/bin');
  });

  it('does not inspect a login shell outside macOS', () => {
    const environment = { PATH: '/custom/bin' };
    const readPath = vi.fn();

    expect(getEditorSpawnEnvironment('linux', environment, readPath)).toBe(environment);
    expect(readPath).not.toHaveBeenCalled();
  });
});

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

  it('preserves quoted arguments without passing them to a shell', () => {
    expect(
      buildEditorArgs('/vault/path with spaces/note.typ', SOCK, 'editor --label "My Notes" %FILE%')
    ).toEqual(['editor', '--label', 'My Notes', '/vault/path with spaces/note.typ']);
  });

  it.each([';', '$()', '&', '|', '`touch owned`', '%COMSPEC%', '^&'])(
    'keeps shell metacharacters in the file path as one argv value: %s',
    (metacharacter) => {
      const path = `/vault/note ${metacharacter}.typ`;
      expect(buildEditorArgs(path, SOCK, 'editor %FILE%')).toEqual(['editor', path]);
    }
  );

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

describe('parseEditorCommand', () => {
  it('supports quoted and escaped argv', () => {
    expect(parseEditorCommand(`editor 'single value' "double value" escaped\\ value`)).toEqual([
      'editor',
      'single value',
      'double value',
      'escaped value'
    ]);
  });

  it('rejects empty and unterminated commands', () => {
    expect(() => parseEditorCommand('   ')).toThrow('must include an executable');
    expect(() => parseEditorCommand(`editor 'unfinished`)).toThrow('unterminated quote');
  });
});

describe('EditorLauncher.open path validation', () => {
  it('rejects path traversal', () => {
    const launcher = new EditorLauncher();
    expect(() => launcher.open('/vault', '../secret')).toThrow('path escapes vault root');
  });

  it('accepts a simple relative path without throwing', () => {
    const launcher = new EditorLauncher({ PATH: process.env.PATH });
    expect(() => launcher.open('/tmp', 'note.typ')).not.toThrow();
    launcher.dispose();
  });

  it('launches with shell disabled and preserves a metacharacter path as one argument', () => {
    const spawnEnvironment = { PATH: '/resolved/login/path' };
    const launcher = new EditorLauncher(spawnEnvironment);
    launcher.open('/tmp', 'note;touch owned.typ', 'editor %FILE%');

    expect(vi.mocked(spawn)).toHaveBeenLastCalledWith(
      'editor',
      ['/tmp/note;touch owned.typ'],
      expect.objectContaining({ env: spawnEnvironment, shell: false })
    );
  });
});

describe('EditorLauncher.dispose', () => {
  it('is a no-op', () => {
    const launcher = new EditorLauncher();
    expect(() => launcher.dispose()).not.toThrow();
  });
});
