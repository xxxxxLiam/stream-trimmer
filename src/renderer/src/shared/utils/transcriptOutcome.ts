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
  /**
   * Why it failed, from the engine's reason table (ytReasons.ts) — "refused", "signin", "age", etc.
   * Set only alongside `error`. A caller that wants to offer "Sign in to YouTube" on an auth-shaped
   * failure, rather than only showing the sentence, reads this; null/absent means that decision
   * doesn't apply. `transcriptOutcome()` itself always sets it (to null when there is none); it is
   * optional here only so a caller replaying an already-held outcome needn't restate it.
   */
  kind?: string | null;
}

export function transcriptOutcome(data: TranscriptResponse | null): TranscriptOutcome {
  if (!data) return { lines: [], error: TRANSCRIPT_REQUEST_FAILED, kind: null };
  if (data.available) return { lines: data.lines, error: null, kind: null };
  if (data.failed) return { lines: [], error: data.error || TRANSCRIPT_REQUEST_FAILED, kind: data.kind ?? null };
  return { lines: [], error: null, kind: null };
}
