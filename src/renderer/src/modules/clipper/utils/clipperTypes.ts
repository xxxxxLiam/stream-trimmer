/**
 * File: clipperTypes.ts
 * Path: src/renderer/src/modules/clipper/utils/clipperTypes.ts
 * Description: Quality lists and the shapes the clipper hooks and their consumers share.
 */
import { type FailureAttempt, type FailureDiagnostics } from "../../../shared/utils/diagnostics";

export const VIDEO_QUALITIES = ["best", "1080", "720", "480", "360"] as const;
export const AUDIO_QUALITIES = ["320", "192", "128"] as const;

/** How each quality reads in the Quality select and the footer chip. */
export const QUALITY_LABELS: Record<string, string> = {
  best: "Best",
  "1080": "1080p",
  "720": "720p",
  "480": "480p",
  "360": "360p",
  "320": "320 kbps",
  "192": "192 kbps",
  "128": "128 kbps",
};

export type Quality =
  | (typeof VIDEO_QUALITIES)[number]
  | (typeof AUDIO_QUALITIES)[number];

/** A failed download, kept with what Copy diagnostics needs. Matched to the error text by `message`. */
export interface DownloadFailureInfo {
  message: string;
  code?: string;
  diagnostics?: FailureDiagnostics;
  attempt: FailureAttempt;
}

export type DownloadOptions = {
  segments?: Array<{ start: number; end: number }>;
  clipId?: string;
  /** Audio language to cut ("es"). Omitted means the original track. One clip per language. */
  audioLanguage?: string;
};
