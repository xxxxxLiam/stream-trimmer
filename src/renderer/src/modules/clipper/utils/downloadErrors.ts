/**
 * File: downloadErrors.ts
 * Path: src/renderer/src/modules/clipper/utils/downloadErrors.ts
 * Description: Download failure and cancel types and the pure checks the clipper hooks share.
 */
import type { ClipRowState } from "../../../../../common/types/clipRowState";
import { extractVideoId } from "../../../shared/utils/clip";
import { type FailureDiagnostics } from "../../../shared/utils/diagnostics";

/** Carries the engine's failure fields from the response to the catch block. */
export class DownloadFailureError extends Error {
  code?: string;
  diagnostics?: FailureDiagnostics;
  /** What the clip's Export row says, decided in main (see common/types/clipRowState.ts). */
  row?: ClipRowState;
  constructor(message: string, code?: string, diagnostics?: FailureDiagnostics, row?: ClipRowState) {
    super(message);
    this.code = code;
    this.diagnostics = diagnostics;
    this.row = row;
  }
}

/**
 * The engine answers a download that was cancelled (POST /api/download/cancel) with
 * `499 {"error":"Cancelled","code":"cancelled","cancelled":true}`. That is the user's own Cancel
 * arriving back, not a failure: no error banner, no diagnostics prompt.
 */
export function isCancelledResponse(
  status: number,
  body: { code?: string; cancelled?: boolean } | null | undefined,
): boolean {
  return status === 499 || body?.code === "cancelled" || body?.cancelled === true;
}

/** Thrown from the response handler for a cancelled download, and treated like an abort. */
export class DownloadCancelledError extends Error {
  constructor() {
    super("Cancelled");
  }
}

/** True for an aborted fetch or a cancelled-by-engine answer: both are the user stopping the cut. */
export function isQuietCancel(e: unknown): boolean {
  return (
    e instanceof DownloadCancelledError ||
    (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError")
  );
}

/**
 * Why a link cannot be cut, or null when it names one video. The engine will happily
 * answer /api/info for a channel or playlist URL, so without this check such a link loaded
 * as a source and "Cut" then silently did nothing (B-5).
 */
export function videoUrlProblem(url: string): string | null {
  if (!url.trim()) return null;
  if (extractVideoId(url.trim())) return null;
  return "That link is not a single video (a channel, playlist or other page). Paste a link to one video.";
}

/**
 * Tell the engine to stop the job's child processes. Aborting the fetch only hangs up the
 * request; the engine keeps cutting unless it is told (B-6). Best effort: an engine without
 * the route, or one that is already gone, must not break Cancel.
 */
export async function requestEngineCancel(
  jobId: string,
  post: (path: string, body: unknown) => Promise<unknown>,
): Promise<void> {
  try {
    await post("/api/download/cancel", { jobId });
  } catch {
    /* the abort alone still frees the renderer */
  }
}

/**
 * A failed save of the finished clip, as the Export row needs it. The engine answers with a code
 * (DISK_FULL, FOLDER_NOT_WRITABLE, FOLDER_GONE, SAVE_FAILED) and a plain sentence; until it does, the
 * Node error text names the cause. Only the folder problems get a code (they offer Change folder);
 * anything else stays an ordinary failure. `reason` is the sentence to show.
 */
export function saveFailure(result: { error?: string; code?: string }): { code?: "disk_full" | "save_folder_gone"; reason?: string } {
  const text = result.error ?? "";
  if (result.code === "DISK_FULL" || /ENOSPC|no space left|disk full/i.test(text)) {
    return { code: "disk_full", reason: result.code ? text || "The Clips folder is full." : "The Clips folder is full." };
  }
  if (
    result.code === "FOLDER_NOT_WRITABLE" ||
    result.code === "FOLDER_GONE" ||
    /ENOTDIR|ENOENT|EACCES|EPERM|EROFS|read-only file system|permission denied|not a directory/i.test(text)
  ) {
    return { code: "save_folder_gone", reason: result.code ? text || "Clipr can’t write to that folder." : "Clipr can’t write to that folder." };
  }
  return {};
}
