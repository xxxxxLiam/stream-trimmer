# Export tags and hashtags

Yes — tags are already exported, hashtags are not. This adds hashtags and improves the tag columns.

## Current state

`videos.csv` already has a `tags` column, filled from yt-dlp's `tags` field (the channel's keyword tags), joined with `; `. There is no hashtag data anywhere in the export.

## What changes

`videos.csv` gains three columns:

- `tags` (existing) — keyword tags from the video's metadata
- `tag_count` — how many keyword tags
- `hashtags` — every `#tag` found, deduplicated, `; ` separated
- `hashtags_in_title` — only the hashtags shown next to the title

Hashtags are collected from three sources and merged:
1. yt-dlp's dedicated hashtag field when present
2. `#word` matches in the title
3. `#word` matches in the description

Matching allows letters, digits, underscore and non-Latin scripts, strips trailing punctuation, and compares case-insensitively for dedup while keeping the first-seen casing. Videos with no hashtags get empty cells, not an error.

## Technical notes

- `server/index.ts`: in the metadata row builder (~line 1691), add a small `extractHashtags(meta)` helper and emit `tag_count`, `hashtags`, `hashtags_in_title` alongside the existing `tags`.
- `src/lib/channel.ts`: add the three new keys to `VIDEO_COLUMNS` so they are written to the CSV in order.
- No UI change needed; the exporter panel text already says tags are included.
