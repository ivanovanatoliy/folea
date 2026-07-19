import { constants, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const home = os.homedir();
const dist = path.join(root, 'dist');
const icon = path.join(root, 'assets', 'logo', 'app-icon-dark.svg');

const assertReadable = async (filePath, label) => {
  try {
    await fs.access(filePath, constants.R_OK);
  } catch {
    throw new Error(`${label} not found: ${filePath}. Run "npm run package:dir" first.`);
  }
};

const copyDirectory = async (source, target) => {
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true });
};

const tryCommand = async (command, args) => {
  await new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', resolve);
    child.on('exit', resolve);
  });
};

const findMacApp = async () => {
  const entries = await fs.readdir(dist, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(dist, entry.name, 'folea.app');
    try {
      await fs.access(candidate, constants.R_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }

  throw new Error('macOS .app bundle not found under dist/. Run "npm run package:dir" first.');
};

const installLinux = async () => {
  const source = path.join(dist, 'linux-unpacked');
  await assertReadable(path.join(source, 'folea'), 'linux-unpacked executable');
  await assertReadable(icon, 'icon');

  const installDir = path.join(home, '.local', 'share', 'folea', 'unpacked');
  const binDir = path.join(home, '.local', 'bin');
  const desktopDir = path.join(home, '.local', 'share', 'applications');
  const iconRoot = path.join(home, '.local', 'share', 'icons', 'hicolor');
  const iconDir = path.join(iconRoot, 'scalable', 'apps');
  const wrapper = path.join(binDir, 'folea');
  const desktopFile = path.join(desktopDir, 'folea.desktop');
  const installedIcon = path.join(iconDir, 'folea.svg');

  await copyDirectory(source, installDir);
  await fs.chmod(path.join(installDir, 'folea'), 0o755);
  await fs.mkdir(binDir, { recursive: true });
  await fs.mkdir(desktopDir, { recursive: true });
  await fs.mkdir(iconDir, { recursive: true });
  await fs.copyFile(icon, installedIcon);

  await fs.writeFile(
    wrapper,
    `#!/usr/bin/env sh\nexec "${path.join(installDir, 'folea')}" "$@"\n`,
    {
      mode: 0o755
    }
  );
  await fs.chmod(wrapper, 0o755);

  await fs.writeFile(
    desktopFile,
    `[Desktop Entry]
Name=folea
Comment=Keyboard-driven, minimalist note manager for Typst notes
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
  await tryCommand('gtk-update-icon-cache', [iconRoot]);

  console.log(`Installed unpacked folea locally:
  launcher: ${wrapper}
  desktop:  ${desktopFile}
  app:      ${installDir}`);
};

const installMac = async () => {
  const source = await findMacApp();
  const target = path.join(home, 'Applications', 'folea.app');
  await copyDirectory(source, target);
  console.log(`Installed folea.app to ${target}`);
};

const installWindows = async () => {
  const localAppData = process.env.LOCALAPPDATA;
  const appData = process.env.APPDATA;
  if (!localAppData || !appData) {
    throw new Error('LOCALAPPDATA and APPDATA must be set on Windows.');
  }

  const source = path.join(dist, 'win-unpacked');
  await assertReadable(path.join(source, 'folea.exe'), 'win-unpacked executable');

  const target = path.join(localAppData, 'Programs', 'folea');
  await copyDirectory(source, target);

  const shortcutDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const shortcutPath = path.join(shortcutDir, 'folea.lnk');
  const exePath = path.join(target, 'folea.exe');
  await fs.mkdir(shortcutDir, { recursive: true });

  const script = `
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut('${shortcutPath.replaceAll("'", "''")}')
$Shortcut.TargetPath = '${exePath.replaceAll("'", "''")}'
$Shortcut.WorkingDirectory = '${target.replaceAll("'", "''")}'
$Shortcut.IconLocation = '${exePath.replaceAll("'", "''")}'
$Shortcut.Save()
`;

  await new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        stdio: 'ignore'
      }
    );
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`powershell.exe exited with code ${code}`));
    });
  });

  console.log(`Installed unpacked folea locally:
  shortcut: ${shortcutPath}
  app:      ${target}`);
};

switch (process.platform) {
  case 'linux':
    await installLinux();
    break;
  case 'darwin':
    await installMac();
    break;
  case 'win32':
    await installWindows();
    break;
  default:
    console.error(`install:unpacked does not support ${process.platform}.`);
    process.exit(1);
}
