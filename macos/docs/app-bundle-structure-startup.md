# macOS App Bundle Structure and Startup Sequence

## Purpose

This document defines the first implementation block for macOS desktop packaging:

- the `.app` bundle directory layout
- the user data layout
- the startup and shutdown sequence
- the minimum responsibilities of the native launcher and bundle runtime scripts

It is the execution companion to `macos/docs/app-packaging-design.md`.

## Design Goals

- make startup independent from the source checkout
- make runtime path resolution deterministic
- isolate mutable state from the app bundle
- support a small native launcher that delegates service startup to bundle-managed scripts
- preserve room for later signing and notarization work

## Proposed `.app` Layout

```text
Clowder AI.app/
  Contents/
    Info.plist
    MacOS/
      ClowderAI
    Resources/
      runtime/
        .clowder-release.json
        package.json
        scripts/
          start-bundle.sh
          stop-bundle.sh
          write-runtime-state.mjs
        node/
          bin/
            node
        packages/
          api/
            package.json
            dist/
            node_modules/
          web/
            package.json
            server.js
            .next/
            public/
            node_modules/
          mcp-server/
            package.json
            dist/
            node_modules/
          shared/
            package.json
            dist/
        assets/
          AppIcon.icns
          splash.jpg
```

## Layout Rules

- `Contents/MacOS/ClowderAI`
  - native launcher executable
  - contains no mutable runtime state
- `Contents/Resources/runtime/`
  - app-owned runtime assets
  - treated as read-only at runtime
- `Contents/Resources/runtime/scripts/`
  - bundle-specific scripts only
  - must not assume repo root or developer cwd
- `Contents/Resources/runtime/packages/`
  - runtime-pruned packages only
  - includes production assets and runtime dependencies

## User Data Layout

All mutable state moves into user directories.

```text
~/Library/Application Support/ClowderAI/
  config/
    env
  data/
  cache/
  run/
    runtime-state.json
    api.pid
    web.pid
    mcp-server.pid

~/Library/Logs/ClowderAI/
  launcher.log
  api.log
  web.log
  mcp-server.log
```

## User Data Rules

- configuration files are user-owned and survive app replacement
- logs are append-only runtime output
- pid files and runtime state are ephemeral
- SQLite databases, exported files, and caches live outside the app bundle
- the launcher recreates missing directories on startup

## Environment Model

The launcher passes a minimal, explicit environment into bundle-managed scripts.

Expected environment variables include:

- `CLOWDER_APP_BUNDLE_ROOT`
- `CLOWDER_RUNTIME_ROOT`
- `CLOWDER_USER_HOME`
- `CLOWDER_LOG_DIR`
- `CLOWDER_RUN_DIR`
- `CLOWDER_CONFIG_DIR`
- `CLOWDER_DATA_DIR`
- `CLOWDER_CACHE_DIR`
- `NODE_ENV=production`
- `MEMORY_STORE=1` by default for the first release

Optional runtime values determined at startup:

- `FRONTEND_PORT`
- `API_SERVER_PORT`
- `NEXT_PUBLIC_API_URL`

## Launcher Responsibilities

The native launcher is responsible for the desktop-level concerns only.

### Startup Responsibilities

- resolve its own bundle location
- resolve `Contents/Resources/runtime`
- prepare user directories
- acquire a single-instance lock
- choose ports or accept previously reserved ports
- start the bundle runtime script
- wait for readiness
- load the frontend URL in `WKWebView`

### Runtime UX Responsibilities

- show an initial loading state
- show an actionable error when startup fails
- expose log file locations in failure messaging
- optionally support reopen/focus behavior for an existing instance

### Shutdown Responsibilities

- invoke the bundle stop script or send a managed termination signal
- wait briefly for child processes to exit
- clean stale pid files and transient runtime state when safe

## Bundle Script Responsibilities

The bundle scripts are responsible for service orchestration, not desktop UX.

### `start-bundle.sh`

- validate required runtime paths
- export runtime environment values
- start API service with bundled Node
- start web service with bundled Node
- optionally start MCP server if required for the app baseline
- write pid files
- write `runtime-state.json`

### `stop-bundle.sh`

- read pid files from the run directory
- stop only processes started by the app runtime
- avoid killing unrelated user processes
- remove stale pid files after stop

### `write-runtime-state.mjs`

- write a canonical JSON state file for the launcher to read
- keep the format stable and bundle-specific

## Runtime State Contract

Suggested `runtime-state.json` format:

```json
{
  "mode": "bundle-production",
  "frontendUrl": "http://127.0.0.1:3003/",
  "apiUrl": "http://127.0.0.1:3004",
  "frontendPort": 3003,
  "apiPort": 3004,
  "pidFiles": {
    "api": "~/Library/Application Support/ClowderAI/run/api.pid",
    "web": "~/Library/Application Support/ClowderAI/run/web.pid"
  },
  "startedAt": "2026-03-29T12:00:00.000Z"
}
```

## Startup Sequence

```text
User double-clicks Clowder AI.app
  -> macOS launches ClowderAI
  -> launcher resolves bundle paths
  -> launcher prepares user dirs
  -> launcher acquires single-instance lock
  -> launcher selects ports
  -> launcher starts `start-bundle.sh`
  -> `start-bundle.sh` starts API and web
  -> `start-bundle.sh` writes pid files and `runtime-state.json`
  -> launcher polls frontend/api readiness
  -> launcher opens WKWebView with frontendUrl
  -> user interacts with embedded app
```

## Startup Sequence Diagram

```text
Launcher            start-bundle.sh               API/Web Runtime
   |                         |                          |
   | resolve bundle paths    |                          |
   | prepare user dirs       |                          |
   | acquire app lock        |                          |
   | start script ---------->|                          |
   |                         | export env              |
   |                         | start API ------------->|
   |                         | start Web ------------->|
   |                         | write state file        |
   |<----- readiness data ---|                          |
   | poll frontend URL -------------------------------->|
   | load WKWebView                                      |
```

## Shutdown Sequence

```text
User quits app
  -> launcher marks exit requested
  -> launcher invokes `stop-bundle.sh`
  -> stop script reads pid files
  -> stop script terminates managed API/Web processes
  -> stop script removes pid files
  -> launcher exits
```

## Port Strategy

First-release recommendation:

- prefer defaults `3003` and `3004`
- if either port is unavailable, select an available pair dynamically
- always persist the final selection into `runtime-state.json`
- make the launcher trust the state file instead of assuming static ports

This avoids startup failure caused by user-local conflicts.

## First-Release Failure Cases

The launcher should explicitly handle these cases:

- bundled Node missing or not executable
- API startup failure
- web startup failure
- state file never written
- readiness timeout
- stale pid files from a previous crash

In all failure cases, the app should point the user to the log directory.

## Reuse From Existing Repository Logic

The macOS bundle design intentionally mirrors parts of the Windows packaging model:

- runtime package staging in `scripts/build-windows-installer.mjs`
- release metadata generation in `scripts/build-windows-installer.mjs`
- runtime state driven desktop shell behavior in `packaging/windows/desktop/ClowderDesktop.cs`

The macOS implementation should reuse the staging ideas, but not the Windows-specific launcher or installer technology.

## Immediate Next Step

After this structure and startup model is accepted, the next implementation artifact is the packaging task breakdown for `scripts/build-macos-app.mjs`, including:

- build inputs
- staging steps
- runtime dependency installation
- `.app` assembly
- validation checkpoints
