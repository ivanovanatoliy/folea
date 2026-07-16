import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

if (process.platform !== 'win32') {
  throw new Error('The installed Windows smoke test must run on Windows.');
}

if (process.env.CI !== 'true') {
  throw new Error('The installed Windows smoke test may only run in CI.');
}

const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) {
  throw new Error('LOCALAPPDATA is not defined.');
}

const installDir = path.join(localAppData, 'Programs', 'folea');
const appExecutable = path.join(installDir, 'folea.exe');
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-installed-smoke-'));

const exists = async (filePath) =>
  fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);

const waitFor = async (description, condition, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${description}.`);
};

const run = (executable, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`${path.basename(executable)} exited with code ${code} and signal ${signal}.`)
      );
    });
  });

const findInstaller = async () => {
  const entries = await fs.readdir(path.resolve('dist'), { withFileTypes: true });
  const installers = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
    .map((entry) => path.resolve('dist', entry.name));
  if (installers.length !== 1) {
    throw new Error(`Expected one Windows installer in dist, found ${installers.length}.`);
  }
  return installers[0];
};

let application;
let installAttempted = false;

try {
  if (await exists(installDir)) {
    throw new Error(`Refusing to replace an existing installation at ${installDir}.`);
  }

  const installer = await findInstaller();
  installAttempted = true;
  await run(installer, ['/S']);
  await waitFor('the installed executable', () => exists(appExecutable));

  application = await electron.launch({
    executablePath: appExecutable,
    args: [`--user-data-dir=${userDataDir}`],
    env: { ...process.env, FOLEA_DISABLE_HARDWARE_ACCELERATION: '1' }
  });
  const page = await application.firstWindow({ timeout: 20_000 });
  await page.getByTestId('folea-shell').waitFor({ state: 'visible', timeout: 20_000 });
  console.log(
    `Launched installed application version ${await page.evaluate(() => window.folea.app.version())}.`
  );
} finally {
  if (application) {
    await application
      .evaluate(async ({ app }) => {
        app.quit();
      })
      .catch(() => undefined);
    await application.close().catch(() => undefined);
  }

  if (installAttempted && (await exists(installDir))) {
    const entries = await fs.readdir(installDir).catch(() => []);
    const uninstallers = entries.filter(
      (entry) => entry.toLowerCase().startsWith('uninstall') && entry.toLowerCase().endsWith('.exe')
    );
    if (uninstallers.length !== 1) {
      throw new Error(`Expected one Windows uninstaller, found ${uninstallers.length}.`);
    }
    await run(path.join(installDir, uninstallers[0]), ['/S']);
    await waitFor(
      'the installed application to be removed',
      async () => !(await exists(appExecutable))
    );
  }

  await fs.rm(userDataDir, { recursive: true, force: true });
}

console.log('Windows installer smoke test passed.');
