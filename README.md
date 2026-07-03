<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/folea-logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/brand/folea-logo-light.svg">
  <img alt="folea" src="assets/brand/folea-logo-light.svg" width="320">
</picture>
</p>

**folea** is a keyboard-driven, minimalist note manager for **[Typst](https://typst.app)**
notes. It is a read/navigation shell for a plain directory of `.typ` files: open a vault,
search, jump, browse links, and read rendered Typst.

folea **does not edit notes in-app**. The `editor.open` command (`<C-e>` by default) launches the
user's external terminal/editor command, normally Neovim with tinymist.

## Install

M10 packages are unsigned. Build artifacts are produced with `electron-builder`:

```bash
npm install
npm run install:unpacked # Build an unpacked app and add folea to the app menu
npm run uninstall:unpacked
```

Manual packaging commands:

```bash
npm run package       # current OS
npm run package:dir   # current OS unpacked app
npm run package:linux:appimage  # Linux AppImage-only smoke build
npm run package:all   # cross-targets where the host/toolchain supports it
npm run install:appimage   # Linux: build AppImage and add folea to the app menu
npm run uninstall:appimage
```

`install:unpacked` installs the current OS unpacked build from source: on Linux it writes
`~/.local/share/folea/unpacked`, `~/.local/bin/folea`, the icon, and
`~/.local/share/applications/folea.desktop`; on macOS it copies `folea.app` to `~/Applications`;
on Windows it copies the app to `%LOCALAPPDATA%\\Programs\\folea` and creates a Start Menu shortcut.
`install:appimage` is Linux-only and installs the AppImage variant to `~/.local/share/folea`.

Targets are Linux AppImage + deb, Windows NSIS, and macOS dmg + zip. On macOS, unsigned builds may
need **Open Anyway** in System Settings → Privacy & Security or `xattr -dr com.apple.quarantine`.
On Windows, SmartScreen may require **More info** → **Run anyway**.

## Configuration

Global config lives in Electron's `userData` directory:

- Linux: `~/.config/folea/`
- macOS: `~/Library/Application Support/folea/`
- Windows: `%APPDATA%\\folea\\`

Vault-local prefs may override global prefs key by key from `<vault>/.folea/prefs.config`.
Precedence is vault `.folea/prefs.config` → global `prefs.config` → built-in defaults.
`keys.config` is global only in M10.

`prefs.config`:

```ini
search.vaultCaseSensitive = false
search.inFileCaseSensitive = false
theme = dark
editor.command = kitty -e nvim %FILE%
```

`theme` is `system`, `light`, or `dark`; `system` is the default and follows the OS color scheme.
The command palette exposes `Use system theme`, `Use light theme`, `Use dark theme`, and
`Cycle theme`, which write the selected theme into the global `prefs.config`.
`editor.command` is split on whitespace and the exact `%FILE%` token is replaced with the note
path. `FOLEA_EDITOR_CMD` still overrides `editor.command`.

`keys.config`:

```text
# one binding per line
document.scrollHalfDown <C-f>
view.toggleTree t
editor.open e
```

The command ID is the same ID shown in the command palette. Remapping removes the default chord
for that command in every default context where it appears, then adds the configured chord.
Multiple lines for the same command add multiple chords. Invalid lines warn in the status line and
defaults remain usable.

## Edit Runtime Dependencies

For read/search/navigation, folea is self-contained. For `editor.open`, install:

- Neovim
- tinymist
- `typst-preview.nvim` if you want live Typst preview from Neovim

folea does not redistribute these tools; it only launches them.

## Development

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run rebuild
```

`npm run test:e2e` launches Electron through Playwright. On headless Linux, run it under a display
server such as Xvfb.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE). Bundled third-party components are attributed in [`NOTICE`](NOTICE).
