import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { normalize, join, sep } from 'node:path';

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

    this.launchEditor(absPath, configuredCommand);
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

  private launchEditor(absPath: string, configuredCommand: string): void {
    const args = buildEditorArgs(absPath, configuredCommand);
    const child = spawn(args[0] as string, args.slice(1), {
      detached: true,
      stdio: 'ignore'
    });
    child.on('error', (err) => console.error('[folea] editor launch failed:', err.message));
    child.unref();
  }
}

export function buildEditorArgs(absPath: string, configuredCommand = ''): string[] {
  const custom = process.env.FOLEA_EDITOR_CMD || configuredCommand;
  if (custom) {
    return custom
      .trim()
      .split(/\s+/)
      .map((token) => (token === '%FILE%' ? absPath : token));
  }

  switch (process.platform) {
    case 'win32':
      return ['cmd', '/c', 'start', '', absPath];
    case 'darwin':
      return ['open', absPath];
    default:
      return ['xdg-open', absPath];
  }
}
