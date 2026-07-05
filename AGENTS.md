# Agents guide

## What this project is

**folea** is a keyboard-driven, minimalist Electron desktop app for reading and navigating [Typst](https://typst.app) notes. It is a read/navigation shell for a plain directory of `.typ` files — not an editor. It renders Typst in-app (via a WASM compiler worker) and lets the user open notes in an external editor.

## Architecture

folea follows the standard Electron split: a **main process**, a **renderer**, and a **preload** bridge between them.

**Main process** (`src/main/`) owns everything that touches the filesystem and OS: opening/watching a vault directory, reading and writing `.typ` files, persisting app state and per-vault state (last opened note, scroll positions, render cache) to disk, running ripgrep for full-text search, and launching the external editor. All of this is exposed to the renderer through typed IPC channels declared in `src/shared/ipc/`.

**Preload** (`src/preload/`) is the only code that can call Electron's `ipcRenderer`. It validates every message going in and out and exposes a typed `window.folea` bridge to the renderer via `contextBridge`. The renderer never touches Electron APIs directly.

**Renderer** (`src/renderer/`) is a single-page UI. All state lives in one root `App` component. The UI consists of a document surface and a set of modal overlays (palette, tree, search, links, outline, quick-open). Overlays are toggled by the keyboard input system.

**Input system** (`src/renderer/input/`) is vim-inspired: a context stack determines which keymap is active at any moment. Each overlay pushes its keymap on open and pops it on close. The dispatcher maps key sequences to command IDs, which are then executed against a `CommandContext` that holds typed view interfaces for every overlay.

**Typst rendering** happens in a dedicated Web Worker (`src/workers/typst-compile/`) that runs the Typst WASM compiler in isolation. The renderer posts compile requests to the worker and receives rendered output back. Compiled results are cached persistently on disk via vault state IPC so the app can render notes instantly on subsequent opens without recompiling.

**Link graph** (`src/renderer/nav/`) is built in the renderer by parsing `@import` / wiki-style links from source files loaded from the vault. It powers the links overlay (backlinks + outgoing links) and smart-jump navigation.

**Config** is layered: global prefs (theme, editor command) live in Electron's `userData`; per-vault overrides live in the vault directory itself. Keys config (`keys.config` in `userData`) lets users remap any command.

## Source layout

```
src/
  main/        Electron main process — app lifecycle, IPC handlers, vault watcher, search service
  preload/     Electron preload script — exposes IPC to renderer via contextBridge
  renderer/    SolidJS UI — overlays (palette, tree, search, links, outline), input system, surface rendering
    app/       Top-level components and overlay models
    input/     Keyboard binding system (commands, keymaps, dispatcher, context stack)
    nav/       Link graph and link parser
    search/    Local in-process search
    surface/   Document surface — zoom, caret, scroll
    vault/     Renderer-side vault model
  shared/      Types and IPC channel definitions shared between main and renderer
  workers/
    typst-compile/  Web Worker running the Typst WASM compiler
tests/
  unit/        Vitest unit tests
  e2e/         Playwright end-to-end tests (require a built app)
scripts/       Build helpers, install/uninstall scripts, performance measurement scripts
```

## Key commands

```bash
npm run dev            # Start in dev mode
npm run build          # Typecheck + build
npm run test           # Run unit tests (Vitest)
npm run test:e2e       # Build + run Playwright e2e tests
npm run typecheck      # TypeScript check only
npm run lint           # ESLint
npm run format:write   # Prettier
```

## Workflow rules

- **Run `npm run test` before committing.** Only before committing — not on every code change, not after every edit. Typechecks and linting are not required as part of the commit flow.
- **Commit messages and PR titles:** plain imperative, first letter capitalized, no `feat:` / `fix:` / `chore:` prefixes or any other conventional-commit prefixes. Example: `Add outline overlay keyboard navigation`.
- **Do not add yourself as a co-author** in commit messages.
