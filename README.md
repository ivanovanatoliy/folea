<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/logo/logo-light.svg">
  <img alt="folea" src="assets/logo/logo-light.svg" width="320">
</picture>
</p>

**folea** is a keyboard-driven, minimalist note manager for **[Typst](https://typst.app)**
notes. It is a read/navigation shell for a plain directory of `.typ` files: open a vault,
search, jump, browse links, and read rendered Typst.

folea **does not edit notes in-app**. The **open editor** command (`<C-e>` by default) opens the
current note in an external editor such as VS Code, Neovim, or whatever you prefer.

## Screenshots

<table>
  <tr>
    <td><a href="assets/screenshots/start_screen.png"><img src="assets/screenshots/start_screen.png" alt="Start screen"></a></td>
    <td><a href="assets/screenshots/tree.png"><img src="assets/screenshots/tree.png" alt="File tree"></a></td>
  </tr>
  <tr>
    <td><a href="assets/screenshots/palette.png"><img src="assets/screenshots/palette.png" alt="Command palette"></a></td>
    <td><a href="assets/screenshots/editor_open.png"><img src="assets/screenshots/editor_open.png" alt="External editor"></a></td>
  </tr>
</table>

## Install

> **Folea is under active development. GitHub Releases are manually cut from `main` and are not
> signed.**

Package managers are the recommended installation method. Development packages are built from the
`develop` branch and may contain unstable or incomplete changes. Package identifiers retain their
`-dev` or `-git` suffix, but the installed application and command are always lowercase `folea`.
Check the exact source commit with `folea --build-info`.

<details>
<summary><strong>Windows</strong></summary>

Install with [Scoop](https://scoop.sh/). The package builds an exact `develop` commit locally:

```powershell
scoop bucket add folea https://github.com/ivanovanatoliy/scoop-folea
scoop install folea-dev
```

</details>

<details>
<summary><strong>macOS</strong></summary>

Install the app with [Homebrew](https://brew.sh/). The cask builds an exact `develop` commit locally:

```bash
brew install --cask ivanovanatoliy/folea/folea-dev
```

The app uses an ad-hoc signature rather than an Apple Developer certificate or notarization.

</details>

<details>
<summary><strong>Linux</strong></summary>

Arch Linux, Manjaro, and EndeavourOS ([AUR](https://aur.archlinux.org/packages/folea-git)):

```bash
yay -S folea-git
```

Debian, Ubuntu, and Linux Mint (APT):

```bash
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://ivanovanatoliy.github.io/folea/repo-signing-key.asc \
  | sudo tee /etc/apt/keyrings/folea-packages.asc >/dev/null
curl -fsSL https://ivanovanatoliy.github.io/folea/apt/folea.sources \
  | sudo tee /etc/apt/sources.list.d/folea.sources >/dev/null
sudo apt update
sudo apt install folea-dev
```

Fedora (DNF):

```bash
sudo curl -fsSL https://ivanovanatoliy.github.io/folea/rpm/folea.repo \
  -o /etc/yum.repos.d/folea.repo
sudo dnf install folea-dev
```

</details>

### From source

Clone the `develop` branch, then build and install Folea for the current user:

```bash
npm install
npm run app:install
```

The install script builds the unpacked app and registers it with the OS. To remove it:

```bash
npm run app:uninstall
```

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
```

### Editor command

`editor.command` opens the current note when you press `<C-e>`. It defaults to VS Code
(`code --reuse-window`). `%FILE%` is replaced with the note path; `FOLEA_EDITOR_CMD` env var
overrides it at runtime.

<details>
<summary><strong>VS Code (default)</strong></summary>

```ini
editor.command = code --reuse-window %FILE%
```

</details>

<details>
<summary><strong>Neovim</strong></summary>

```ini
editor.command = kitty -e nvim --listen %SOCK% %FILE%
```

`%SOCK%` is replaced with a vault-scoped socket path. With `--listen`, folea reuses an
already-open nvim session — subsequent `editor.open` calls switch the buffer instead of opening
a new window. Omit `%SOCK%` if you don't need session reuse.

</details>

### Key bindings

`keys.config`:

```text
document.scrollHalfDown <C-f>
view.toggleTree t
editor.open e
```

The command ID is the same ID shown in the command palette. 

<details>
<summary><strong>Default Key Bindings</strong></summary>

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

</details>

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

`npm run test:e2e` launches Electron through Playwright. 

See [Contributing](CONTRIBUTING.md) before opening a pull request.

## License

[Apache-2.0](LICENSE). Bundled third-party components are attributed in [`NOTICE`](NOTICE).
