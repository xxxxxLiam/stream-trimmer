/**
 * File: transcriptOutcome.ts
 * Path: src/renderer/src/shared/utils/transcriptOutcome.ts
 * Description: Turns the /api/transcript answer into lines plus an optional failure sentence, so a failed fetch
 *   is never shown as "No transcript available".
 */
import type { TranscriptLine, TranscriptResponse } from "./clip";

export const TRANSCRIPT_REQUEST_FAILED = "Couldn't load the transcript. Try again in a moment.";

export interface TranscriptOutcome {
  lines: TranscriptLine[];
  /** Set only when the fetch failed; an empty list without it means the video has no captions. */
  error: string | null;
}

export function transcriptOutcome(data: TranscriptResponse | null): TranscriptOutcome {
  if (!data) return { lines: [], error: TRANSCRIPT_REQUEST_FAILED };
  if (data.available) return { lines: data.lines, error: null };
  if (data.failed) return { lines: [], error: data.error || TRANSCRIPT_REQUEST_FAILED };
  return { lines: [], error: null };
}
