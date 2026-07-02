# YouTube Clipper

A fully local web app for downloading a trimmed section of a YouTube video.
The UI lives in `src/`, and the local Node backend lives in `server/`.

## Why doesn't the Lovable preview work?

The Lovable preview only serves the front-end. It cannot run `yt-dlp` or
`ffmpeg`, and it cannot host a long-running Node backend. This app is
designed to run **entirely on your own machine**. Clone the repo, install
the prerequisites below, and run `npm run dev` locally — the clipping UI
then works at `http://localhost:5173`.

## Prerequisites

Both binaries must be installed and available on your `PATH`:

### yt-dlp

- macOS: `brew install yt-dlp`
- Windows: `winget install yt-dlp`
- Linux: `pipx install yt-dlp` or your distro's package manager

### ffmpeg

- macOS: `brew install ffmpeg`
- Windows: `winget install Gyan.FFmpeg`
- Linux: `sudo apt install ffmpeg`

Verify both are available:

```sh
yt-dlp --version
ffmpeg -version
```

## Install and run

```sh
npm install
npm run dev
```

This starts:

- The web app on the Vite dev server
- The local Express backend on `http://localhost:5174`
- A Vite proxy from `/api` to the backend

## Usage

1. Paste a YouTube URL and press Enter, or click out of the field.
2. Preview the video and load its duration.
3. Select a start and end time with the range controls.
4. Click **Download clip** to download an `.mp4` clip.

## Notes

- Clips are capped at 10 minutes on both the client and backend.
- The backend uses `yt-dlp --download-sections` and `ffmpeg` locally.
- This backend is intended for local development because it shells out to native binaries.