# Plan — 4 improvements

## Analysis

**Jump bug**: `handleRowJump` in `PreviewPanel.tsx` calls `setTranscriptQuery("")` then a `requestAnimationFrame` scroll. When search is active, `displayTranscript` was filtered, so `rowRefs.current[index]` points to the wrong element (or is remounted after query clear). Result: it scrolls to top.

**Download flow**: `useClipper.download()` does one `fetch('/api/download')`, awaits the blob, then triggers an `<a download>`. Backend `/api/download` awaits `yt.run(...)` then streams the file. No progress signal exists — overlay is a spinner.

**Filename**: server sets `clip-<hex>.<ext>`; client's `<a download>` overrides with `clip-HHMMSS-HHMMSS.<ext>`. Title unused.

**Save destination**: browser uses anchor download (Downloads folder). Electron: no IPC for dialogs yet; preload only exposes `__API_BASE__`.

## Action plan

1. **Jump fix** (`PreviewPanel.tsx`): introduce `pendingScrollId` state; on row click set it and clear search; a `useEffect` watching `pendingScrollId` + `transcriptQuery === ""` runs after re-render, resolves the row via a stable id→ref map, `scrollIntoView({block:"center"})`, triggers the flash, clears `pendingScrollId`.

2. **Download progress**:
   - Backend: assign `jobId`, register in-memory `Map<jobId, {clients:Response[], percent, phase}>`. Add `GET /api/download/progress?jobId=…` (SSE). In `/api/download`, spawn yt-dlp via `create(...).exec(url, opts)` returning a `ChildProcess`; parse stderr/stdout `[download]\s+(\d+\.\d+)%`. Emit progress. When yt-dlp exits, set `phase:"processing"`, then stream file and emit `phase:"done"` on stream close. Normalize multi-pass: track max percent, reset detection via "Destination:" line resets not needed — clamp monotonic-per-pass then compute `overall = 0.5*firstPass + 0.5*secondPass` or simpler: run count passes and map. Simpler: just show latest percent and let it "reset"; use monotonic max across the whole job for the bar.
   - Client: `useClipper.download()` generates a `jobId` (crypto.randomUUID), opens `EventSource` before POSTing, updates `downloadProgress`+`downloadPhase`, closes ES when done or on error.
   - UI: `OverlayLoader` gains optional `progress` (0-100) + `phase` ("downloading"|"processing"|"done"); renders determinate bar or shimmer for processing.

3. **Filename**:
   - Add `sanitizeFilename(title)` in `src/lib/clip.ts`: strip `/\\:*?"<>|`, collapse whitespace, trim to 120 chars, fallback `clip`.
   - Build `${safe} [${hhmmss(start)}-${hhmmss(end)}].${ext}` with `:`→`-`.
   - Use for browser anchor and Electron save default.

4. **Destination selector**:
   - `electron/preload.cjs`: `contextBridge.exposeInMainWorld('electronAPI', { pickDirectory, saveFile, isElectron:true })`.
   - `electron/main.cjs`: `ipcMain.handle('dialog:pickDirectory', ...)` → `dialog.showOpenDialog({properties:['openDirectory']})`. `ipcMain.handle('file:save', async (_e, {dirPath, filename, arrayBuffer}) => fs.writeFile(...))`.
   - New component `DestinationSelector.tsx` in the form column: shows chosen folder (persisted in `localStorage` key `clipper.saveDir`), "Change…" button. Hidden in browser (no `window.electronAPI`).
   - `useClipper.download()`: if `window.electronAPI?.isElectron` → fetch blob → `arrayBuffer()` → `electronAPI.saveFile({dirPath, filename, arrayBuffer})`. Else → anchor download with sanitized filename.

## Technical details

- Backend progress state cleaned up on job completion (setTimeout 30s).
- SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`; flush after each write.
- yt-dlp progress via `youtube-dl-exec` `exec()` (non-promise) — subscribe to `child.stderr.on('data')` and `child.stdout.on('data')`. Match `/(\d+(?:\.\d+)?)%/`.
- Multi-pass normalization: track `passCount` incremented on each "Destination:" line; `overall = ((passCount-1) + latestPercent/100) / expectedPasses` where `expectedPasses = isAudio || quality==='best' ? 2 : 2` (video+audio). Fall back to raw latest if unsure. Clamp `0..99` until done event.
- Preload uses `ipcRenderer.invoke` via contextBridge — no nodeIntegration, sandbox remains true. Note: sandbox:true still allows `contextBridge` and `ipcRenderer.invoke` in preload.
- Verify: click transcript row while searching → search clears, that exact line centers with flash; download shows moving bar → "Finishing up…" → file saves as `Video Title [00:00:10-00:00:30].mp4`; Electron picker opens & persists; browser hides selector.

Proceeding to implementation.
