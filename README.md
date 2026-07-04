# YouTube Clipper

Download a trimmed section (up to 10 minutes) of a YouTube video — video or audio — fully on your own machine. Paste a link, pick a range, and save just the part you want. No accounts, no ads, no upload to anyone's server.

![screenshot](docs/screenshot.png)

## Download the app

The easiest way to use YouTube Clipper — no terminal, no setup.

1. Go to the [**Releases**](../../releases) page.
2. Download the latest build for your OS:
   - **macOS (Apple Silicon):** `YouTube Clipper-<version>-mac-arm64.dmg.zip`
   - **Windows:** `YouTube Clipper-<version>-win-x64.exe`
3. Open it and follow your OS's one-time prompt (the app is unsigned — this is normal for free open-source apps):
   - **macOS:** unzip, drag the app to Applications, then right-click it → **Open** → **Open**.
   - **Windows:** run the installer → if SmartScreen appears, click **More info** → **Run anyway**.

That's it — yt-dlp and ffmpeg are bundled inside the app, so there's nothing else to install.

## Features

- **Clip, don't download the whole thing.** Grabs only the time range you select (via yt-dlp's `--download-sections`), so a 5-minute clip from a 2-hour video downloads in seconds, not minutes.
- **Video or audio.** Export as **MP4** (video) or **MP3** (audio-only).
- **Quality control.** Pick resolution for video (up to 1080p) or bitrate for audio (up to 320 kbps).
- **Precise range selection** three ways: drag the dual-handle slider, type exact `HH:MM:SS` timestamps, or click lines in the transcript.
- **Transcript view.** Pull the video's captions for your selected range, search within them, and copy the text. Click any line to set it as your clip's start or end.
- **Choose where clips save** and name them automatically from the video title (desktop app).
- **Estimated file size.** See an approximate download size that updates as you change the range, format, and quality.
- **Runs 100% locally.** No accounts, ads, telemetry, or cloud — everything happens on your machine.

## Usage

1. **Paste** a YouTube URL and click **Search** (or press Enter). YouTube Shorts links work too.
2. The video loads and the range slider unlocks with the video's real length.
3. **Choose your clip range** — any of:
   - Drag the two slider handles, or
   - Type exact `HH:MM:SS` values in the Start / End fields (leave Start blank to begin from 0), or
   - Open the transcript and click a line to set it as the start or end.
4. Pick **Format** (MP4/MP3) and **Quality**. The estimated file size updates as you go.
5. Choose a **Save to** folder (desktop app), then click **Download** to save your clip.

> **Clip length is capped at 10 minutes.** Selections longer than that are blocked.

### Using the transcript

1. Click **View transcript** (above the preview). The video is replaced by the captions.
2. **Search** within the transcript using the search box.
3. **Click a line** to jump to it; use the inline **start/end** icons on a line to set that moment as your clip's start or end.
4. **Copy** grabs the transcript text for your selected range.

> Transcripts come from YouTube's auto-generated captions, so they may contain errors and lack punctuation. Not every video has captions available.

### About the file-size estimate

The size shown is an **estimate** (marked with `~`), calculated from the selected quality's bitrate and your clip length. The actual file may differ slightly — video bitrate varies moment to moment. MP3 estimates are more precise than MP4.

### A note on the video preview

Some creators disable embedded playback on their videos. When that happens the preview shows "Preview unavailable" — this is a YouTube setting, not an app error, and **it has no effect on downloading.** Clipping and downloading still work normally.

## Building from source

Only needed if you want to develop or build the app yourself.

### Run in dev (browser)

```sh
git clone <your-fork-or-this-repo> youtube-clipper
cd youtube-clipper
npm install
npm run dev
```

Then open **http://localhost:8080**. A single `npm run dev` starts the Vite front-end and the local worker together.

### Build the desktop app

```sh
npm run dist:mac     # macOS .dmg (run on a Mac)
npm run dist:win     # Windows .exe (run on Windows)
npm run dist:linux   # Linux AppImage
```

Installers are written to `dist-electron/`. Each OS's installer must be built on that OS (or via CI) — you can't cross-build a Windows `.exe` from macOS.

### Prerequisites (source builds only)

- **Node.js 18+** (see `.nvmrc`).
- **ffmpeg**, **yt-dlp**, and **deno** are downloaded and bundled automatically during the build (`scripts/bundle-binaries.cjs`). The packaged app ships them inside `Resources/bin`, so end users install nothing.

## How it works

A React single-page app (Vite + TypeScript) talks to a local Express worker. The worker runs **yt-dlp** to fetch just your selected section and **ffmpeg** to trim it, then delivers the file. In dev, both run via `npm run dev` on localhost. In the packaged desktop app, Electron serves the built front-end and runs the worker in-process on a private local port; yt-dlp, ffmpeg, and deno are bundled in the app and invoked directly (spaces in the install path are handled).

## Scripts

| Command                                        | What it does                                            |
| ---------------------------------------------- | ------------------------------------------------------- |
| `npm install`                                  | Installs dependencies and runs the setup check.         |
| `npm run setup`                                | Re-checks that yt-dlp and ffmpeg are available.         |
| `npm run dev`                                  | Dev mode (front-end + worker) at http://localhost:8080. |
| `npm run build`                                | Builds the front-end.                                   |
| `npm run dist:mac` / `dist:win` / `dist:linux` | Builds the packaged desktop installer for that OS.      |

## Troubleshooting

**Using the app:**

- **"Preview unavailable"** — the video owner disabled embedding. Downloading still works; ignore it.
- **"No transcript available"** — that video has no captions (or none in a supported language). A YouTube limitation, not a bug.
- **"yt-dlp failed" with details** — if YouTube changed something and the bundled yt-dlp is behind, grab the newest release build, which bundles an updated yt-dlp.

**Building from source:**

- **`✗ yt-dlp not found` in dev** — install it for your OS (macOS `brew install yt-dlp`, Windows `winget install yt-dlp.yt-dlp`, Linux `sudo apt install yt-dlp`), then `npm run setup`. The app auto-uses a system yt-dlp if the bundled one is missing.
- **`EADDRINUSE` (port in use)** — a previous dev run is still holding the port. Free it: `lsof -ti :5174 | xargs kill` (macOS/Linux), then `npm run dev`.
- **A binary silently failed to download during build** — run `npm install --foreground-scripts` to see the output.

## Legal & responsible use

This is a neutral, general-purpose tool. Use it only for content you own or have the rights to download — your own uploads, public-domain material, Creative Commons works, or clips you have permission to save. Respect [YouTube's Terms of Service](https://www.youtube.com/t/terms) and applicable copyright law. Built on the excellent [yt-dlp](https://github.com/yt-dlp/yt-dlp) — please read their notes on responsible use.

## Maintenance

Provided as-is and **unmaintained**. If yt-dlp/ffmpeg change behaviour or YouTube breaks things, fork the repo and update at your own discretion. Issues and PRs may not receive a response.

## Releasing new versions (auto-update)

The desktop app auto-updates via `electron-updater`, reading from this repo's
GitHub Releases. Each release must contain the platform installer **plus** the
matching metadata file that `electron-builder` uploads:

- Windows: `latest.yml`
- macOS: `latest-mac.yml`
- Linux: `latest-linux.yml`

Without those `.yml` files the app cannot detect a new version.

### Recommended: cut a release via GitHub Actions (free, native builds)

The workflow at `.github/workflows/release.yml` runs on tag push and builds
native installers on their own OS runners in parallel:

- `macos-latest` → `YouTube-Clipper-<version>-macOS-AppleSilicon.dmg` (arm64)
- `windows-latest` → `YouTube-Clipper-<version>-Windows-x64-Setup.exe`
- `ubuntu-latest` → `YouTube-Clipper-<version>-Linux-x64.AppImage`

It publishes to the matching GitHub Release using the built-in
`GITHUB_TOKEN` — no personal access token needed.

Steps:

1. Bump `version` in `package.json` (e.g. `1.0.0` → `1.0.1`) and commit.
2. Tag and push:

   ```sh
   git tag v1.0.1
   git push origin main --tags
   ```

3. Watch the **Actions** tab. When all three jobs finish, the release
   appears on the **Releases** page with all three installers and the
   matching `latest.yml` / `latest-mac.yml` / `latest-linux.yml` metadata
   files that `electron-updater` reads.

The tag's `v` prefix (`v1.0.1`) must match the `version` in `package.json`
(`1.0.1`) — `electron-builder` uses the `package.json` version for the
release name.

### Optional fallback: build locally

Only needed if CI is unavailable. Build the installer for **the OS you're
on** — you cannot cross-build (that's the bug this workflow exists to
prevent). Requires a GitHub PAT with `repo` scope as `GH_TOKEN`:

```sh
export GH_TOKEN=ghp_your_token_here
npm run release:mac     # on macOS (arm64 only)
npm run release:win     # on Windows (x64)
npm run release:linux   # on Linux (x64)
```

### Platform notes

- **Windows (NSIS)** — auto-update works unsigned; users see a one-time
  SmartScreen prompt on first install.
- **Linux (AppImage)** — auto-update works unsigned. The app must have been
  launched from an AppImage file.
- **macOS (DMG)** — auto-update requires the app to be **signed AND
  notarized**. Until an Apple Developer certificate is configured, mac users
  will see an update notification but the install will fail; they need to
  download the new DMG manually from the Releases page. The app handles this
  gracefully — it does not crash.

## License

[MIT](./LICENSE).
