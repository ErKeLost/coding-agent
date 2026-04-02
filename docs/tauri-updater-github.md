# Tauri Updater with GitHub Releases

This project now has the updater plugin wired in:

- Rust plugin registration in `src-tauri/src/lib.rs`
- Desktop capability in `src-tauri/capabilities/default.json`
- Updater artifact generation in `src-tauri/tauri.conf.json`
- Client-side update check in `components/desktop-update-check.tsx`

## What you still need before release

1. Generate an updater signing key pair.
2. Build with the updater signing env vars present.
3. Upload the generated updater artifacts to a GitHub Release.
4. Point the updater endpoint at your GitHub Release metadata file.

## Suggested environment variables

Set these before packaging:

```bash
export NEXT_PUBLIC_TAURI_UPDATER_ENABLED=1
export TAURI_UPDATER_PUBKEY="your updater public key"
export TAURI_UPDATER_ENDPOINT="https://github.com/ErKeLost/coding-agent/releases/latest/download/latest.json"
```

## Important packaging note

`src-tauri/tauri.conf.json` still points `frontendDist` to `../desktop-dist`, and that folder is currently a placeholder shell.

That means:

- updater support is now wired in
- but `desktop:build` still packages the placeholder frontend
- a real production desktop build still needs the Next.js desktop packaging strategy to be finished
