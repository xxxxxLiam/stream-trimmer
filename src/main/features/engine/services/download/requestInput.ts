/**
 * File: requestInput.ts
 * Path: src/main/features/engine/services/download/requestInput.ts
 * Description: Validates a /api/download request and resolves its ranges, cookie source and totals.
 */
import { type Request, type Response } from "express";
import { resolveSegments, segmentsTotal, type Segment } from "../segments";
import { binariesOk } from "../binaries";
import { isYouTubeLink } from "../../utils/videoUrl";
import { cookieModeFor, resolveCookieOptions } from "../cookies";
import { MAX_CLIP_SECONDS } from "../../utils/engineConfig";
import { binaryError } from "../../utils/errors";
import { DEFAULT_AUDIO_QUALITY, DEFAULT_VIDEO_QUALITY, DownloadInput, downloadSchema } from "../../utils/schemas";

export interface DownloadRequest {
  url: string;
  format: DownloadInput["format"];
  quality: DownloadInput["quality"];
  audioLanguage: DownloadInput["audioLanguage"];
  deliver: DownloadInput["deliver"];
  cookiesFromBrowser: DownloadInput["cookiesFromBrowser"];
  /** False for Twitch and Kick: no sign-in, player clients or YouTube headers. */
  isYouTube: boolean;
  segs: Segment[];
  segCount: number;
  multi: boolean;
  totalSec: number;
  lastEnd: number;
  cookieOptions: Record<string, unknown>;
  cookieMode: "app" | "browser" | "none";
}

/** Answers 400/500 itself and returns null when the request cannot be served. */
export function parseDownloadRequest(req: Request, res: Response): DownloadRequest | null {
  const parsed = downloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return null;
  }
  if (!binariesOk) {
    binaryError(res);
    return null;
  }

  const { url, format, audioLanguage, deliver, cookiesFromBrowser } = parsed.data;
  const quality: string =
    parsed.data.quality ?? (format === "mp3" ? DEFAULT_AUDIO_QUALITY : DEFAULT_VIDEO_QUALITY);
  // A clip is a list of ranges. The old single start/end is one segment.
  const resolvedSegments = resolveSegments(parsed.data, MAX_CLIP_SECONDS);
  if (!resolvedSegments.ok) {
    res.status(400).json({ error: resolvedSegments.error });
    return null;
  }
  const segs: Segment[] = resolvedSegments.segments;
  const segCount = segs.length;
  const multi = segCount > 1;
  const totalSec = segmentsTotal(segs);
  const lastEnd = Math.max(...segs.map((s) => s.end));

  // Sign-in, player clients and the YouTube Referer belong to YouTube links only; Twitch and Kick run bare.
  const isYouTube = isYouTubeLink(url);
  const cookieOptions: Record<string, unknown> = isYouTube ? resolveCookieOptions(cookiesFromBrowser) : {};
  const cookieMode = isYouTube ? cookieModeFor(cookiesFromBrowser) : "none";
  console.log(
    `[server] /api/download auth mode=${cookieMode} segments=${segCount}`,
  );
  return {
    url,
    format,
    quality,
    audioLanguage,
    deliver,
    cookiesFromBrowser,
    segs,
    segCount,
    multi,
    totalSec,
    lastEnd,
    cookieOptions,
    cookieMode,
    isYouTube,
  };
}
