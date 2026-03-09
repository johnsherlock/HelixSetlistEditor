# Beta Release Checklist

## One-time setup

1. Keep the updater private key safe.
2. Add these GitHub repository secrets:
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
3. The matching public updater key is already wired into:
   - `src-tauri/tauri.conf.json`

## Per release

1. Bump the version in:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
2. Run:

```bash
npm install
npm run release:check -- vX.Y.Z
npm test
npm run build
```

3. Commit the version bump.
4. Create and push a tag:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

5. GitHub Actions will publish:
   - the `.dmg`
   - the updater `.app.tar.gz` and `.sig`
   - `latest.json`
   - a generated Homebrew cask file

## Homebrew tap update

1. Copy the generated `release/helix-setlist-editor.rb` into your public tap repo:
   - `Casks/helix-setlist-editor.rb`
2. Commit and push the tap update.

## Unsigned beta install note

This app is currently unsigned and not notarized.

Users installing directly from the `.dmg` or via Homebrew may need to:

1. open Finder
2. right-click `Helix Setlist Editor.app`
3. choose `Open`
4. confirm the Gatekeeper prompt
