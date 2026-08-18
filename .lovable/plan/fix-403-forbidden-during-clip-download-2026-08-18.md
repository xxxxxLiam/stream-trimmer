# Fix: 403 Forbidden during clip download

## What is happening

The download failed with `HTTP error 403 Forbidden ... ERROR: ffmpeg exited with code 1`.

Confirmed from `server/index.ts` (`/api/download`, lines 580-606): clips are cut using yt-dlp's
`--download-sections` + `--force-keyframes-at-cuts`. In that mode yt-dlp does not download the media
itself — it hands the raw `googlevideo.com` media URL to **ffmpeg**, which fetches the byte range on its own.

The log line `Downloading android vr player API JSON` shows the media URL came from the ANDROID_VR client.
Those URLs are bound to the client's request context, and a plain ffmpeg HTTPS request (different headers,
no matching context) gets rejected with 403. This is why some videos download fine and others fail, and why
it is intermittent/video-specific rather than a bug in the range values.

## The fix

Two layers, both in `server/index.ts` (backend only, no UI change):

1. **Use a client whose media URLs ffmpeg can fetch.** Pass explicit
   `--extractor-args "youtube:player_client=..."` on the download call (web-based clients first, mobile as
   fallback) instead of letting yt-dlp pick ANDROID_VR, and pass matching HTTP headers to ffmpeg so the
   range request looks like the request that minted the URL.

2. **Automatic fallback path when the sectioned download still 403s.** If the section download fails with a
   403 / "ffmpeg exited with code 1", retry the job in a mode that avoids ffmpeg-fetched URLs entirely:
   let yt-dlp download the needed portion itself (native downloader, no `--download-sections`), then trim
   locally with the bundled ffmpeg (`-ss`/`-to`, stream copy for mp4, encode for mp3) into the same
   temp output path.

   This is slower for long videos, so it only runs as a retry, never as the first attempt.

3. **Clearer error surface.** When both attempts fail, return a readable message
   ("YouTube refused the media request for this video — try again or pick a different quality")
   instead of the raw ffmpeg tail, while still logging the full tail server-side.

## Progress bar

The existing progress parser reads ffmpeg `time=` lines. In the fallback path progress comes from
yt-dlp's `[download] NN%` for the fetch phase, then the local ffmpeg trim reports the remaining
percentage — both already have parsing branches in `updateFromLine`, so they just need to be scoped
per phase.

## Scope

- `server/index.ts` — download options, retry/fallback logic, error message.
- No frontend, schema, or packaging changes.
