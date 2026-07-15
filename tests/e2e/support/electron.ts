import { expect, type Page } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { spawnSync } from 'node:child_process';

let activeApplication: ElectronApplication | undefined;

export const currentEnv = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );

export const launchApp = async (
  env = currentEnv(),
  extraArgs: readonly string[] = []
): Promise<ElectronApplication> => {
  if (activeApplication) throw new Error('An Electron test application is already running');
  activeApplication = await electron.launch({
    args: [process.cwd(), ...extraArgs],
    env: { ...env, FOLEA_DISABLE_HARDWARE_ACCELERATION: '1' }
  });
  return activeApplication;
};

export const cleanupApp = async (): Promise<void> => {
  const app = activeApplication;
  activeApplication = undefined;
  if (!app) return;
  const process = app.process();
  const pid = process.pid;
  await app.evaluate(async ({ app: electronApp }) => electronApp.quit()).catch(() => undefined);
  await Promise.race([
    app.close().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000))
  ]);
  if (globalThis.process.platform === 'win32' && pid != null) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill();
    } catch {
      // The application already exited.
    }
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 500));
};

export const expectSurfaceRendered = async (page: Page, timeout = 10_000): Promise<void> => {
  await expect
    .poll(
      async () => {
        const surface = page.getByTestId('typst-surface');
        const state = await surface.getAttribute('data-state');
        if (state !== 'error') return state;
        return `error: ${await page.getByTestId('typst-render-error').textContent()}`;
      },
      { timeout }
    )
    .toBe('rendered');
};
