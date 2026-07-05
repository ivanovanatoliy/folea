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

## Screenshots

![start screen](assets/screenshots/start_screen.png)

![tree](assets/screenshots/tree.png)

![palette](assets/screenshots/palette.png)

![editor open](assets/screenshots/editor_open.png)

## Install

### From source

```bash
npm install
npm run app:install    # build + install for the current OS
npm run app:uninstall  # remove the installed copy
```

`app:install` builds an unpacked app and registers it with the OS: on Linux it writes
`~/.local/share/folea/unpacked`, `~/.local/bin/folea`, the icon, and
`~/.local/share/applications/folea.desktop`; on macOS it copies `folea.app` to `~/Applications`;
on Windows it copies the app to `%LOCALAPPDATA%\Programs\folea` and creates a Start Menu shortcut.

### Build a distributable

```bash
npm run package   # produces a distributable for the current OS
```

Targets are Linux AppImage + deb, Windows NSIS, and macOS dmg + zip. Packages are unsigned — on
macOS use **Open Anyway** in System Settings → Privacy & Security (or
`xattr -dr com.apple.quarantine`); on Windows SmartScreen may require **More info → Run anyway**.

## Configuration

Global config lives in Electron's `userData` directory:

- Linux: `~/.config/folea/`
- macOS: `~/Library/Application Support/folea/`
- Windows: `%APPDATA%/folea/`

Vault-local prefs may override global prefs key by key from `<vault>/.folea/prefs.config`.

`prefs.config`:

```ini
search.vaultCaseSensitive = false
search.inFileCaseSensitive = false
theme = dark
editor.command = code --reuse-window %FILE%
```

`editor.command` is split on whitespace; `%FILE%` is replaced with the note path.
`FOLEA_EDITOR_CMD` env var overrides `editor.command` at runtime.
The default is VS Code (`code --reuse-window`).

**Neovim** requires a terminal emulator in the command. Specify both explicitly:

```ini
editor.command = kitty -e nvim %FILE%
```

When folea controls the Neovim launch it passes `--listen <socket>` and an auto-save hook.
The socket lets folea reuse an already-open session — subsequent `editor.open` calls switch the
buffer instead of opening a new window. The hook saves on `InsertLeave` so edits are never lost.

`keys.config`:

```text
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

## Key Bindings

All bindings are remappable via `keys.config`. The command ID shown in the palette is the
key used for remapping.

### Document (reading mode)

| Key | Action |
|---|---|
| `j` / `k` | Scroll down / up |
| `h` / `l` | Scroll left / right |
| `Ctrl+d` / `Ctrl+u` | Scroll half page down / up |
| `gg` / `G` | Jump to top / bottom |
| `n` / `N` | Next / previous search match |
| `:` | Command palette |
| `/` | In-file search |
| `Ctrl+p` | Quick open note |
| `Ctrl+b` | Toggle file tree |
| `o` | Document outline |
| `b` | Links panel |
| `s` | Enter caret mode |
| `Ctrl+e` | Open current note in editor |
| `=` | Fit page width |
| `+` / `-` | Zoom in / out |

### File tree

| Key | Action |
|---|---|
| `j` / `k` | Move down / up |
| `l` / `h` | Expand / collapse |
| `gg` / `G` | First / last item |
| `/` | Filter tree |
| `Enter` | Open selected note |

### Caret mode (`s` to enter)

| Key | Action |
|---|---|
| `h` / `j` / `k` / `l` | Move caret |
| `{` / `}` | Previous / next paragraph |
| `gg` / `G` | Document start / end |
| `v` | Enter visual selection |
| `y` | Yank selection (in visual mode) |
| `Enter` / `gd` | Follow link under caret |
| `m<x>` | Set mark `x` |
| `'<x>` | Jump to mark `x` |

## Contributing

The repository is currently **read-only** — no external contributions are accepted while core
features are being built. Issues and PRs will be ignored for now. This will change once the
project reaches a stable baseline; the notice here will be updated accordingly.

## License

[Apache-2.0](LICENSE). Bundled third-party components are attributed in [`NOTICE`](NOTICE).
