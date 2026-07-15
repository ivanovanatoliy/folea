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

    this.launchEditor(absPath, sockPath, configuredCommand);
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

  private launchEditor(absPath: string, sockPath: string, configuredCommand: string): void {
    const args = buildEditorArgs(absPath, sockPath, configuredCommand);
    const child = spawn(args[0] as string, args.slice(1), {
      detached: true,
      stdio: 'ignore',
      // Never pass note paths through a shell. They are user-controlled filenames
      // and may contain shell metacharacters.
      shell: false
    });
    child.on('error', (err) => console.error('[folea] editor launch failed:', err.message));
    child.unref();
  }
}

export function buildEditorArgs(
  absPath: string,
  sockPath: string,
  configuredCommand = ''
): string[] {
  const custom = process.env.FOLEA_EDITOR_CMD || configuredCommand;
  if (custom) {
    return parseEditorCommand(custom).map((token) => {
      if (token === '%FILE%') return absPath;
      if (token === '%SOCK%') return sockPath;
      return token;
    });
  }

  return ['code', '--reuse-window', absPath];
}

/**
 * Parse an executable and argv without invoking a shell. Quotes group arguments;
 * shell substitutions and metacharacters remain ordinary argument text.
 */
export function parseEditorCommand(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: "'" | '"' | undefined;
  let tokenStarted = false;

  const finishToken = (): void => {
    if (!tokenStarted) return;
    args.push(current);
    current = '';
    tokenStarted = false;
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!;

    if (quote) {
      if (character === quote) {
        quote = undefined;
        tokenStarted = true;
      } else if (character === '\\' && quote === '"') {
        const next = command[index + 1];
        if (next === '"' || next === '\\') {
          current += next;
          index += 1;
        } else {
          current += character;
        }
      } else {
        current += character;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      tokenStarted = true;
    } else if (/\s/.test(character)) {
      finishToken();
    } else if (character === '\\') {
      const next = command[index + 1];
      if (
        next !== undefined &&
        (/\s/.test(next) || next === "'" || next === '"' || next === '\\')
      ) {
        current += next;
        tokenStarted = true;
        index += 1;
      } else {
        current += character;
        tokenStarted = true;
      }
    } else {
      current += character;
      tokenStarted = true;
    }
  }

  if (quote) {
    throw new Error('editor.command contains an unterminated quote');
  }

  finishToken();
  if (args.length === 0 || args[0] === '') {
    throw new Error('editor.command must include an executable');
  }
  return args;
}
