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

1. Prepare the release commit and tag:

```bash
npm run release:prepare -- patch
```

This command will:
- bump `package.json`
- bump `package-lock.json`
- bump `src-tauri/Cargo.toml`
- bump `src-tauri/tauri.conf.json`
- create a commit
- create the matching git tag

2. Push the commit and tag:

```bash
git push origin main
git push origin vX.Y.Z
```

3. GitHub Actions will publish:
   - the `.dmg`
   - the Windows `.msi`
   - the updater `.app.tar.gz` and `.sig`
   - `latest.json`

## Unsigned beta install note

This app is currently unsigned and not notarized.

Users installing directly from the `.dmg` may need to:

1. open Finder
2. right-click `Helix Setlist Editor.app`
3. choose `Open`
4. confirm the Gatekeeper prompt

## Windows beta note

- The Windows release is distributed as an `.msi`.
- The first Windows beta intentionally disables setlist deletion until recycle-bin support is implemented natively.
