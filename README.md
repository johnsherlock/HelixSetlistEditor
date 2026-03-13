# Helix Setlist Editor

Helix Setlist Editor is a desktop app for creating and editing Line 6 Helix setlist files (`.hls`) outside HX Edit.

It can:
- open existing `.hls` setlists
- build new setlists from a bundled blank template
- reorder, insert, replace, remove, and alphabetize presets
- load `.hlx` preset files from a separate preset library directory
- save valid `.hls` files that Helix can import

## Beta Distribution

This repo is set up for public beta distribution through:

- GitHub Releases: direct `.dmg` download for Apple Silicon Macs
- GitHub Releases: direct `.dmg` download for Intel Macs
- GitHub Releases: direct `.msi` download for Windows

The macOS beta is **ad-hoc signed** but **not notarized**. That should present as an "unidentified developer" warning instead of "damaged", but macOS may still block first launch. If that happens:

1. open Finder
2. right-click `Helix Setlist Editor.app`
3. choose `Open`
4. confirm the prompt

## Auto Updates

The desktop app checks for updates on launch in production builds.

- If no update is available, nothing is shown.
- If a newer release is available, the app prompts before downloading and installing it.

Updater artifacts are published alongside each GitHub Release:

- `.dmg` for Apple Silicon direct install
- `.dmg` for Intel direct install
- `.app.tar.gz` and `.sig` pairs for the Tauri updater on both macOS architectures
- `latest.json` for update discovery

## Website

A public download site lives in:

- [site](/Users/john/.codex/worktrees/c784/HelixSetlistEditor/site)

It is deployed to GitHub Pages from the `main` branch. The site reads [site/downloads.json](/Users/john/.codex/worktrees/c784/HelixSetlistEditor/site/downloads.json), which is updated automatically by the tag-based release workflow after each published release.

## Release Workflow

The CI workflow is in:

- [.github/workflows/ci.yml](/Users/john/Documents/Projects/HelixSetlistEditor/.github/workflows/ci.yml)

It runs on pushes to `main` and pull requests for desktop-app changes and verifies:

- version sync
- type-checking
- tests
- frontend build
- native Rust/Tauri tests

A separate GitHub Pages workflow is in:

- [.github/workflows/site.yml](/Users/john/.codex/worktrees/c784/HelixSetlistEditor/.github/workflows/site.yml)

It deploys the static `site/` app when website files change on `main`.

The release workflow is in:

- [.github/workflows/release.yml](/Users/john/Documents/Projects/HelixSetlistEditor/.github/workflows/release.yml)

It runs only on tag pushes, builds Apple Silicon and Intel macOS releases plus the Windows release, generates updater metadata for both macOS architectures, publishes release assets to GitHub Releases, and updates the website download manifest for GitHub Pages.

Required GitHub secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Release checklist:

- [docs/release-beta.md](/Users/john/Documents/Projects/HelixSetlistEditor/docs/release-beta.md)

## Tech Stack

- `TypeScript`
- `React`
- `Vite`
- `Tauri`
- `Rust`
- `Vitest`

## Architecture

- [src/core](/Users/john/Documents/Projects/HelixSetlistEditor/src/core): `.hls` codec and validation logic
- [src/domain](/Users/john/Documents/Projects/HelixSetlistEditor/src/domain): pure setlist operations
- [src-tauri](/Users/john/Documents/Projects/HelixSetlistEditor/src-tauri): native desktop shell, filesystem bridge, bundling
- [web/src](/Users/john/Documents/Projects/HelixSetlistEditor/web/src): React desktop UI
- [tests](/Users/john/Documents/Projects/HelixSetlistEditor/tests): unit and UI tests
- [site](/Users/john/.codex/worktrees/c784/HelixSetlistEditor/site): static marketing and download site

## Development

Install dependencies:

```bash
npm install
```

Run the desktop app in dev mode:

```bash
npm start
```

Type-check:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Build the frontend bundle:

```bash
npm run build
```

Build the Tauri release bundle:

```bash
npm run tauri:build
```

Build the signed local beta release bundle:

```bash
npm run tauri:build:beta
```

Build a Windows MSI bundle:

```bash
npm run tauri:build:windows-msi
```

## Versioning

Release version numbers must stay aligned across:

- [package.json](/Users/john/Documents/Projects/HelixSetlistEditor/package.json)
- [src-tauri/Cargo.toml](/Users/john/Documents/Projects/HelixSetlistEditor/src-tauri/Cargo.toml)
- [src-tauri/tauri.conf.json](/Users/john/Documents/Projects/HelixSetlistEditor/src-tauri/tauri.conf.json)

Check alignment with:

```bash
npm run release:check -- v0.1.0
```

Prepare the next release commit and tag automatically:

```bash
npm run release:prepare -- patch
```

Prepare, commit, tag, and push a release in one command:

```bash
npm run release:publish -- 0.1.3
```

You can also use:

```bash
npm run release:publish -- patch
```

This must be run from the `main` branch.

## File Format Notes

The app preserves these `.hls` invariants:

- `schema` remains valid for Helix setlists
- `compression.type` remains `zlib`
- `crc32` is computed from the decompressed inner JSON bytes
- `decompressed_size` exactly matches the decompressed byte length

The UI edits draft JSON. The codec layer rebuilds the `.hls` container on save.
