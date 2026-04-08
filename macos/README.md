# macOS Packaging Workspace

This directory centralizes the macOS-specific packaging work for Clowder AI.

## Structure

- `macos/docs/` — design docs and runtime staging notes
- `macos/scripts/` — build and bundle lifecycle scripts
- `macos/packaging/` — app templates and launcher assets

## Main Entry Point

- `pnpm package:macos:app`
- underlying script: `node macos/scripts/build-app.mjs`
