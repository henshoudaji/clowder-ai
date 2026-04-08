# macOS App Packaging Design

## Status

- Status: draft design baseline
- Scope: `Clowder AI.app` first, `dmg` second
- Audience: packaging, runtime, and desktop integration work

## Goal

Build a distributable macOS desktop app for Clowder AI that users can launch by double-clicking `Clowder AI.app`, with `dmg` used only as the delivery container.

The first release targets the existing project architecture:

- bundled Node runtime
- bundled production web/api/mcp runtime assets
- native macOS launcher shell
- user data stored outside the app bundle
- graceful degradation for Redis and Python sidecars

## Non-Goals

The first macOS packaging iteration does not aim to:

- match the Windows installer feature-for-feature
- embed a full Python runtime
- require Redis as a hard runtime dependency
- implement auto-update
- support Mac App Store sandbox distribution

## Current State

The repository already has a custom Windows packaging pipeline centered on `scripts/build-windows-installer.mjs` and a native Windows launcher in `packaging/windows/desktop/ClowderDesktop.cs`.

The current Unix/macOS startup path is source-oriented rather than product-oriented:

- `package.json` routes startup through `scripts/start-entry.mjs`
- `scripts/start-entry.mjs` dispatches Unix startup to `scripts/runtime-worktree.sh` or `scripts/start-dev.sh`
- `scripts/start-dev.sh` assumes a source checkout, shell environment, and optional system dependencies such as `redis-server`

This means macOS packaging cannot be solved by creating a `dmg` alone. The project first needs a real `.app` runtime model.

## Product Model

The macOS build uses a three-layer structure.

### 1. App Shell

A native macOS launcher, expected to be implemented with `Swift + AppKit + WKWebView`, is responsible for:

- single-instance behavior
- user-visible startup and failure states
- launching bundled backend services
- loading the local frontend URL in an embedded web view
- stopping managed child processes on exit

### 2. Bundled Runtime

The `.app` bundle contains a self-contained runtime built from production artifacts:

- bundled Node runtime
- runtime-ready `packages/api`
- runtime-ready `packages/web`
- runtime-ready `packages/mcp-server`
- runtime-ready `packages/shared`
- bundle-specific startup scripts

This runtime must not depend on system `pnpm`, the source checkout, or the current shell working directory.

### 3. User Data Layer

Mutable application state lives outside the app bundle under standard macOS user directories.

Recommended locations:

- `~/Library/Application Support/ClowderAI/`
- `~/Library/Logs/ClowderAI/`

No mutable runtime state should be written back into `Clowder AI.app/Contents/Resources`.

## Core Differences From `pnpm` Startup

Current `pnpm` startup runs the repository as a project checkout. The future `.app` startup runs the product as a controlled runtime.

`pnpm` startup assumes:

- repo root exists
- source tree is present
- system `node` and `pnpm` exist
- current working directory is correct
- local `node_modules` and build artifacts are already prepared

`.app` startup must instead guarantee:

- all required runtime assets are inside the bundle
- the launcher can resolve bundle-relative paths without a shell cwd
- startup succeeds without system `pnpm`
- mutable data is redirected into user directories
- failures surface as app-visible errors instead of shell-only logs

## First-Release Runtime Strategy

### Node

- Bundle a fixed macOS Node runtime inside the app
- Launch services directly with the bundled `node`
- Do not depend on system `node` or `pnpm`

### Web/API/MCP Runtime Assets

- Reuse the existing runtime staging approach from `scripts/build-windows-installer.mjs`
- Build production artifacts first
- Copy only runtime-relevant package content into the app bundle
- Prefer Next standalone output for the web app when available

### Native Dependencies

The macOS bundle must install macOS-native runtime dependencies during packaging. These cannot be reused from Windows builds.

Important runtime-sensitive dependencies currently include:

- `better-sqlite3`
- `node-pty`
- `sharp`
- `sqlite-vec`
- `puppeteer`

The packaging pipeline must install these for the target macOS architecture and verify that the resulting runtime starts cleanly.

### Redis

First release recommendation:

- default to memory mode
- optionally detect and use a local Redis instance when available
- do not require `brew install redis` for basic app startup

This avoids blocking desktop distribution on a system-level Redis dependency.

### Python Sidecars

First release recommendation:

- disable Python sidecars by default in the bundled app
- optionally enable them later if a supported system `python3` is detected and explicitly configured

This keeps the first packaging milestone focused on the main desktop app path.

## Recommended Bundle Shape

The planned app layout is described in detail in `macos/docs/app-bundle-structure-startup.md`, but the high-level shape is:

```text
Clowder AI.app/
  Contents/
    Info.plist
    MacOS/
      ClowderAI
    Resources/
      runtime/
        scripts/
        node/
        packages/
        assets/
```

## Startup Model

The launcher owns startup orchestration:

1. app launches
2. launcher enforces single-instance behavior
3. launcher prepares user directories
4. launcher starts bundle-managed runtime scripts
5. runtime scripts start API and web services
6. runtime writes a state file with the active URLs and ports
7. launcher waits for readiness
8. launcher loads the frontend in `WKWebView`

This app-driven startup model replaces the current terminal-driven workflow.

## Build Pipeline

The macOS implementation should introduce two packaging stages.

### Stage 1: Build App Bundle

Expected script: `macos/scripts/build-app.mjs`

Responsibilities:

- build shared/api/mcp-server/web production artifacts
- stage runtime packages
- install macOS-native runtime dependencies
- copy bundled Node
- create `.app` directory structure
- place launcher binary, `Info.plist`, icons, and startup scripts

### Stage 2: Package DMG

Expected script: `macos/scripts/package-dmg.mjs`

Responsibilities:

- take the already-built `.app`
- package it with `hdiutil`
- output a distributable `.dmg`

## Signing and Distribution

For internal development, unsigned builds are acceptable while validating the runtime model.

For external distribution, the app should support:

- `codesign`
- notarization
- stapling

This requires an Apple Developer account and certificate setup, but those concerns should come after the `.app` runtime itself is stable.

## Validation Criteria

The first macOS packaging milestone is considered successful when all of the following are true:

- the app launches on a machine without a source checkout
- startup does not require system `pnpm`
- startup succeeds without system Redis by using memory mode
- the frontend loads inside the desktop window
- logs and runtime state are written to user directories
- the app shuts down managed child processes on exit

## Execution Plan

### Phase 1: Runtime Bundling

- define bundle runtime layout
- define bundle-specific startup scripts
- port Windows staging concepts to macOS

### Phase 2: Native Launcher

- create a minimal Swift launcher
- implement service start, readiness wait, and embedded web view

### Phase 3: DMG Packaging

- wrap the `.app` in a `dmg`

### Phase 4: Distribution Hardening

- sign, notarize, and improve install UX

## First Implementation Focus

The first execution block for this design is the app bundle structure and startup sequence definition, documented in `macos/docs/app-bundle-structure-startup.md`.
