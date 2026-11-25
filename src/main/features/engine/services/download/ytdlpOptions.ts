/**
 * File: ytdlpOptions.ts
 * Path: src/main/features/engine/services/download/ytdlpOptions.ts
 * Description: Builds the yt-dlp option sets: the format ladder, the player-client lists, the sectioned attempt and the whole-file fallback.
 */
import { BEST_HEIGHT_CAP } from "../../utils/quality";
import { sectionArg, type Segment } from "../segments";
import { resolvedFfmpeg } from "../binaries";
import { audioSelector } from "../../utils/audioTracks";
import { DownloadCtx } from "./jobContext";
import { Workspace } from "./workspace";

// Naming player clients here is what capped users at 360p: the pinned set
// (web_safari, web, mweb, tv) turned out to be exactly the clients YouTube
// now gates behind a GVS PO token this app has no way to mint, while every
// token-free client was excluded. Per yt-dlp's own extractor tables:
//   web, web_safari — WEB_PO_TOKEN_POLICIES marks HTTPS and DASH
//     required=True, so their only ungated formats are HLS, and web_safari
//     is annotated "Since 2026.07, HLS formats are only returned with some
//     logged-in or 'trusted' sessions". On a session that is not trusted
//     these clients contribute nothing usable above 360p.
//   mweb, tv_simply, android, ios — each carries its own GVS_PO_TOKEN_POLICY
//     with required=True for HTTPS/DASH. Same dead end.
//   tv — yt-dlp's workaround for the DRM'd-formats bug (yt-dlp#12563) is
//     annotated "not effective when logged-in", and this app always sends
//     cookies, so `tv` is the one state where the workaround does not apply.
//   android_vr — removed from the fallback: it is annotated "Since
//     2026.08.17, ALL formats (including live HLS and itag 18) are 403'd",
//     so it could only make the whole-file retry fail, never succeed.
// So stop pinning. `default` is yt-dlp's own current choice and it swaps to
// the authenticated set on its own when cookies are present, which means the
// next time YouTube rotates which client works this app follows without a
// release. web_embedded is named explicitly for two reasons: it has no
// GVS_PO_TOKEN_POLICY at all, and `default` collapses to visionos alone when
// no JS runtime is installed, which is a thin single point of failure.
export const PLAYER_CLIENTS_PRIMARY = "youtube:player_client=default,web_embedded";
// Used only when a finished clip comes back far below the resolution the
// probe listed, so it has to be a genuinely different configuration rather
// than a superset of the primary: the token-free clients spelled out, in a
// different order, independent of whatever `default` resolved to. (The
// 403 retry is a different downloader on the same clients, not this.)
export const PLAYER_CLIENTS_FALLBACK =
  "youtube:player_client=tv_samsung,web_embedded,visionos";

export function createOptionBuilders(ctx: DownloadCtx, ws: Workspace) {
  const { quality, isAudio } = ctx;
  // A chosen dub only changes the audio half of each pair; the picture is the same on every track.
  const lang = ctx.audioLanguageUsed;
  const aM4a = audioSelector(lang, "[ext=m4a][acodec^=mp4a]");
  const aAny = audioSelector(lang);
  const { fullPath } = ws;
  // Every tier here used to lead with `protocol*=m3u8`. That was written when
  // SABR had stopped web clients handing out usable DASH URLs and web_safari's
  // pre-merged HLS was the only thing left that survived ffmpeg's range
  // requests. It has since inverted: YouTube only returns HLS to logged-in or
  // otherwise "trusted" sessions, so on an ordinary session every m3u8 tier
  // matched nothing, the whole ladder fell through to the bare `best`, and a
  // video the probe had just listed at 1080p was delivered as itag 18 — muxed
  // 360p. Protocol is therefore no longer part of the selection at all:
  // resolution is the key, HLS competes with DASH on equal terms at each
  // height, and the mp4/avc1 pairing is preferred only because it copies into
  // the output container without re-encoding. A DASH URL that does 403 under
  // ffmpeg is still caught by isForbidden() below, which moves the whole job
  // to the fallback path where yt-dlp fetches the media itself — that path,
  // not an HLS-first selector, is what covers the 403.
  const ladder =
    quality === "best"
      ? [
          // "best" stops at 1080p: a 4K source is not downloaded at 2160p.
          `bestvideo[height<=${BEST_HEIGHT_CAP}][ext=mp4][vcodec^=avc1]+${aM4a}`,
          `bestvideo[height<=${BEST_HEIGHT_CAP}]+${aAny}`,
          // Pre-merged renditions, itag 18 among them, only once no separate
          // video+audio pair exists at all.
          `best[height<=${BEST_HEIGHT_CAP}][ext=mp4]`,
          // Last resort for a video whose heights are unlisted: whatever there is.
          "best",
        ]
      : [
          // Exact requested height first, whatever protocol serves it.
          `bestvideo[height=${quality}][ext=mp4][vcodec^=avc1]+${aM4a}`,
          `bestvideo[height=${quality}]+${aAny}`,
          `best[height=${quality}][ext=mp4]`,
          `best[height=${quality}]`,
          // Then step down.
          `bestvideo[height<=${quality}][ext=mp4][vcodec^=avc1]+${aM4a}`,
          `bestvideo[height<=${quality}]+${aAny}`,
          `best[height<=${quality}][ext=mp4]`,
          `best[height<=${quality}]`,
        ];
  // Pre-merged renditions carry only the original audio, so a chosen dub never falls onto them:
  // a missing dub falls back to the original up front (probePhase), not silently here.
  const videoFormat = (lang ? ladder.filter((f) => f.includes("+")) : ladder).join("/");


  // Cookie options are deliberately NOT part of this: each yt-dlp run is given
  // its own cookie file by withRunCookies, never the canonical one.
  const commonOptions: Record<string, unknown> = {
    noPlaylist: true,
    noWarnings: true,
    newline: true,
    progress: true,
    // Pick up any `.part` file left in this work folder by a failed run.
    continue: true,
    ffmpegLocation: resolvedFfmpeg,
  };


  const formatOptions: Record<string, unknown> = isAudio
    ? { extractAudio: true, audioFormat: "mp3", audioQuality: quality }
    : { format: videoFormat, mergeOutputFormat: "mp4", remuxVideo: "mp4" };

  // Both attempts are built per client list rather than once, because a clip
  // that comes back far below the resolution YouTube listed is re-run on a
  // different set of clients (see the degraded-delivery check below).

  // Attempt 1: let yt-dlp cut the section (fast, ffmpeg fetches the range).
  // --force-keyframes-at-cuts is what makes the cut frame-accurate: without it
  // the cut snaps to the nearest keyframe and starts early.
  const sectionOptionsFor = (
    clients: string,
    seg: Segment,
    out: string,
    cookies: Record<string, unknown>,
  ): Record<string, unknown> => ({
    ...commonOptions,
    ...cookies,
    ...formatOptions,
    ...(ctx.isYouTube ? { extractorArgs: clients } : {}),
    downloadSections: sectionArg(seg),
    forceKeyframesAtCuts: true,
    output: out,
    // Make ffmpeg's range request look like the one that minted the URL (YouTube only).
    ...(ctx.isYouTube
      ? { addHeader: ["Referer:https://www.youtube.com/", "Origin:https://www.youtube.com"] }
      : {}),
  });

  // Attempt 2 (fallback): yt-dlp downloads the whole media itself (native
  // downloader, no ffmpeg-fetched URLs), then we trim locally.
  const fullOptionsFor = (
    clients: string,
    cookies: Record<string, unknown>,
  ): Record<string, unknown> => ({
    ...commonOptions,
    ...cookies,
    ...(ctx.isYouTube ? { extractorArgs: clients } : {}),
    // Fetch HLS with yt-dlp's own segment downloader so ffmpeg only ever sees
    // a local file. Older bundled ffmpeg builds crash fetching m3u8 themselves.
    hlsPreferNative: true,
    ...(isAudio
      ? {
          // Protocol is left out of the audio ladder for the same reason as
          // the video one: HLS is no longer reliably offered, so asking for it
          // first meant falling through to `best` and transcoding the muxed
          // 360p stream's audio track.
          format: `${audioSelector(lang, "[ext=m4a]")}/${aAny}${lang ? "" : "/best"}`,
        }
      : { format: videoFormat, mergeOutputFormat: "mp4" }),
    output: fullPath,
  });

  return { sectionOptionsFor, fullOptionsFor };
}
