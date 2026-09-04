# Drag clips straight out of the app

Yes — this is possible. Electron has a native API (`webContents.startDrag`) that hands a real file to the operating system, so dragging out of the app is indistinguishable from dragging out of Finder or File Explorer. Premiere, Resolve, Final Cut, CapCut, a folder window — anything that accepts a dropped file will accept this.

## What you'll be able to do

- **From the "Clip saved" pop-up**: grab the file thumbnail on the left of the toast and drag it directly into your editor. The toast already stays open until you dismiss it, so it doubles as a drag holster.
- **From the Downloads tab**: every row in the history becomes draggable too, so you can pull out a clip you saved yesterday without hunting for the folder.
- The file still lives wherever you chose to save it. Dragging copies it into the target app exactly like a Finder drag — it does not move or delete your saved copy.
- "Open folder" stays where it is, for when you actually want the folder.

## What it looks like

```text
+-------------------------------------------------+
|  [====]   Clip saved                            |
|  [ 00 ]   my-video 01-30 to 02-45.mp4           |
|  [====]   1080p - 12.4 MB                       |
|   drag        [ Open folder ]  [ x ]            |
+-------------------------------------------------+
     ^
     grab here and drag into your editor
```

The thumbnail gets a subtle grab cursor and a "Drag to your editor" tooltip. While dragging, the row dims slightly so it's clear something is in flight.

## Limits worth knowing

- This only works in the installed desktop app. In a plain browser tab the operating system won't accept a file drag from a web page, so the drag handle is simply hidden there and nothing changes.
- If the file has since been moved or deleted outside the app, the drag does nothing. The row will show a dimmed "file missing" state instead of a drag handle, with the option to remove it from history.

## Technical notes

- `electron/main.cjs` gains an `ipcMain.on("file:startDrag", ...)` listener calling `event.sender.startDrag({ file, icon })`. It must use `ipcMain.on` (not `handle`) because `startDrag` has to run synchronously inside the drag gesture. The handler first `fs.existsSync`-checks the path and no-ops if the file is gone.
- The drag icon is required — on Windows a missing or empty icon makes the drag silently fail. For video files the handler uses `nativeImage.createThumbnailFromPath(filePath, { width: 96, height: 96 })` inside a try/catch, falling back to the bundled `electron/icon.png` (already present for the splash screen) resized to 64x64 when thumbnailing isn't supported for that type (for example MP3 and CSV).
- `electron/preload.cjs` exposes `startDrag: (filePath) => ipcRenderer.send("file:startDrag", filePath)` on `electronAPI`, and the type is added to the `ElectronAPI` interface in `src/vite-env.d.ts`.
- A shared `src/components/DragOutHandle.tsx` renders the thumbnail-sized grab target. Its `onDragStart` calls `e.preventDefault()` then `window.electronAPI.startDrag(path)` — preventDefault is required so Chromium's own HTML5 drag doesn't take over and cancel the native one. It renders `null` when `!isElectron` or the path is empty.
- Wired into `SavedToast` in `src/App.tsx` (using `savedNotice.path`) and into each row of `src/components/DownloadsPanel.tsx` (using `DownloadEntry.path`). No changes to the download pipeline, the settings store, or the history schema.
- Existence checking for the "file missing" state reuses a new lightweight `file:exists` IPC handle, called once when the Downloads panel mounts rather than per render.
