# Contributing to folea

Thanks for your interest in contributing. The rules below apply to any PR.

## Non-negotiables (your PR will be blocked otherwise)

- **Security (Electron):** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` in
  every renderer; all IPC through the `contextBridge` preload **with input validation**; spawn
  with argument arrays (never shell-string concatenation); a CSP on renderer content.
- **No in-app text editing**, no tabs/buttons/ribbons, keyboard-first preserved.
- **Typst compiles in the Web Worker**, never on the main/renderer thread.
- **TypeScript strict**; no unexplained `any` / `@ts-ignore`.
- **Perf budget measured and met**: input-to-paint ≤ ~16 ms, warm note-open (cached) ≤ ~50 ms,
  cold start ~1 s. Include real numbers in the PR when perf-sensitive code changes.
- **Local gate green** (hosted CI is intentionally disabled): typecheck, lint, tests, relevant E2E,
  rebuild when native packaging behavior is touched, and packaging smoke checks for release work.

## Workflow

- One PR per coherent change. Keep unrelated/drive-by changes out of it.
- Files on disk are the source of truth for a vault; any index or cache must be rebuildable from
  them.
- Keypresses go through the single input pipeline (`Context → Keymap → Command`), not scattered
  `keydown` handlers. Commands are named, decoupled from keys, and unit-testable headlessly.

## Local checks before opening a PR

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e   # Playwright-Electron
npm run rebuild    # required when native-module packaging/rebuild behavior is touched
```

Release/package work also runs:

```bash
npm run package       # current OS artifacts
npm run package:dir   # current OS unpacked app
npm run package:linux:appimage  # Linux AppImage-only smoke build when deb tooling is unavailable
npm run package:all   # cross-targets where supported by the host
npm run install:unpacked # current OS user-local app-menu install from source
npm run uninstall:unpacked
npm run install:appimage # Linux AppImage user-local app-menu install from source
npm run uninstall:appimage
```

Record which OS artifacts were built and smoke-tested in the PR. Unsigned macOS/Windows artifacts
are expected for now; signing/notarization and auto-update are out of scope unless discussed first.

## Tests

- Unit + headless command-dispatch tests with **vitest**.
- E2E with **Playwright-Electron**.
- Tests ship **with** the feature. Meaningful assertions, not happy-path snapshots.

## License

By contributing, you agree your contributions are licensed under [Apache-2.0](LICENSE). When you
add a bundled third-party binary, update [`NOTICE`](NOTICE) and comply with its license.
