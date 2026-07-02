# YouTube Clipper

A fully local web app to download a trimmed section of a YouTube video.
Front-end is a Vite + React SPA, back-end is a local Express server that
shells out to `yt-dlp` and `ffmpeg`. Both start from a single `npm run dev`.

## Prerequisites

Both binaries must be on your `PATH`:

### yt-dlp
- macOS:   `brew install yt-dlp`
- Windows: `winget install yt-dlp`
- Linux:   `pipx install yt-dlp` or your distro's package manager

### ffmpeg
- macOS:   `brew install ffmpeg`
- Windows: `winget install Gyan.FFmpeg`
- Linux:   `sudo apt install ffmpeg`

Verify:
```
yt-dlp --version
ffmpeg -version
```

## Install & run

```
cd youtube-clipper
npm install
npm run dev
```

This starts:
- Vite front-end on http://localhost:5173
- Express back-end on http://localhost:5174 (proxied through Vite at `/api`)

Open http://localhost:5173.

## Usage

1. Paste a YouTube URL and press Enter (or click out of the field).
2. The preview loads and the range slider bounds match the real duration.
3. Drag the two handles to pick a start/end window (max **10 minutes**).
4. Click **Download clip** — `yt-dlp --download-sections` fetches only that window and streams it back as an `.mp4`.

## Notes

- The 10-minute cap is enforced on both client and server.
- `yt-dlp` uses `--force-keyframes-at-cuts` and merges to `mp4`; trimming is near-instant and near-lossless.
- All processing is local. Nothing leaves your machine except the requests `yt-dlp` makes to YouTube.