# YouTube Clipper — Desktop app

A packaged Electron build of the app. Ships the entire stack — front-end,
backend, `yt-dlp`, and `ffmpeg` — in one installer. Users double-click to
launch; no terminal, no `npm`, no manual binary install.

## Build the installers (developer)

All tooling is free and open-source. No code-signing certificate is required.

```sh
# One-time
npm install

# Run the desktop app in dev (hot reload via Vite, Electron shell)
npm run dev:electron

# Produce installers for the current OS
npm run dist:mac    # -> dist-electron/YouTube Clipper-<version>.dmg
npm run dist:win    # -> dist-electron/YouTube Clipper Setup <version>.exe
```

`npm run dev` (browser-only workflow) still works and is unchanged.

## First launch (end user)

Because the installers are unsigned, the OS shows a one-time warning.

**macOS.** Right-click the app in `/Applications` → **Open** → **Open** in the
dialog. From then on it launches normally.

**Windows.** SmartScreen shows "Windows protected your PC" → click
**More info** → **Run anyway**. Once, then it launches normally.

Code-signing is optional and can be added later by populating the
`mac.identity` / `win.certificateFile` fields in `package.json`'s
`build` block. It is not required.

## What's inside the app

- Vite-built static front-end served locally by Electron (`file://`, no dev
  server ships).
- Express backend running in-process on a randomly-chosen loopback port
  (`127.0.0.1:<free>`), started and stopped with the app lifecycle. Exactly
  one instance thanks to Electron's single-instance lock.
- `ffmpeg` and `yt-dlp` binaries under `<app>/resources/bin/`. The server
  prefers those over any system install.

The app is 100% local. No telemetry, no cloud, no network beyond the
`yt-dlp` downloads it already performs.