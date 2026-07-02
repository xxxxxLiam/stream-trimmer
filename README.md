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
cd youtube-clipper
npm install
npm run dev
```
