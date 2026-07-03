import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline';

import { type IpcMainEvent, type WebContents } from 'electron';
import { rgPath } from '@vscode/ripgrep';

import {
  parseSearchDoneEvent,
  parseSearchErrorEvent,
  parseSearchHit,
  parseSearchOptions,
  parseSearchResultEvent,
  parseSearchStartInvokeRequest,
  SEARCH_DONE_CHANNEL,
  SEARCH_ERROR_CHANNEL,
  SEARCH_RESULT_CHANNEL
} from '../shared/ipc/search';
import { vaultService } from './vault/service';

const SEARCH_BATCH_SIZE = 20;
const SEARCH_MAX_HITS = 500;
const SEARCH_MAX_PREVIEW_BYTES = 256 * 1024;

interface ActiveSearch {
  readonly sender: WebContents;
  readonly child: ChildProcess;
  readonly readline: ReturnType<typeof createInterface>;
  hits: number;
  previewBytes: number;
  truncated: boolean;
  batch: ReturnType<typeof parseSearchHit>[];
  done: boolean;
}

interface OpenRootLike {
  readonly realRoot: string;
}

interface SearchServiceOptions {
  readonly rgBinaryPath?: string;
  readonly spawnProcess?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions
  ) => ChildProcess;
  readonly getOpenRoot?: () => OpenRootLike | undefined;
}

export class SearchService {
  private active: ActiveSearch | undefined;

  constructor(private readonly options: SearchServiceOptions = {}) {}

  start(event: IpcMainEvent, request: unknown): void {
    const parsed = parseSearchStartInvokeRequest(request);
    const root = (this.options.getOpenRoot ?? (() => vaultService.getOpenRoot()))();
    if (!root) {
      this.sendError(event.sender, 'No vault is open');
      return;
    }

    this.cancel();

    const opts = parseSearchOptions(parsed.options) ?? {};
    // ignoreCase defaults to true (case-insensitive by default) per M9 prefs default
    const ignoreCase = opts.ignoreCase !== false;

    const args = [
      '--json',
      '--line-number',
      '--column',
      '--color',
      'never',
      '--glob',
      '*.typ',
      ...(opts.regex === true ? [] : ['--fixed-strings']),
      ...(ignoreCase ? ['--ignore-case'] : ['--case-sensitive']),
      '--',
      parsed.query,
      '.'
    ];

    const child = (this.options.spawnProcess ?? spawn)(
      resolveAsarUnpackedExecutablePath(this.options.rgBinaryPath ?? rgPath),
      args,
      {
        cwd: root.realRoot,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    if (!child.stdout || !child.stderr) {
      child.kill();
      this.sendError(event.sender, 'ripgrep stdio was not available');
      return;
    }

    const readline = createInterface({ input: child.stdout });
    const active: ActiveSearch = {
      sender: event.sender,
      child,
      readline,
      hits: 0,
      previewBytes: 0,
      truncated: false,
      batch: [],
      done: false
    };
    this.active = active;

    readline.on('line', (line) => {
      this.handleStdoutLine(active, line);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (!this.isActive(active)) {
        return;
      }

      const message = chunk.toString('utf8').trim();
      if (message.length > 0) {
        this.sendError(active.sender, message);
      }
    });

    child.on('error', (error) => {
      if (!this.isActive(active)) {
        return;
      }

      this.sendError(active.sender, error.message);
      this.finish(active);
    });

    child.on('close', (code, signal) => {
      if (signal === 'SIGTERM') {
        return;
      }

      if (code !== 0 && code !== 1) {
        this.sendError(event.sender, `ripgrep exited with code ${code ?? 'unknown'}`);
      }

      this.finish(active);
    });
  }

  cancel(): void {
    const active = this.active;
    if (!active) {
      return;
    }

    this.active = undefined;
    active.readline.close();
    active.child.kill();
  }

  killAll(): void {
    this.cancel();
  }

  async dispose(): Promise<void> {
    this.cancel();
  }

  private handleStdoutLine(active: ActiveSearch, line: string): void {
    if (this.active !== active || active.done || line.length === 0) {
      return;
    }

    const parsed = parseRipgrepLine(line);
    if (!parsed) {
      return;
    }

    if (active.hits >= SEARCH_MAX_HITS) {
      active.truncated = true;
      this.stop(active);
      this.finish(active);
      return;
    }

    const previewBytes = Buffer.byteLength(parsed.preview, 'utf8');
    if (active.previewBytes + previewBytes > SEARCH_MAX_PREVIEW_BYTES) {
      active.truncated = true;
      this.stop(active);
      this.finish(active);
      return;
    }

    active.hits += 1;
    active.previewBytes += previewBytes;
    active.batch.push(parsed);
    if (active.batch.length >= SEARCH_BATCH_SIZE) {
      this.flush(active);
    }
  }

  private flush(active: ActiveSearch): void {
    if (this.active !== active || active.batch.length === 0) {
      return;
    }

    active.sender.send(
      SEARCH_RESULT_CHANNEL,
      parseSearchResultEvent({ hits: active.batch.splice(0, active.batch.length) })
    );
  }

  private finish(active: ActiveSearch): void {
    if (active.done) {
      return;
    }

    active.done = true;
    this.flush(active);
    active.sender.send(SEARCH_DONE_CHANNEL, parseSearchDoneEvent({ truncated: active.truncated }));
    if (this.active === active) {
      this.active = undefined;
    }
  }

  private stop(active: ActiveSearch): void {
    if (this.active === active) {
      this.active = undefined;
    }

    active.readline.close();
    active.child.kill();
  }

  private isActive(active: ActiveSearch): boolean {
    return this.active === active && !active.done;
  }

  private sendError(sender: WebContents, message: string): void {
    sender.send(SEARCH_ERROR_CHANNEL, parseSearchErrorEvent({ message }));
  }
}

export const resolveAsarUnpackedExecutablePath = (executablePath: string): string => {
  const resourcesPath = process.resourcesPath;
  if (!resourcesPath) {
    return executablePath;
  }

  const asarRoot = path.join(resourcesPath, 'app.asar');
  const relative = path.relative(asarRoot, executablePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return executablePath;
  }

  return path.join(resourcesPath, 'app.asar.unpacked', relative);
};

const parseRipgrepLine = (line: string): ReturnType<typeof parseSearchHit> | undefined => {
  let data: unknown;
  try {
    data = JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    Array.isArray(data) ||
    (data as Record<string, unknown>).type !== 'match'
  ) {
    return undefined;
  }

  const match = data as {
    readonly data?: {
      readonly path?: { readonly text?: string };
      readonly line_number?: number;
      readonly lines?: { readonly text?: string };
      readonly submatches?: readonly { readonly start?: number }[];
    };
  };

  const relPath = match.data?.path?.text;
  const lineNumber = match.data?.line_number;
  const preview = match.data?.lines?.text?.trimEnd();
  const column = (match.data?.submatches?.[0]?.start ?? 0) + 1;

  if (
    typeof relPath !== 'string' ||
    typeof lineNumber !== 'number' ||
    typeof preview !== 'string'
  ) {
    return undefined;
  }

  return parseSearchHit({
    relPath: relPath.replaceAll('\\', '/').replace(/^\.\//, ''),
    line: lineNumber,
    column,
    preview
  });
};
