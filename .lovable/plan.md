# Audit: "YouTube refused the media request" — findings and minimal fix

## Step 1 — Bundled yt-dlp version

`scripts/bundle-binaries.cjs` (line 157) fetches:
`https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp` — **not pinned**, always latest at build time.

Two caveats, but neither is the cause:
- `cached()` writes a `.ok` marker in `resources/bin/.cache`, so a local rebuild reuses an older download. CI runners are fresh, so releases do get current binaries.
- A shipped installer freezes whatever yt-dlp existed at release time; installed apps never self-update yt-dlp.

I downloaded the current latest (**2026.07.04**) and reproduced the exact failure with it, so a stale pin is **refuted** as the root cause.

## Step 2 — The command the server builds

`server/index.ts` `/api/download` (lines 575-612) runs, per attempt 1:

```text
yt-dlp <url>
  --no-playlist --no-warnings --newline --progress
  --ffmpeg-location <bundled ffmpeg>
  --extractor-args "youtube:player_client=web_safari,web,mweb,tv,android_vr"
  --format "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]/..."
  --merge-output-format mp4 --remux-video mp4
  --download-sections "*START-END" --force-keyframes-at-cuts
  --add-header Referer:https://www.youtube.com/ --add-header Origin:https://www.youtube.com
  -o <tmp>/clip.mp4
```

The generic message comes from line 832: any error matching `/403|Forbidden|ffmpeg exited with code 1|fragment.*not found/i`
is replaced with "YouTube refused the media request for this video…". The raw stderr is already logged
server-side by `logYtError`, but it never reaches the UI.

## Step 3 — Raw yt-dlp stderr (reproduced with latest yt-dlp)

```text
[info] Downloading 1 format(s): 137+140
[https @ ...] HTTP error 403 Forbidden
Error opening input file https://rr5---sn-...googlevideo.com/videoplayback?...&c=ANDROID_VR&...
ERROR: ffmpeg exited with code 8
```

Probing the clients individually explains why:

```text
yt-dlp -F --extractor-args "youtube:player_client=tv"
WARNING: Some tv client https formats have been skipped as they are missing a URL.
YouTube may have enabled the SABR-only streaming experiment for the current session.
(only itag 18 remains)

yt-dlp -F --extractor-args "youtube:player_client=web_safari"
(only HLS m3u8 formats 91-96 + progressive itag 18 — no DASH video/audio pairs)
```

So under YouTube's SABR rollout the web/tv clients no longer expose separate DASH
video+audio URLs. The only client still handing out DASH URLs is `android_vr`, and those
URLs are bound to that client's request context — ffmpeg's range request gets 403.
The current format string (`bestvideo[ext=mp4]+bestaudio[ext=m4a]`) can only be satisfied
by those android_vr DASH pairs, so every download lands on the 403 path.

The existing fallback does not save it either: retrying with yt-dlp's own native downloader on
the same android_vr URLs also returned `ERROR: unable to download video data: HTTP Error 403: Forbidden`.

Verified working alternative, same yt-dlp, same video, same `--download-sections`:

```text
-f 93  (web_safari HLS, 360p)      -> clip written, 585 KB, exit 0
-f 18  (progressive 360p)          -> clip written, 587 KB, exit 0
```

## Root cause

Not the app's trimming logic, not a stale yt-dlp pin. The format selector plus client list steers
yt-dlp onto `android_vr` DASH URLs, which YouTube now 403s for any out-of-context fetcher.
Confirms the user's suspicion that this is a YouTube-side change — it broke without any code change here.

## Step 4 — Minimal fix (server/index.ts only)

1. **Format selection: prefer HLS, then progressive, then DASH.** Change `videoFormat` so the first
   candidates are the m3u8 formats the web clients still serve, e.g.
   `bestvideo[protocol*=m3u8][height<=Q]+bestaudio[protocol*=m3u8]/best[protocol*=m3u8][height<=Q]/best[ext=mp4][height<=Q]/…`
   with the current avc1+m4a DASH string kept last as a fallback. HLS covers up to 1080p on the test video
   and works with `--download-sections` directly.
2. **Client list: drop `android_vr` from the first attempt**, keep `web_safari,web,mweb,tv`. Retain
   `android_vr` only in the whole-file fallback attempt, where a different quality may still be reachable.
3. **Surface the real error.** Keep the friendly sentence but append the yt-dlp stderr tail (already
   captured as `err.tail`) so the next YouTube change is diagnosable from the UI, not just the console.
4. **Keep yt-dlp fresh.** Two small build-side changes: stop reusing the `.cache` `.ok` marker for
   `yt-dlp` (always fetch latest at build time), and, when a system `yt-dlp` reports a newer version
   string than the bundled one, prefer it in `resolveYtDlp()`. Optional but cheap insurance against
   the next breakage.

Quality options: if the requested height has no HLS rendition, selection degrades to the nearest
available instead of failing.

## Out of scope

No front-end changes, no changes to trimming, progress reporting, comments export, or packaging beyond
the yt-dlp freshness tweaks above.
