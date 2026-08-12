# Fix the preview + turn it into a scrubbing / in-out tool

## Why the preview is blank today

In development the UI is served from `http://localhost:8080`, so the YouTube embed gets a real origin and plays. In the installed desktop app the UI is loaded straight off disk (`file://`), so the iframe origin is `null`. YouTube's embed player rejects null-origin frames and the `enablejsapi` handshake never completes, so the frame stays empty even for videos that allow embedding. This is not a per-video setting — it affects every video in the packaged app.

## What will change

### 1. Serve the packaged UI over local HTTP
The app already runs a local Express worker. The built UI will be served from that same server, and the desktop window will load `http://127.0.0.1:<port>` instead of the file path. The embed then behaves exactly as it does in dev. Nothing about privacy changes — the server is local-only.

### 2. Thumbnail fallback
When YouTube genuinely blocks embedding (error 101/150/153), show the video thumbnail with a play overlay that opens the video in the default browser, instead of the current plain "Preview unavailable" message. Same fallback covers the case where the player fails to initialise.

### 3. Player becomes a real clip tool
Load the YouTube IFrame API properly and drive the player from the app:

- Live playhead readout under the video.
- "Set start" / "Set end" buttons that capture the current playhead into the range, with keyboard shortcuts (`I` / `O`).
- Range slider, transcript highlight, and player stay in sync: dragging a handle or clicking a transcript line seeks the player.
- "Play selection" button that plays only start to end and loops.
- Scrub bar overlay showing the selected range on the video timeline.

All existing behaviour (transcript, download, comment export, 10-minute cap) stays as is.

## Technical notes

- `electron/main.cjs`: add a static handler for `dist/` on the existing Express server; `createWindow` loads `http://127.0.0.1:${port}` in production. Keep `loadFile` as an emergency fallback if the server is unreachable.
- `vite.config.ts`: `base` stays relative-safe; served over HTTP so absolute paths work either way.
- New `src/hooks/useYouTubePlayer.ts`: loads `https://www.youtube.com/iframe_api`, creates the player, exposes `seekTo`, `getCurrentTime`, `play/pause`, and an error callback for 101/150/153.
- New `src/components/PlayerControls.tsx`: playhead, set-in/set-out, play-selection.
- `src/components/PreviewPanel.tsx`: replace the raw iframe + postMessage handshake with the hook; add thumbnail fallback (`https://img.youtube.com/vi/<id>/hqdefault.jpg`).
- `src/hooks/useClipper.ts`: expose `setStartFromSeconds` / `setEndFromSeconds` and a seek request channel so transcript clicks drive the player.
- Bump `package.json` version.

## Verification

- Dev preview: player loads, set-in/out updates the range, play-selection loops.
- Packaged build: confirm the window loads over `127.0.0.1` and the embed renders.
