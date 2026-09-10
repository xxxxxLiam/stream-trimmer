# Resume failed downloads and exports

Right now every clip download and every channel export starts in a fresh temporary folder that is deleted the moment anything goes wrong. Nothing partial is ever kept, so a failure at 90% costs you the whole run. This adds a resume cache to both.

The finished file you already saved is never touched — resuming only ever works inside a private work folder, and the result is only moved into your save folder once it is complete.

## Clip downloads

- Each download gets a stable work folder based on the video, format, quality and the exact time range you picked, instead of a random one-off folder.
- yt-dlp keeps its partial file there and is told to continue where it stopped, so a retry picks up the already-downloaded bytes.
- On failure the work folder is kept, not wiped. On success the finished clip is moved into place and the work folder is cleared.
- If you retry the same clip with the same settings, the app says "Resuming — 62% already downloaded" instead of starting over. Changing quality, format or the time range starts a clean download, since the partial data no longer matches.

## Channel exports

- Each export gets a work folder based on the channel and your chosen options (content type, count, comments/transcripts on or off).
- After each video is scraped, its rows (metadata, comments, transcript) are appended to a checkpoint file on disk instead of only living in memory.
- If the export fails, is cancelled, or the app closes, restarting the same export skips every video already in the checkpoint and continues from the next one. Progress shows "Resuming — 34 of 100 already collected".
- The CSVs are still built from the full combined set at the end, so a resumed export produces exactly the same output as an uninterrupted one.
- Finishing an export clears its checkpoint.

## Managing the cache

- A line in the Downloads tab shows how much space unfinished work is using, with a "Clear unfinished downloads" button.
- Anything untouched for 7 days is cleaned up automatically on launch.

## Technical notes

- Work folders live under Electron `userData/cache/` (dev falls back to the OS temp dir), named `clip-<sha1>` / `chan-<sha1>` where the hash covers the resume-relevant inputs.
- Clip path: replace `mkdtempSync` in `/api/download` with the keyed folder; add `continue: true` and drop `noPart` behaviour so `.part` files survive; keep `cleanup()` on success and on explicit user cancel only.
- The whole-file fallback (`source.mp4`) benefits most from `--continue`; the `--download-sections` attempt resumes only when yt-dlp wrote a `.part`, otherwise it re-runs — acceptable, since sectioned downloads are short.
- Export path: `videos`/`comments`/`transcripts` arrays in `/api/channel/export` gain a JSONL sidecar per kind; on start, read the sidecar, build a `Set` of completed video ids, and filter the work list before `mapLimit`. Ranking still runs on the full metadata pass so the top-N set stays stable.
- New endpoints: `GET /api/cache/usage` and `POST /api/cache/clear`; wired into `DownloadsPanel.tsx`.
- Staleness sweep runs once at server start.
