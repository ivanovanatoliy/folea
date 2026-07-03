import { constants, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

if (process.platform !== 'linux') {
  console.error('install:appimage is available on Linux only.');
  process.exit(1);
}

const root = process.cwd();
const home = os.homedir();
const appImage = path.join(root, 'dist', 'folea-0.0.0.AppImage');
const icon = path.join(root, 'build', 'icon.png');
const installDir = path.join(home, '.local', 'share', 'folea');
const binDir = path.join(home, '.local', 'bin');
const desktopDir = path.join(home, '.local', 'share', 'applications');
const iconDir = path.join(home, '.local', 'share', 'icons', 'hicolor', '512x512', 'apps');
const installedAppImage = path.join(installDir, 'folea.AppImage');
const wrapper = path.join(binDir, 'folea');
const desktopFile = path.join(desktopDir, 'folea.desktop');
const installedIcon = path.join(iconDir, 'folea.png');

const assertReadable = async (filePath, label) => {
  try {
    await fs.access(filePath, constants.R_OK);
  } catch {
    throw new Error(`${label} not found: ${filePath}. Run "npm run package:linux:appimage" first.`);
  }
};

const tryCommand = async (command, args) => {
  await new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', resolve);
    child.on('exit', resolve);
  });
};

await assertReadable(appImage, 'AppImage');
await assertReadable(icon, 'icon');

await fs.mkdir(installDir, { recursive: true });
await fs.mkdir(binDir, { recursive: true });
await fs.mkdir(desktopDir, { recursive: true });
await fs.mkdir(iconDir, { recursive: true });

await fs.copyFile(appImage, installedAppImage);
await fs.chmod(installedAppImage, 0o755);
await fs.copyFile(icon, installedIcon);

await fs.writeFile(wrapper, `#!/usr/bin/env sh\nexec "${installedAppImage}" "$@"\n`, {
  mode: 0o755
});
await fs.chmod(wrapper, 0o755);

await fs.writeFile(
  desktopFile,
  `[Desktop Entry]
Name=folea
Comment=Keyboard-driven Typst note manager
Exec=${wrapper}
Icon=folea
Terminal=false
Type=Application
Categories=Utility;Office;
StartupWMClass=folea
`,
  'utf8'
);

await tryCommand('update-desktop-database', [desktopDir]);
await tryCommand('gtk-update-icon-cache', [path.join(home, '.local', 'share', 'icons', 'hicolor')]);

console.log(`Installed folea AppImage locally:
  launcher: ${wrapper}
  desktop:  ${desktopFile}
  app:      ${installedAppImage}

If folea does not appear in the application menu immediately, restart the launcher or log out and back in.`);
