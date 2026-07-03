export const VAULT_CLOSE_TIMEOUT_MS = 2_000;
export const FORCE_EXIT_TIMEOUT_MS = 5_000;

interface QuitEvent {
  preventDefault(): void;
}

interface ShutdownApp {
  on(event: 'before-quit', listener: (event: QuitEvent) => void): void;
  on(event: 'will-quit', listener: () => void): void;
  quit(): void;
  exit(code?: number): void;
}

interface ShutdownTimers {
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

interface ShutdownOptions {
  readonly closeTimeoutMs?: number;
  readonly forceExitTimeoutMs?: number;
  readonly timers?: ShutdownTimers;
}

const defaultTimers: ShutdownTimers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (timer) => clearTimeout(timer)
};

const closeWithTimeout = async (
  close: () => Promise<void>,
  timeoutMs: number,
  timers: ShutdownTimers
): Promise<'closed' | 'timed-out'> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<'timed-out'>((resolve) => {
    timeout = timers.setTimeout(() => resolve('timed-out'), timeoutMs);
  });

  try {
    return await Promise.race([close().then((): 'closed' => 'closed'), timeoutPromise]);
  } finally {
    if (timeout) {
      timers.clearTimeout(timeout);
    }
  }
};

export const installBoundedShutdown = (
  app: ShutdownApp,
  close: () => Promise<void>,
  options: ShutdownOptions = {}
): void => {
  const closeTimeoutMs = options.closeTimeoutMs ?? VAULT_CLOSE_TIMEOUT_MS;
  const forceExitTimeoutMs = options.forceExitTimeoutMs ?? FORCE_EXIT_TIMEOUT_MS;
  const timers = options.timers ?? defaultTimers;
  let shutdownComplete = false;
  let shutdownInProgress = false;
  let forceExitTimer: ReturnType<typeof setTimeout> | undefined;

  app.on('before-quit', (event) => {
    if (shutdownComplete) {
      return;
    }

    event.preventDefault();
    if (shutdownInProgress) {
      return;
    }

    shutdownInProgress = true;
    forceExitTimer = timers.setTimeout(() => {
      process.exit(0);
    }, forceExitTimeoutMs);

    void closeWithTimeout(close, closeTimeoutMs, timers)
      .catch((error: unknown) => {
        console.error('Failed to close vault watcher during shutdown', error);
      })
      .then((result) => {
        if (result === 'timed-out') {
          console.warn(`Vault watcher close timed out after ${closeTimeoutMs}ms; quitting anyway`);
        }
      })
      .finally(() => {
        shutdownComplete = true;
        app.quit();
      });
  });

  app.on('will-quit', () => {
    if (forceExitTimer) {
      timers.clearTimeout(forceExitTimer);
      forceExitTimer = undefined;
    }

    setTimeout(() => {
      process.exit(0);
    }, 500);
  });
};
