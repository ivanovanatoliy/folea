import { afterEach, describe, expect, it } from 'vitest';

import { buildTerminalArgs, EditorLauncher, nvimSockPath } from '../../src/main/editor-launcher';

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

describe('buildTerminalArgs', () => {
  afterEach(() => {
    delete process.env.FOLEA_EDITOR_CMD;
    delete process.env.TERMINAL;
  });

  it('uses FOLEA_EDITOR_CMD when set, replacing %FILE% token', () => {
    process.env.FOLEA_EDITOR_CMD = 'kitty -e nvim %FILE%';
    expect(buildTerminalArgs(SOCK, '/vault/note.typ')).toEqual([
      'kitty',
      '-e',
      'nvim',
      '/vault/note.typ'
    ]);
  });

  it('FOLEA_EDITOR_CMD without %FILE% passes no file path', () => {
    process.env.FOLEA_EDITOR_CMD = 'kitty -e nvim';
    expect(buildTerminalArgs(SOCK, '/vault/note.typ')).toEqual(['kitty', '-e', 'nvim']);
  });

  it('FOLEA_EDITOR_CMD with multiple %FILE% tokens replaces all', () => {
    process.env.FOLEA_EDITOR_CMD = 'wrapper %FILE% %FILE%';
    expect(buildTerminalArgs(SOCK, '/a/b.typ')).toEqual(['wrapper', '/a/b.typ', '/a/b.typ']);
  });

  it('returns an argument array, not a shell string', () => {
    process.env.FOLEA_EDITOR_CMD = 'kitty -e nvim %FILE%';
    const args = buildTerminalArgs(SOCK, '/path/with spaces/note.typ');
    expect(Array.isArray(args)).toBe(true);
    expect(args.length).toBeGreaterThan(0);
    expect(args.every((a) => typeof a === 'string')).toBe(true);
  });

  it('uses configured editor.command when env override is absent', () => {
    expect(buildTerminalArgs(SOCK, '/vault/note.typ', 'alacritty -e nvim %FILE%')).toEqual([
      'alacritty',
      '-e',
      'nvim',
      '/vault/note.typ'
    ]);
  });

  it('FOLEA_EDITOR_CMD overrides configured editor.command', () => {
    process.env.FOLEA_EDITOR_CMD = 'kitty -e nvim %FILE%';
    expect(buildTerminalArgs(SOCK, '/vault/note.typ', 'alacritty -e nvim %FILE%')).toEqual([
      'kitty',
      '-e',
      'nvim',
      '/vault/note.typ'
    ]);
  });

  it('win32 default: includes wt, nvim, --listen, socket, file', () => {
    const orig = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      const args = buildTerminalArgs(SOCK, 'C:\\vault\\note.typ');
      expect(args[0]).toBe('wt');
      expect(args).toContain('nvim');
      expect(args).toContain('--listen');
      expect(args).toContain(SOCK);
      expect(args).toContain('C:\\vault\\note.typ');
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    }
  });

  it('darwin default: osascript with --listen and auto-save cmd', () => {
    const orig = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    try {
      const args = buildTerminalArgs(SOCK, '/vault/note.typ');
      expect(args[0]).toBe('osascript');
      const script = args.join(' ');
      expect(script).toContain('nvim');
      expect(script).toContain('--listen');
      expect(script).toContain('InsertLeave');
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    }
  });

  it('linux with $TERMINAL: uses that terminal, includes --listen', () => {
    const orig = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    process.env.TERMINAL = 'kitty';
    try {
      const args = buildTerminalArgs(SOCK, '/note.typ');
      expect(args[0]).toBe('kitty');
      expect(args).toContain('nvim');
      expect(args).toContain('--listen');
      expect(args).toContain(SOCK);
      expect(args).toContain('/note.typ');
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
      delete process.env.TERMINAL;
    }
  });

  it('linux without $TERMINAL: falls back to x-terminal-emulator', () => {
    const orig = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    delete process.env.TERMINAL;
    try {
      const args = buildTerminalArgs(SOCK, '/note.typ');
      expect(args[0]).toBe('x-terminal-emulator');
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    }
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
