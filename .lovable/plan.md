
## Analysis

- **Packaged app fails, terminal works** → environment gap. Terminal has `deno` on PATH; packaged Electron spawns yt-dlp with a stripped PATH, so yt-dlp's `[jsc:deno]` step can't solve YouTube's JS challenge and exits with a non-zero code. The generic "yt-dlp failed" message hides the real stderr.
- **Real errors hidden** → `errMessage()` exists but the `exec` path in `/api/download` only rejects with `"yt-dlp exited with code N"`; stderr is consumed by the progress parser and never captured for the error path.
- **MP4 that's actually WebM** → format string `bv*+ba/b` lets yt-dlp pick AV1 (`.webm`) + Opus; muxing into `.mp4` yields a mislabeled/broken file on some players. Need MP4-first codec preference (H.264/AVC + AAC) with graceful fallback and matching container.
- **Shorts** → `extractVideoId` already recognizes `shorts`, but yt-dlp URL and the preview iframe use the raw URL; normalizing to `watch?v=ID` avoids edge cases in both places.
- **Preview iframe "Error 150"** → embedding disabled by owner. It's a preview-only signal and must not look like a download error.

## Action plan

1. **Bundle deno with the app** so yt-dlp can solve JS challenges offline.
   - `scripts/bundle-binaries.cjs`: download the correct deno release for the target platform (darwin-x64/arm64, win32-x64, linux-x64) into `resources/bin/deno[.exe]`. Cache in `resources/bin/.cache/` to avoid re-downloading. chmod +x on unix.
   - `electron/main.cjs`: before starting the backend, prepend `<resources>/bin` to `process.env.PATH` so any child process (yt-dlp) inherits it and finds `deno`.
   - `server/index.ts`: also prepend `resources/bin` to PATH when running under Electron (defense in depth), and pass it explicitly to yt-dlp child env.
   - Bump `yt-dlp` bundling to always fetch the latest release binary in `bundle-binaries.cjs` (replace `youtube-dl-exec`'s stale bundled binary with a fresh download from the yt-dlp GitHub releases). Cache by version tag.

2. **Surface real yt-dlp errors** in `server/index.ts`:
   - In `/api/download`, capture the tail of stderr while parsing progress; on non-zero exit reject with the trimmed stderr (last ~40 lines).
   - `/api/info` and `/api/transcript` already use `errMessage`; ensure the message includes stderr from `youtube-dl-exec` errors (it does — verify).
   - Log the actual command failure to the Electron main-process console so packaged-app diagnostics are visible in the OS log.

3. **Real MP4 selection** in `/api/download`:
   - For `mp4`, use: `bestvideo[ext=mp4][vcodec^=avc1][height<=CAP]+bestaudio[ext=m4a]/best[ext=mp4][height<=CAP]/best[height<=CAP]` (drop the height clause when quality is `best`).
   - Keep `mergeOutputFormat: "mp4"`.
   - MP3 path unchanged.

4. **Shorts + URL normalization** in `src/lib/clip.ts`:
   - Add `normalizeYouTubeUrl(url)` → converts `youtube.com/shorts/ID`, `m.youtube.com/shorts/ID`, `youtu.be/ID` to canonical `https://www.youtube.com/watch?v=ID` (preserves `t=` if present).
   - `useClipper`: normalize before calling `/api/info` and `/api/download`.
   - `PreviewPanel`: iframe already uses `videoId`, no change needed, but confirm `extractVideoId` handles `shorts`.
   - Server `urlSchema`: keep permissive YouTube host check; normalization happens client-side.

5. **Graceful preview when embed is blocked** in `PreviewPanel.tsx`:
   - Attach `onError` and a `postMessage` listener for YouTube iframe API error 150/101; on error, replace iframe with a small "Preview unavailable — video owner disabled embedding. Download still works." card. Text is clearly separate from download state.

6. **Verify** in the packaged app: normal video downloads; MP4 opens in QuickTime/VLC as H.264/AAC; MP3 plays; a Shorts URL fetches info, previews, and clips end-to-end; a forced failure (bad URL) surfaces yt-dlp's real stderr; embed-disabled video shows the preview fallback but downloads succeed.

## Files touched

- `scripts/bundle-binaries.cjs` — add deno download + fresh yt-dlp download.
- `electron/main.cjs` — prepend `<resources>/bin` to `PATH` before backend start.
- `server/index.ts` — PATH injection, real stderr on `/api/download`, MP4 format string.
- `src/lib/clip.ts` — `normalizeYouTubeUrl`, Shorts handling.
- `src/hooks/useClipper.ts` — call `normalizeYouTubeUrl` before requests.
- `src/components/PreviewPanel.tsx` — embed-error fallback UI.

## Verification checklist

- Packaged `.dmg`/`.exe` downloads a standard video without needing user-installed deno/yt-dlp/ffmpeg.
- `ffprobe` on the MP4 output reports `h264` + `aac` in an `mp4` container.
- MP3 output is valid MPEG audio.
- `https://youtube.com/shorts/<id>` normalized → info+preview+download all work.
- Bad URL returns yt-dlp's actual error string in the toast/error panel.
- Embed-blocked video: preview shows fallback text; download still succeeds.
