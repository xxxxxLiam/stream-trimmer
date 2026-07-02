# YouTube Clipper

Download a trimmed section (up to 10 minutes) of a YouTube video, fully on your own machine.

![screenshot](docs/screenshot.png)

## What it does

- Runs entirely locally — no accounts, no ads, no telemetry.
- Downloads **only** the time range you select, not the full video, via yt-dlp's `--download-sections`.
- Uses stream-copy in ffmpeg so trimming is near-instant and lossless.

## Quick start

```sh
git clone <your-fork-or-this-repo> youtube-clipper
cd youtube-clipper && npm install
npm run dev
```

Then open http://localhost:5173.

## Prerequisites

- **Node.js 18+** (see `.nvmrc`).

That's it. The `yt-dlp` and `ffmpeg` binaries are auto-installed as npm dependencies (`youtube-dl-exec`, `ffmpeg-static`) — no system-wide installs, no `brew`/`apt`/`winget` step.

## Usage

1. Paste a YouTube URL and press Enter (or blur the field).
2. Preview loads and the range slider unlocks with the video's real duration.
3. Drag the two handles to pick a start/end (max 10 minutes).
4. Click **Download clip** to save an `.mp4`.

## How it works

A minimal React SPA (Vite) talks to a local Express worker over `/api`. The worker shells out to the bundled `yt-dlp` binary with `--download-sections "*START-END"` and `--force-keyframes-at-cuts`, points `--ffmpeg-location` at the bundled `ffmpeg-static` binary, and streams the trimmed `.mp4` back to the browser. A single `npm run dev` starts both processes via `concurrently`.

## Legal & responsible use

This is a neutral, general-purpose tool. Use it only for content you own or have the rights to download — your own uploads, public-domain material, Creative Commons works, or clips you have permission to save. Respect [YouTube's Terms of Service](https://www.youtube.com/t/terms) and applicable copyright law. This project is built on the excellent [yt-dlp](https://github.com/yt-dlp/yt-dlp) — please read their notes on responsible use.

## Maintenance

Provided as-is and **unmaintained**. If yt-dlp/ffmpeg change behaviour or YouTube breaks things, fork the repo and update at your own discretion. Issues and PRs may not receive a response.

## License

[MIT](./LICENSE).