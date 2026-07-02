## Why you're seeing this error

The Lovable preview only runs the Vite/React front-end. It does **not** run the local Express backend (`server/index.js`) — and it can't, because Lovable's hosted preview has no `yt-dlp` or `ffmpeg` binaries and no long-running Node process.

So when the UI calls `POST /api/info`, there is no `/api/info` route in the preview. The preview server returns its SPA 404 HTML page, the browser tries to `JSON.parse("<!DOCTYPE ...")`, and you get:

> Unexpected token '<', "<!DOCTYPE "... is not valid JSON

This is expected. **This app is designed to run on your own machine only** — that was the original brief ("100% locally, MUST NOT introduce serverless/hosted backend").

## Plan

I'll make two small changes so the app behaves correctly, then hand it off for local use.

### 1. Detect the Lovable preview and show a clear message
In `src/routes/index.tsx`:
- On mount, detect if the host is not `localhost` / `127.0.0.1`.
- If so, render a minimalist banner above the UI:
  > "This app requires the local backend (yt-dlp + ffmpeg). Run `npm run dev` on your machine and open http://localhost:5173."
- Disable the URL input + Download button in that case, so no one can trigger the broken fetch.

### 2. Make the fetch error human-readable when it does fire
Wrap the `/api/info` and `/api/download` fetches so that:
- If the response `content-type` is not JSON, we throw a friendly error ("Backend not reachable — is `npm run dev` running?") instead of the raw `JSON.parse` crash.

### 3. README clarification
Add a short "Why doesn't the Lovable preview work?" note at the top of `README.md` explaining that the preview is front-end only and the app must be cloned/run locally.

### Files touched
- `src/routes/index.tsx` — env detection banner + safer fetch wrappers
- `README.md` — preview-vs-local clarification

No backend, styling, or feature changes. The 10-minute cap, black/white theme, single `npm run dev`, and local yt-dlp/ffmpeg pipeline all stay exactly as-is.

### To actually use the app
On your own machine:
```
git clone <this repo>
cd <repo>
npm install
npm run dev
```
Then open http://localhost:5173 — that's where clipping works.
