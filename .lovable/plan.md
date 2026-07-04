# Auto-updates via electron-updater + GitHub Releases

Wire up free auto-updates using `electron-updater` (from electron-builder) with GitHub Releases as the host for `xxxxxLiam/stream-trimmer`.

## Files changed

### 1. `package.json`
- Add dependency: `electron-updater` (runtime dep, required by main process).
- Add `build.publish`:
  ```json
  "publish": { "provider": "github", "owner": "xxxxxLiam", "repo": "stream-trimmer", "releaseType": "release" }
  ```
- Add scripts:
  - `release`: `npm run build:electron && electron-builder -mwl --publish always` (or per-OS variants below)
  - `release:mac`: `npm run build:electron && electron-builder --mac dmg --publish always`
  - `release:win`: `npm run build:electron && electron-builder --win nsis --publish always`
  - `release:linux`: `npm run build:electron && electron-builder --linux AppImage --publish always`
- Keep existing `dist:*` scripts unchanged (local unpublished builds).
- No changes to targets: mac dmg/arm64, win nsis/x64, linux AppImage — all support electron-updater.

### 2. `electron/main.cjs`
- Import `autoUpdater` from `electron-updater` and `dialog`, `ipcMain` (already imported).
- Guard with `if (!isDev)` so dev runs don't hit GitHub.
- Configure:
  - `autoUpdater.autoDownload = true`
  - `autoUpdater.autoInstallOnAppQuit = true`
  - `autoUpdater.logger = console`
- After `createWindow`, call `autoUpdater.checkForUpdatesAndNotify()`.
- Wire events, each forwards a status payload to the renderer via `mainWindow.webContents.send('updater:status', {...})` and logs:
  - `checking-for-update` → status "checking"
  - `update-available` → status "available" + version
  - `update-not-available` → status "none"
  - `download-progress` → status "downloading" + percent
  - `update-downloaded` → status "ready"; show `dialog.showMessageBox` with "Restart now" / "Later"; on Restart call `autoUpdater.quitAndInstall()`.
  - `error` → status "error" + message; on macOS unsigned builds this will fire ("Could not get code signature"); swallow gracefully and forward a "manual download" hint instead of crashing.
- Add IPC handlers:
  - `ipcMain.handle('updater:check', () => autoUpdater.checkForUpdates())`
  - `ipcMain.handle('updater:quitAndInstall', () => autoUpdater.quitAndInstall())`

### 3. `electron/preload.cjs`
- Extend `electronAPI` with:
  - `checkForUpdates()` → invokes `updater:check`
  - `quitAndInstall()` → invokes `updater:quitAndInstall`
  - `onUpdateStatus(cb)` → subscribes to `updater:status` channel, returns unsubscribe fn.

### 4. `src/components/UpdateStatus.tsx` (new)
- Small pill in the title bar area listening to `window.electronAPI.onUpdateStatus`.
- States: hidden (idle/none), "Checking…", "Downloading update… 42%", "Update ready — Restart", "Update check failed — download manually" (with link to Releases).
- "Check for updates" button and "Restart" button use existing dark theme tokens (`bg-panel`, `text-fg`, `accent`).
- Only renders when `window.electronAPI?.isElectron` is true.

### 5. `src/App.tsx`
- Mount `<UpdateStatus />` inside the existing title bar row (right side, near "Local · Private").

### 6. `src/vite-env.d.ts`
- Extend the `electronAPI` type declaration with the new methods and status payload type.

### 7. `README.md`
- Add a "Releasing new versions" section covering: bump `version` in `package.json`, set `GH_TOKEN` env var (GitHub PAT with `repo` scope, from https://github.com/settings/tokens), run `npm run release:<os>` on the matching OS, verify the GitHub Release is published (not draft) and contains the installer plus `latest.yml` / `latest-mac.yml` / `latest-linux.yml`. Note macOS auto-update requires signing + notarization; until then, mac users update manually.

## Technical notes

- `electron-updater` reads `latest.yml` / `latest-mac.yml` / `latest-linux.yml` from the GitHub Release matching the current app version. electron-builder generates and uploads these when `--publish always` is used.
- Windows NSIS: auto-update works unsigned (SmartScreen warning on first install only).
- Linux AppImage: auto-update works unsigned; requires the app was launched from an AppImage file (electron-updater detects `APPIMAGE` env var).
- macOS: `dialog` error path is handled so the app doesn't crash; without signing + notarization the update will fail to apply and the user is told to download manually.
- Dev guard: `isDev` (already defined via `ELECTRON_DEV=1`) prevents update checks during `npm run dev:electron`.
- No changes to server, yt-dlp, ffmpeg, transcript, or download flows.

## What you'll do manually

1. Bump `version` in `package.json` for each release (e.g. `1.0.1`).
2. Create a GitHub PAT with `repo` scope → export `GH_TOKEN=ghp_...` in your shell before running `npm run release:*`.
3. Run the release command on the matching OS (mac build on Mac, win on Windows, linux on Linux — or via CI).
4. On GitHub, verify the release is published (electron-builder creates it as draft by default; either flip it to published, or set `releaseType: "release"` as above — plan uses the latter so it publishes immediately).
