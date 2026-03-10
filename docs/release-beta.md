# Beta Release Checklist

## One-time setup

1. Keep the updater private key safe.
2. Add these GitHub repository secrets:
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
3. The matching public updater key is already wired into:
   - `src-tauri/tauri.conf.json`

## Merge to main

Every merge to `main` now runs GitHub Actions CI:

- version sync check
- TypeScript type-check
- Vitest suite
- frontend build
- native Rust/Tauri tests

That validates the app continuously, but it does **not** publish a release.

## Per release

1. Bump the version in:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
2. Commit and merge the version bump to `main`.
3. Create and push a tag from that released commit:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

4. GitHub Actions will publish:
   - the `.dmg`
   - the updater `.app.tar.gz` and `.sig`
   - `latest.json`

## Unsigned beta install note

This app is currently unsigned and not notarized.

Users installing directly from the `.dmg` may need to:

1. open Finder
2. right-click `Helix Setlist Editor.app`
3. choose `Open`
4. confirm the Gatekeeper prompt
