import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import {
  SEARCH_DONE_CHANNEL,
  SEARCH_ERROR_CHANNEL,
  SEARCH_RESULT_CHANNEL,
  SEARCH_START_CHANNEL
} from '../../src/shared/ipc/search';
import { resolveAsarUnpackedExecutablePath, SearchService } from '../../src/main/search-service';

const createEvent = () => {
  const send = vi.fn();
  return { sender: { send } } as const;
};

const createChild = () => {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const child = {
    stdout,
    stderr,
    kill: vi.fn(() => {
      emit('close', 0, 'SIGTERM');
      return true;
    }),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return child;
    })
  };

  const emit = (event: string, ...args: unknown[]) => {
    for (const listener of listeners.get(event) ?? []) {
      listener(...args);
    }
  };

  return { child, stdout, stderr, emit };
};

describe('search service', () => {
  it('rewrites packaged asar executable paths to app.asar.unpacked', () => {
    const originalResourcesPath = process.resourcesPath;
    Object.assign(process, { resourcesPath: '/opt/folea/resources' });

    try {
      expect(
        resolveAsarUnpackedExecutablePath(
          '/opt/folea/resources/app.asar/node_modules/@vscode/ripgrep-linux-x64/bin/rg'
        )
      ).toBe(
        '/opt/folea/resources/app.asar.unpacked/node_modules/@vscode/ripgrep-linux-x64/bin/rg'
      );
      expect(resolveAsarUnpackedExecutablePath('/usr/bin/rg')).toBe('/usr/bin/rg');
    } finally {
      Object.assign(process, { resourcesPath: originalResourcesPath });
    }
  });

  it('spawns ripgrep with an argument array and streams parsed hits', async () => {
    const event = createEvent();
    const spawned = createChild();
    const spawnProcess = vi.fn(() => spawned.child as never);
    const service = new SearchService({
      rgBinaryPath: '/vendored/rg',
      spawnProcess,
      getOpenRoot: () => ({ realRoot: '/vault' })
    });

    service.start(event as never, { type: SEARCH_START_CHANNEL, query: 'Alpha' });
    spawned.stdout.write(
      `${JSON.stringify({
        type: 'match',
        data: {
          path: { text: './notes/alpha.typ' },
          line_number: 3,
          lines: { text: 'Alpha preview\n' },
          submatches: [{ start: 6 }]
        }
      })}\n`
    );
    spawned.emit('close', 0, null);

    expect(spawnProcess).toHaveBeenCalledWith(
      '/vendored/rg',
      expect.arrayContaining([
        '--json',
        '--line-number',
        '--column',
        '--fixed-strings',
        '--',
        'Alpha',
        '.'
      ]),
      expect.objectContaining({ cwd: '/vault' })
    );
    expect(event.sender.send).toHaveBeenCalledWith(
      SEARCH_RESULT_CHANNEL,
      expect.objectContaining({
        hits: [{ relPath: 'notes/alpha.typ', line: 3, column: 7, preview: 'Alpha preview' }]
      })
    );
    expect(event.sender.send).toHaveBeenCalledWith(
      SEARCH_DONE_CHANNEL,
      expect.objectContaining({ truncated: false })
    );
  });

  it('kills the previous child on a new query', () => {
    const first = createChild();
    const second = createChild();
    const spawnProcess = vi
      .fn()
      .mockReturnValueOnce(first.child as never)
      .mockReturnValueOnce(second.child as never);
    const service = new SearchService({
      rgBinaryPath: '/vendored/rg',
      spawnProcess,
      getOpenRoot: () => ({ realRoot: '/vault' })
    });

    service.start(createEvent() as never, { type: SEARCH_START_CHANNEL, query: 'alpha' });
    service.start(createEvent() as never, { type: SEARCH_START_CHANNEL, query: 'beta' });

    expect(first.child.kill).toHaveBeenCalledOnce();
    expect(spawnProcess).toHaveBeenCalledTimes(2);
  });

  it('ignores malformed ripgrep json instead of throwing in the main process', () => {
    const event = createEvent();
    const spawned = createChild();
    const service = new SearchService({
      rgBinaryPath: '/vendored/rg',
      spawnProcess: vi.fn(() => spawned.child as never),
      getOpenRoot: () => ({ realRoot: '/vault' })
    });

    service.start(event as never, { type: SEARCH_START_CHANNEL, query: 'alpha' });

    expect(() => {
      spawned.stdout.write('not-json\n');
      spawned.emit('close', 0, null);
    }).not.toThrow();

    expect(event.sender.send).toHaveBeenCalledWith(
      SEARCH_DONE_CHANNEL,
      expect.objectContaining({ truncated: false })
    );
    expect(event.sender.send).not.toHaveBeenCalledWith(SEARCH_RESULT_CHANNEL, expect.anything());
  });

  it('does not forward stderr from a cancelled search into the next UI state', () => {
    const event = createEvent();
    const spawned = createChild();
    const service = new SearchService({
      rgBinaryPath: '/vendored/rg',
      spawnProcess: vi.fn(() => spawned.child as never),
      getOpenRoot: () => ({ realRoot: '/vault' })
    });

    service.start(event as never, { type: SEARCH_START_CHANNEL, query: 'alpha' });
    service.cancel();
    spawned.stderr.write('stale error\n');

    expect(event.sender.send).not.toHaveBeenCalledWith(
      SEARCH_ERROR_CHANNEL,
      expect.objectContaining({ message: 'stale error' })
    );
  });
});
