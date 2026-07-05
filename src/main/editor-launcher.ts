import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { normalize, join, sep } from 'node:path';

type TerminalEntry = { name: string; argBuilder: (nvimArgs: string[]) => string[] };

// Ordered by popularity on modern Linux distros. Each entry specifies how to
// pass a command + args to that particular terminal.
const LINUX_TERMINAL_CANDIDATES: TerminalEntry[] = [
  { name: 'kitty', argBuilder: (a) => a },
  { name: 'alacritty', argBuilder: (a) => ['-e', ...a] },
  { name: 'wezterm', argBuilder: (a) => ['start', '--', ...a] },
  { name: 'foot', argBuilder: (a) => a },
  { name: 'ghostty', argBuilder: (a) => ['-e', ...a] },
  { name: 'xterm', argBuilder: (a) => ['-e', ...a] },
  { name: 'konsole', argBuilder: (a) => ['-e', ...a] },
  { name: 'gnome-terminal', argBuilder: (a) => ['--', ...a] },
  { name: 'xfce4-terminal', argBuilder: (a) => ['-e', ...a] },
  { name: 'x-terminal-emulator', argBuilder: (a) => ['-e', ...a] }
];

function findLinuxTerminal(): TerminalEntry {
  const envTerm = process.env.TERMINAL;
  if (envTerm) {
    return { name: envTerm, argBuilder: (a) => ['-e', ...a] };
  }

  const pathDirs = (process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin').split(':');
  for (const entry of LINUX_TERMINAL_CANDIDATES) {
    if (pathDirs.some((dir) => existsSync(join(dir, entry.name)))) {
      return entry;
    }
  }

  throw new Error(
    'No terminal emulator found. Install one of: kitty, alacritty, wezterm, foot, xterm. ' +
      'Or set FOLEA_EDITOR_CMD to a custom launch command.'
  );
}

// Injected into every nvim session opened by folea so saves happen automatically:
// InsertLeave  — on Escape (exit insert mode)
// TextChanged  — on normal-mode mutations (dd, cc, …)
const NVIM_AUTO_SAVE_CMD = 'au InsertLeave,TextChanged,TextChangedI <buffer> silent! w';

// Stable socket path scoped to a vault root so multiple folea instances
// with different vaults each have their own nvim server.
export function nvimSockPath(vaultRoot: string): string {
  const hash = createHash('sha1').update(vaultRoot).digest('hex').slice(0, 8);
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\folea-nvim-${hash}`;
  }
  return join(tmpdir(), `folea-nvim-${hash}.sock`);
}

export class EditorLauncher {
  open(vaultRoot: string, relPath: string, configuredCommand = ''): void {
    const absPath = this.validatePath(vaultRoot, relPath);
    const sockPath = nvimSockPath(vaultRoot);

    if (process.platform !== 'win32' && this.tryRemote(sockPath, absPath)) {
      return;
    }

    this.launchTerminal(sockPath, absPath, configuredCommand);
  }

  dispose(): void {}

  private validatePath(vaultRoot: string, relPath: string): string {
    const normalizedRoot = normalize(vaultRoot);
    const abs = normalize(join(vaultRoot, relPath));
    if (!abs.startsWith(normalizedRoot + sep) && abs !== normalizedRoot) {
      throw new Error('editor.open: path escapes vault root');
    }
    return abs;
  }

  // Try to send the file to an already-running nvim via its socket.
  // Returns true if the remote command succeeded.
  private tryRemote(sockPath: string, absPath: string): boolean {
    if (!existsSync(sockPath)) return false;

    const result = spawnSync('nvim', ['--server', sockPath, '--remote', absPath], {
      stdio: 'ignore',
      timeout: 1000
    });

    if (result.error || result.status !== 0) {
      // Socket file is stale — clean up so next open spawns a fresh instance.
      try {
        unlinkSync(sockPath);
      } catch {
        /* ignore */
      }
      return false;
    }

    return true;
  }

  private launchTerminal(sockPath: string, absPath: string, configuredCommand: string): void {
    const args = buildTerminalArgs(sockPath, absPath, configuredCommand);
    const child = spawn(args[0] as string, args.slice(1), {
      detached: true,
      stdio: 'ignore'
    });
    child.on('error', (err) => console.error('[folea] editor launch failed:', err.message));
    child.unref();
  }
}

export function buildTerminalArgs(
  sockPath: string,
  absPath: string,
  configuredCommand = ''
): string[] {
  const custom = process.env.FOLEA_EDITOR_CMD || configuredCommand;
  if (custom) {
    return custom
      .trim()
      .split(/\s+/)
      .map((token) => (token === '%FILE%' ? absPath : token));
  }

  switch (process.platform) {
    case 'win32':
      return ['wt', '--', 'nvim', '--listen', sockPath, '-c', NVIM_AUTO_SAVE_CMD, absPath];
    case 'darwin': {
      // Two-layer escaping:
      //   1. Shell (single-quote context): ' → '\''  so a ' in the path cannot break quoting
      //   2. AppleScript string:           \ → \\  and  " → \"  so the outer "…" is intact
      const shellSQ = (s: string): string => s.replace(/'/g, "'\\''");
      const asStr = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const sFile = asStr(shellSQ(absPath));
      const sSock = asStr(shellSQ(sockPath));
      return [
        'osascript',
        '-e',
        `tell application "Terminal" to do script "nvim --listen '${sSock}' -c '${NVIM_AUTO_SAVE_CMD}' '${sFile}'"`
      ];
    }
    default: {
      const nvimArgs = ['nvim', '--listen', sockPath, '-c', NVIM_AUTO_SAVE_CMD, absPath];
      const terminal = findLinuxTerminal();
      return [terminal.name, ...terminal.argBuilder(nvimArgs)];
    }
  }
}
