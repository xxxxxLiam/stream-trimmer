/**
 * File: transcriptFetch.ts
 * Path: src/main/features/engine/utils/transcriptFetch.ts
 * Description: The decisions behind /api/transcript: which caption languages to ask yt-dlp for, which downloaded
 *   file to read, and whether an empty result means "this video has no captions" or "the fetch failed".
 */
import { ytReasonOf, type YtReasonKind } from "./ytReasons";

/**
 * English tracks in every spelling YouTube uses (en, en-US, en-GB, en-orig), plus the video's own original
 * language (xx-orig), so a video spoken in another language still gets its captions.
 */
export const TRANSCRIPT_SUB_LANGS = "en.*,.*-orig";

/** Lower is better: plain English, then English variants, then the original language, then anything. */
function rank(file: string): number {
  const lang = /\.([^.]+)\.vtt$/.exec(file)?.[1] ?? "";
  if (lang === "en") return 0;
  if (lang === "en-orig") return 1;
  if (lang.startsWith("en")) return 2;
  if (lang.endsWith("-orig")) return 3;
  return 4;
}

export function pickTranscriptFile(files: string[]): string | null {
  const vtts = files.filter((f) => f.endsWith(".vtt")).sort();
  if (vtts.length === 0) return null;
  return [...vtts].sort((a, b) => rank(a) - rank(b))[0];
}

export interface TranscriptFailure {
  error: string;
  kind: YtReasonKind | "unknown";
}

/** No caption file arrived: tell a refused or offline fetch from a video that simply has no captions. */
export function describeMissingTranscript(stderr: string): TranscriptFailure | null {
  const reason = ytReasonOf(stderr);
  if (!reason) return null;
  return {
    error: `Couldn't load the transcript. ${reason.sentence}`,
    kind: reason.kind,
  };
}

export const UNREADABLE_TRANSCRIPT: TranscriptFailure = {
  error: "Couldn't read this video's captions. Try again in a moment.",
  kind: "unknown",
};
