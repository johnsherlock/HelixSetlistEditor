# Helix Setlist Editor

Helix Setlist Editor is a macOS desktop app for creating and editing Line 6 Helix setlist files (`.hls`) outside HX Edit.

It can:
- open existing `.hls` setlists
- build new setlists from a bundled blank template
- reorder, insert, replace, remove, and alphabetize presets
- load `.hlx` preset files from a separate preset library directory
- save valid `.hls` files that Helix can import

## Beta Distribution

This repo is set up for public beta distribution through:

- GitHub Releases: direct `.dmg` download
- Homebrew: your own tap with a cask that points at the GitHub Release `.dmg`

The beta is currently **unsigned** and **not notarized**. On first launch, macOS may block it. If that happens:

1. open Finder
2. right-click `Helix Setlist Editor.app`
3. choose `Open`
4. confirm the prompt

## Auto Updates

The desktop app checks for updates on launch in production builds.

- If no update is available, nothing is shown.
- If a newer release is available, the app prompts before downloading and installing it.

Updater artifacts are published alongside each GitHub Release:

- `.dmg` for direct install
- `.app.tar.gz` and `.sig` for the Tauri updater
- `latest.json` for update discovery

## Homebrew

The Homebrew cask is intended to live in your own public tap repo.

Recommended install flow once the tap exists:

```bash
brew tap johnsherlock/tap
brew install --cask helix-setlist-editor
```

This repo includes:

- a release workflow that generates `release/helix-setlist-editor.rb`
- helper docs in [packaging/homebrew/README.md](/Users/john/Documents/Projects/HelixSetlistEditor/packaging/homebrew/README.md)

## Release Workflow

The release workflow is in:

- [.github/workflows/release-beta.yml](/Users/john/Documents/Projects/HelixSetlistEditor/.github/workflows/release-beta.yml)

It builds the macOS app on a tag push, generates updater metadata, and publishes release assets to GitHub Releases.

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

## Versioning

Release version numbers must stay aligned across:

- [package.json](/Users/john/Documents/Projects/HelixSetlistEditor/package.json)
- [src-tauri/Cargo.toml](/Users/john/Documents/Projects/HelixSetlistEditor/src-tauri/Cargo.toml)
- [src-tauri/tauri.conf.json](/Users/john/Documents/Projects/HelixSetlistEditor/src-tauri/tauri.conf.json)

Check alignment with:

```bash
npm run release:check -- v0.1.0
```

## File Format Notes

The app preserves these `.hls` invariants:

- `schema` remains valid for Helix setlists
- `compression.type` remains `zlib`
- `crc32` is computed from the decompressed inner JSON bytes
- `decompressed_size` exactly matches the decompressed byte length

The UI edits draft JSON. The codec layer rebuilds the `.hls` container on save.
