import { afterEach, describe, expect, it, vi } from 'vitest';

import { installBoundedShutdown } from '../../src/main/shutdown';

interface QuitEvent {
  preventDefault(): void;
}

type BeforeQuitListener = (event: QuitEvent) => void;
type WillQuitListener = () => void;

class FakeApp {
  beforeQuit: BeforeQuitListener | undefined;
  willQuit: WillQuitListener | undefined;
  readonly quit = vi.fn();
  readonly exit = vi.fn();

  on(event: 'before-quit', listener: BeforeQuitListener): void;
  on(event: 'will-quit', listener: WillQuitListener): void;
  on(event: 'before-quit' | 'will-quit', listener: BeforeQuitListener | WillQuitListener): void {
    if (event === 'before-quit') {
      this.beforeQuit = listener as BeforeQuitListener;
      return;
    }

    this.willQuit = listener as WillQuitListener;
  }
}

describe('bounded shutdown', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not block quit when resource close never settles', async () => {
    vi.useFakeTimers();
    const app = new FakeApp();
    const preventDefault = vi.fn();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    installBoundedShutdown(app, () => new Promise<void>(() => {}), {
      closeTimeoutMs: 10,
      forceExitTimeoutMs: 30
    });

    app.beforeQuit?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(app.quit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10);
    expect(app.quit).toHaveBeenCalledOnce();
    expect(exitSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(20);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('clears the force-exit backstop once Electron reaches will-quit', async () => {
    vi.useFakeTimers();
    const app = new FakeApp();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    installBoundedShutdown(app, () => Promise.resolve(), {
      closeTimeoutMs: 10,
      forceExitTimeoutMs: 30
    });

    app.beforeQuit?.({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    app.willQuit?.();
    await vi.advanceTimersByTimeAsync(30);

    expect(app.quit).toHaveBeenCalledOnce();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
