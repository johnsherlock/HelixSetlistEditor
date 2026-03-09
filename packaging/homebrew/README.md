# Homebrew Tap Notes

This repo does not publish directly to a Homebrew tap by itself.

The release workflow generates a ready-to-commit cask file at:

- `release/helix-setlist-editor.rb`

That generated file should be copied into your separate tap repo, for example:

- `homebrew-tap/Casks/helix-setlist-editor.rb`

Recommended beta install command once the tap exists:

```bash
brew tap johnsherlock/tap
brew install --cask helix-setlist-editor
```
