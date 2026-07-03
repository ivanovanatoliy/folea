import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const home = os.homedir();

const tryCommand = async (command, args) => {
  await new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', resolve);
    child.on('exit', resolve);
  });
};

const uninstallLinux = async () => {
  const installDir = path.join(home, '.local', 'share', 'folea', 'unpacked');
  const wrapper = path.join(home, '.local', 'bin', 'folea');
  const desktopDir = path.join(home, '.local', 'share', 'applications');
  const desktopFile = path.join(desktopDir, 'folea.desktop');
  const iconRoot = path.join(home, '.local', 'share', 'icons', 'hicolor');
  const installedIcon = path.join(iconRoot, '512x512', 'apps', 'folea.png');

  await fs.rm(installDir, { recursive: true, force: true });
  await fs.rm(wrapper, { force: true });
  await fs.rm(desktopFile, { force: true });
  await fs.rm(installedIcon, { force: true });

  await tryCommand('update-desktop-database', [desktopDir]);
  await tryCommand('gtk-update-icon-cache', [iconRoot]);

  console.log('Removed local unpacked folea installation.');
};

const uninstallMac = async () => {
  const target = path.join(home, 'Applications', 'folea.app');
  await fs.rm(target, { recursive: true, force: true });
  console.log(`Removed ${target}`);
};

const uninstallWindows = async () => {
  const localAppData = process.env.LOCALAPPDATA;
  const appData = process.env.APPDATA;
  if (!localAppData || !appData) {
    throw new Error('LOCALAPPDATA and APPDATA must be set on Windows.');
  }

  const target = path.join(localAppData, 'Programs', 'folea');
  const shortcut = path.join(
    appData,
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'folea.lnk'
  );

  await fs.rm(target, { recursive: true, force: true });
  await fs.rm(shortcut, { force: true });

  console.log(`Removed local unpacked folea installation:
  shortcut: ${shortcut}
  app:      ${target}`);
};

switch (process.platform) {
  case 'linux':
    await uninstallLinux();
    break;
  case 'darwin':
    await uninstallMac();
    break;
  case 'win32':
    await uninstallWindows();
    break;
  default:
    console.error(`uninstall:unpacked does not support ${process.platform}.`);
    process.exit(1);
}
