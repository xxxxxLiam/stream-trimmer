# Fix: clip saved at 360p instead of 1080p

## What's likely happening

360p is a very specific number: it's YouTube's single "all-in-one" file (video and
audio already combined). The app asks for a real 1080p video track first, and only
if every one of those attempts comes back empty does it fall back to that combined
file — which is always 360p.

So the download isn't being downgraded from 1080p to 360p; it's that the 1080p
tracks were not offered at all for the way the app asked, and the last-resort file
won. Being signed in doesn't help if the request is made in a way YouTube answers
with nothing.

This is the most probable cause given the code, but it is not confirmed yet — the
first step below confirms it on your machine, because YouTube can't be contacted
from where this app is built.

## Plan

1. Confirm it from your machine
   - Record, for each download, the full list of resolutions YouTube offered and
     the exact track the app ended up with, and show that on the "Clip saved" note.
   - You send one download's note back; that tells us whether 1080p was offered
     and refused, or never offered.

2. Stop the silent drop to 360p
   - If the app can't get the resolution you picked (or anything close), it stops
     and says so plainly instead of quietly saving a 360p file.
   - A 360p combined file is only ever used when you explicitly pick 360p.

3. Ask YouTube in a way that returns the high-quality tracks
   - Try the request again with a different set of YouTube "clients" when the
     first attempt returns only the combined file, instead of accepting it.
   - Keep the existing safety net that downloads the whole file and trims locally,
     so this does not bring back the old "refused" errors.

4. Separately: "Update check failed"
   - That message is the app failing to reach the update server; it does not
     affect downloads. It will be made quieter (only shown when you press Check)
     unless you want it investigated too.

## Technical notes

- `server/index.ts` `/api/download`: the `videoFormat` cascade ends in
  `best[height<=Q]`, which resolves to progressive itag 18 (360p) whenever every
  `bestvideo+bestaudio` tier fails to match. Remove the bare progressive tails
  from the non-audio cascade except when `quality <= 360`, and treat "no format"
  as a retryable condition rather than a fallback target.
- Add a client-rotation retry: attempt 1 `web_safari,web,mweb,tv`, on empty
  selection retry with `ios,android_vr,tv_embedded` before the whole-file
  fallback. Log yt-dlp's `Downloading N format(s)` line per attempt (already
  captured in `updateFromLine` as `chosenFormat`).
- `availableHeights` is already computed from the probe; include it plus
  `chosenFormat` in the failure response body, not just headers, so
  `useClipper.ts` can render "YouTube only offered 360p for this request".
- If the probe's `availableHeights` contains the requested height but selection
  lands lower, that isolates the cause to format selection rather than SABR.
- Verification is manual on your machine (packaged/dev app, a known-1080p video).
