# Download a specific language / auto-dub audio track

## Summary

Today a clip always gets whatever audio YouTube hands back by default, which for
multi-language videos can be a region dub rather than the original. This adds a
**Language** picker next to Format and Quality on the Clip tab. When a video has
more than one audio track, the picker lists them ("Original — English", "Spanish
(auto-dubbed)", …); when it doesn't, it shows a single "Original" entry and is
disabled. The chosen track is used for the download and merged with the video.

Everything reuses what already exists: the same `/api/info` probe that fills the
title/duration, the same yt-dlp runner in `server/index.ts`, the same format
selector chain, the same ffmpeg merge. No new dependencies.

## How the pieces fit

### 1. Discover the tracks (`server/index.ts`, `/api/info`)

`/api/info` already runs `--dump-single-json` and passes `info.formats` to
`computeBitrates`. A new `collectAudioTracks(info)` helper reads the same array
and returns one entry per distinct language:

- Keep formats where `acodec !== "none"` and `vcodec === "none"`.
- Read `language` / `format_id` (yt-dlp suffixes language variants, e.g.
  `251-es`, `140-hi`) and `format_note` (carries "original" / "dubbed"
  wording).
- Drop `-drc` format ids and anything under ~120 kbps so duplicate
  low-bitrate/compressed copies don't create phantom entries.
- Group by language code, keep the highest-bitrate id per language, mark the
  one yt-dlp flags as original.
- Human labels from `Intl.DisplayNames` on the client, with the raw code as
  fallback.

The probe gains `extractorArgs: "youtube:player_client=all"` **only when the
first probe returns fewer than two audio languages** — alternate tracks often
don't surface otherwise. This keeps the fast path fast and only pays the extra
cost on videos that might be multi-language. Cookie options are passed through
unchanged, since some dubs only appear to a signed-in session.

`/api/info` response gains `audioTracks: { id, language, label, original,
dubbed }[]` (empty array = single-track video).

### 2. Pass the choice through

- `src/lib/clip.ts`: add the `AudioTrack` type, `audioTracks` on `VideoInfo`,
  and optional `audioLanguage` on `DownloadRequest`.
- `src/hooks/useClipper.ts`: `audioLanguage` state (default `"original"`),
  reset whenever a new video loads, included in the download body.
- `src/components/FormatQualityFields.tsx`: third select, hidden for MP3-only?
  No — it applies to MP3 too (an MP3 of the Spanish dub is valid), so it stays
  visible for both formats and is disabled when there's no video or only one
  track.

### 3. Download with the selected track (`/api/download`)

`downloadSchema` accepts `audioLanguage`. When it is set and not `"original"`,
the format chain currently built for the requested height is rebuilt with the
audio half pinned to that language, using yt-dlp's language filter rather than
a hard-coded id so the existing HLS-first / step-down ladder is preserved:

```
bestvideo[height=1080][protocol*=m3u8]+bestaudio[language=es][format_id!$=-drc]
... (same ladder, audio side pinned) ...
/ <existing unpinned ladder as last resort>
```

The unpinned ladder stays at the end so a track that vanished between probe and
download degrades to a normal download instead of failing. `player_client=all`
is added to the download's extractor args in this case, matching the probe.
The already-existing `chosenFormat` log line and `X-Selected-Format` header make
the actual pick visible, and a new `X-Audio-Language` header reports what was
delivered so a silent fallback to the default dub is diagnosable.

For MP3, `extractAudio` selection gets the same language pin.

## Edge cases

| Case | Handling |
| --- | --- |
| Single-track video | `audioTracks: []`, picker shows "Original" and is disabled |
| Tracks hidden on first probe | Re-probe with `player_client=all` before giving up |
| Auto-dub vs creator dub | Label from `format_note`; auto-dubs shown as "(auto-dubbed)" |
| Duplicate `-drc` / low-bitrate copies | Filtered out during grouping |
| Region default != original | Original is explicitly marked and is the default selection, so the pick is never implicit |
| Track disappears at download time | Format ladder falls through to the unpinned chain; delivered language reported back |
| ffmpeg missing | Existing binary check and install-command error path already covers this |
| Signed-out session | Existing auth gate is unchanged; cookies are forwarded to the probe as they are now |

## No new dependencies, config, or migrations.

## Implementation order

1. `collectAudioTracks` + `/api/info` response field, with the conditional
   `player_client=all` re-probe. Verify against a known multi-dub video.
2. Types in `src/lib/clip.ts` and `audioLanguage` state in `useClipper.ts`.
3. Language select in `FormatQualityFields.tsx`.
4. `/api/download` schema + language-pinned format ladder + `X-Audio-Language`.
5. Tests for `collectAudioTracks` (grouping, `-drc` filtering, original
   detection) and for the format-string builder, in the existing server test
   style.
