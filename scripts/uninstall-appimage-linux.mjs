import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

if (process.platform !== 'linux') {
  console.error('uninstall:appimage is available on Linux only.');
  process.exit(1);
}

const home = os.homedir();
const installDir = path.join(home, '.local', 'share', 'folea');
const wrapper = path.join(home, '.local', 'bin', 'folea');
const desktopDir = path.join(home, '.local', 'share', 'applications');
const desktopFile = path.join(desktopDir, 'folea.desktop');
const iconRoot = path.join(home, '.local', 'share', 'icons', 'hicolor');
const installedIcon = path.join(iconRoot, '512x512', 'apps', 'folea.png');

const tryCommand = async (command, args) => {
  await new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', resolve);
    child.on('exit', resolve);
  });
};

await fs.rm(wrapper, { force: true });
await fs.rm(desktopFile, { force: true });
await fs.rm(installedIcon, { force: true });
await fs.rm(path.join(installDir, 'folea.AppImage'), { force: true });

await tryCommand('update-desktop-database', [desktopDir]);
await tryCommand('gtk-update-icon-cache', [iconRoot]);

console.log('Removed local folea AppImage installation.');
