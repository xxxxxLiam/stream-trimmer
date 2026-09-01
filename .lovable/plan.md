# Channel Profile Exporter

Add a second mode to the app: paste a YouTube channel link, pick how many videos and what type, and get a folder of CSVs containing everything publicly available — views, likes, comment counts, comment text, and transcripts.

All of it runs locally through the yt-dlp binary the app already bundles. No API key, no quota, no YouTube account required (the existing optional sign-in can still be reused for reliability).

## What the user does

1. Switch to the "Channel export" tab.
2. Paste a channel URL (`@handle`, `/channel/UC...`, `/c/name`, or a channel's Shorts/Videos tab).
3. Choose content type: Shorts / Long-form / All.
4. Choose how many videos to export: 10–500 (default 100), ranked by view count.
5. Toggle what to include: comments (top 50 per video) and transcripts.
6. Click Export. A live progress panel shows "Video 34 of 100 — fetching comments".
7. When done, a folder is written to the chosen destination and an "Open folder" toast appears.

## Output

A folder named `<channel>-export-<date>/` containing:

- `videos.csv` — video_id, url, title, description, published date, duration seconds, is_short, view_count, like_count, comment_count, thumbnail, tags
- `comments.csv` — video_id, comment_id, parent_id, author, author_channel_url, text, like_count, published (top 50 by likes per video)
- `transcripts.csv` — video_id, start, end, text (one row per caption line)
- `summary.csv` — channel name, URL, subscriber count, export date, filter used, video count, and a per-video status column noting anything skipped (comments disabled, no captions)

All CSVs are UTF-8 with BOM and RFC 4180 escaping, same as the existing comment export, so they open cleanly in Excel.

## Honest expectations

- Ranking by views requires metadata for every candidate video, so the tool fetches the channel listing first (fast, flat), then pulls full metadata for a capped candidate pool before ranking and deep-scraping the top N.
- Time: roughly 2–6 seconds per video for metadata + transcript, plus 5–20 seconds when comments are included. A 100-video export with comments realistically takes 15–40 minutes. The UI states this up front and the export is cancellable; partial results are still written.
- Dislikes are not published by YouTube and cannot be exported.
- Videos with comments disabled or no captions are recorded in `summary.csv` rather than failing the run.

## Technical notes

Backend (`server/index.ts`):
- `POST /api/channel/list` — `yt-dlp --flat-playlist --dump-single-json` on the channel's `/videos` and/or `/shorts` tab to enumerate video IDs cheaply.
- `POST /api/channel/export` — starts a job, returns a `jobId`. Runs a sequential pipeline with a small concurrency limit (2–3) to avoid throttling: metadata batch → rank by `view_count` → take top N → per-video comments (`max_comments=50,50,0,0`) and transcript reuse of the existing subtitle logic.
- `GET /api/channel/export/progress?jobId=` — SSE stream reusing the existing progress-bus pattern, emitting `{ phase, current, total, videoTitle }`.
- `POST /api/channel/export/cancel` — aborts spawned children, flushes partial rows.
- Zod schemas for all inputs; the existing `cookiesFromBrowser` option is threaded through so a signed-in session can be used when available.

Shared (`src/lib/clip.ts`):
- `parseChannelUrl`, `isShort(durationSeconds)` (<= 60s), and `rowsToCsv` generalized from the existing `commentsToCsv`.

Frontend:
- New `src/hooks/useChannelExport.ts` (state, SSE subscription, cancel) and `src/components/ChannelExportPanel.tsx` (form + progress + result).
- Mode switch in `src/App.tsx` between "Clip" and "Channel export"; existing clipper UI untouched.
- Electron path writes the CSV folder via a new `saveFiles` IPC that reuses the existing directory picker; browser fallback downloads the CSVs individually.

Version bump to 1.4.0.
