/**
 * File: clipRowState.ts
 * Path: src/common/types/clipRowState.ts
 * Description: What a failed clip's Export row says, decided in main and carried on the progress
 *   events. One mapping from a classified failure to a row state, so the renderer only draws it.
 */

export type ClipRowState =
  | { state: "failed"; reason: string; retrying: boolean }
  | { state: "failed-final"; reason: string }
  | { state: "no-space"; reason: string }
  | { state: "cannot-download"; kind: "private" | "other"; reason: string };

/** Spoken when download tools are being refreshed before the one retry. */
export const RETRY_SENTENCE = "Clipr is updating its download tools and will try once more.";

/** The part of a failure the row state needs (the engine's ClipFailure carries more). */
export interface FailureLike {
  code: string;
  cause?: string;
  error: string;
  /** `cause` is yt-dlp's own text, which stays out of the row. */
  rawCause?: boolean;
}

/** What the row says when the cause is the tool's own text (it is in Copy details). */
export const RAW_CAUSE_SENTENCE = "YouTube stopped the download.";

/**
 * Only `retrying` (a tool update really running before the one retry) is "failed". Everything else,
 * including the second failure after that retry, is "failed-final" (Retry and Copy details).
 * Disk-full and cannot-download never retry.
 */
export function rowStateFor(failure: FailureLike, opts: { retrying?: boolean; retried?: boolean } = {}): ClipRowState {
  const reason = failure.rawCause ? RAW_CAUSE_SENTENCE : failure.cause || failure.error;
  if (failure.code === "disk_full") return { state: "no-space", reason };
  if (failure.code === "private_video") return { state: "cannot-download", kind: "private", reason };
  if (opts.retrying) return { state: "failed", reason, retrying: true };
  // Only `retrying` means a tool update is running. Every other failure is final: the row must never promise
  // an update or a second try that is not coming (E2-1), and Copy details belongs on it.
  return { state: "failed-final", reason };
}
