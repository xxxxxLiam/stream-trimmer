# Fix: clips download below the quality you picked

## What you're seeing

You pick 1080p, the clip saves at a lower resolution, and the old sign-in method seemed to do better. The most likely cause is not the sign-in at all — it's how the app asks YouTube for the video.

Right now the app always asks YouTube's "streaming" ladder first, and only falls back to the higher-quality file list if that ladder has nothing at all. On many videos the streaming ladder tops out at 720p, so the app quietly accepts 720p even though a real 1080p file exists. That behaviour is in the code today and does not depend on being signed in.

This is a strong suspicion, not a confirmed fact — YouTube can't be queried from this environment, so step 1 below confirms it from your machine before the fix is judged.

## Plan

1. Confirm the cause
   - Log, for every download, which sign-in method was used (app sign-in, browser, or none) and which video track YouTube actually handed over (id, height, protocol).
   - Show that same line in the app's error/detail text so a mismatch is visible without digging through logs.

2. Fix the quality choice
   - Ask for the exact height you picked first, from either source (streaming ladder or separate video+audio files), and only then step down to lower heights.
   - Keep the existing safety net: if the direct fetch is refused, the app still downloads the whole file and trims locally, so this change should not bring back the earlier "refused" errors.
   - Same fix for the "Best" option: highest available height wins over protocol preference.

3. Make the result honest
   - When the delivered height is below what you picked, say which heights were actually offered, instead of a flat "isn't available".

4. Check the sign-in cookies really reach yt-dlp
   - Verify the app-written cookie file is accepted (correct domains, not expired) and, if it isn't, fall back to the browser session automatically rather than downloading signed-out.

## Technical notes

- `server/index.ts`, `/api/download`: `videoFormat` currently puts `bestvideo[height<=Q][protocol*=m3u8]+bestaudio[protocol*=m3u8]` ahead of the mp4/avc1 DASH pair, so an HLS 720p rendition wins over a DASH 1080p one. Restructure to height-exact tiers: `[height=Q]` HLS, `[height=Q]` DASH, then `[height<=Q]` HLS, `[height<=Q]` DASH, then the current tail. `best` becomes `bestvideo+bestaudio` DASH-or-HLS by height rather than protocol-first.
- Add `--print`-style capture (or parse the `[info] Downloading format ...` line already streaming through `runStreaming`) to log format id, height and protocol; surface via the existing `X-Delivered-Height` header path plus a new `X-Requested-Format` header.
- `resolveCookieOptions` prefers `cookieFile`; add a log line naming the mode, and treat "cookies file expired/ignored" yt-dlp warnings as a signal to retry with `cookiesFromBrowser` when one is known.
- Verification is manual on your machine (packaged/dev app, a video known to have 1080p) since yt-dlp cannot reach YouTube from the build environment.
