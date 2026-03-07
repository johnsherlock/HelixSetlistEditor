# Helix Setlist Editor

Helix Setlist Editor is a local web app for working with Line 6 Helix setlist files (`.hls`) outside HX Edit.

The goal of the project is to make Helix setlists editable as normal application data: open a setlist, inspect it, reorder presets, insert presets from exported `.hlx` files, remove presets, and save a valid `.hls` file that Helix can import.

## Intent

This project exists to provide a practical setlist workflow for Helix users who want more control than HX Edit offers for bulk organization and file-based editing.

The app is built around a few verified assumptions:

- A `.hls` file is a JSON wrapper around base64-encoded, zlib-compressed inner JSON.
- The inner JSON contains the real setlist data.
- A valid `.hls` can be rebuilt by recompressing the inner JSON and recalculating `crc32` and `decompressed_size`.
- Real-world round-trip import back into Helix has already been proven.

## Current Functionality

The current app supports:

- Loading a Helix home directory with `/Setlists` and `/Presets`
- Listing available `.hls` setlists and `.hlx` presets
- Loading an existing setlist into the editor
- Editing the setlist name
- Dirty-state tracking with save/discard prompts
- Saving a setlist in place
- Saving a setlist as a copy
- Deleting a setlist from the UI with confirmation and file deletion on disk
- Filtering presets by name
- Dragging a preset from the preset library into the setlist
- Reordering presets inside the setlist
- Removing presets from the setlist with upward shift
- Keeping the setlist fixed at 128 slots
- Rebuilding valid `.hls` files through a separate codec layer

## In Progress / Planned

The next major feature is:

- Creating a brand new setlist safely

This is intentionally deferred until the project locks a reliable blank/template strategy for unused preset slots and empty setlists.

Likely follow-on work:

- Better drag/drop polish
- More fixture coverage across real `.hlx` and `.hls` samples
- Undo/redo
- Richer metadata editing
- Deeper preset inspection

## Tech Stack

The app is split into a few small layers:

- `TypeScript`: shared language across backend, frontend, and codec logic
- `React`: local web UI
- `Vite`: frontend development and production build
- `Fastify`: local backend API for filesystem access and JSON endpoints
- `Vitest`: unit and integration tests
- `Node.js`: runtime for the codec and local server

## Architecture

The codebase is organized to keep file-format logic separate from UI concerns.

- [`src/core`](/Users/john/Documents/Projects/HelixSetlistEditor/src/core): `.hls` codec, decode/rebuild/validation logic
- [`src/domain`](/Users/john/Documents/Projects/HelixSetlistEditor/src/domain): pure setlist editing operations such as insert, move, and remove
- [`src/io`](/Users/john/Documents/Projects/HelixSetlistEditor/src/io): filesystem-backed Helix library services
- [`src/server`](/Users/john/Documents/Projects/HelixSetlistEditor/src/server): Fastify API and local static serving
- [`web/src`](/Users/john/Documents/Projects/HelixSetlistEditor/web/src): React UI
- [`tests`](/Users/john/Documents/Projects/HelixSetlistEditor/tests): codec, domain, and API tests

## Development

Install dependencies:

```bash
npm install
```

Type-check the project:

```bash
npm run typecheck
```

Run the test suite:

```bash
npm test
```

Build the server and frontend:

```bash
npm run build
```

Run the compiled app:

```bash
npm start
```

If port `3000` is already in use:

```bash
PORT=3001 npm start
```

For frontend iteration with Vite:

```bash
npm start
npm run dev:web
```

## File Format Notes

The `.hls` handling code is designed around these invariants:

- `schema` must remain valid for Helix setlists
- `compression.type` must be `zlib`
- `crc32` is computed from the decompressed inner JSON bytes
- `decompressed_size` must exactly match the decompressed byte length

That means UI operations do not write `.hls` files directly. They modify draft data, and the codec layer rebuilds the container correctly when saving.
