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
}

/**
 * `retried` is true once the one tool-update retry has been spent, so a second failure is
 * final (and Copy details shows). Disk-full and cannot-download never retry.
 */
export function rowStateFor(failure: FailureLike, opts: { retrying?: boolean; retried?: boolean } = {}): ClipRowState {
  const reason = failure.cause || failure.error;
  if (failure.code === "disk_full") return { state: "no-space", reason };
  if (failure.code === "private_video") return { state: "cannot-download", kind: "private", reason };
  if (opts.retrying) return { state: "failed", reason, retrying: true };
  if (opts.retried) return { state: "failed-final", reason };
  return { state: "failed", reason, retrying: false };
}
