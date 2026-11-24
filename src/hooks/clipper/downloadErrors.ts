/**
 * File: downloadErrors.ts
 * Path: src/hooks/clipper/downloadErrors.ts
 * Description: Download failure and cancel types and the pure checks the clipper hooks share.
 */
import { extractVideoId } from "../../lib/clip";
import { type FailureDiagnostics } from "../../lib/diagnostics";

/** Carries the engine's failure fields from the response to the catch block. */
export class DownloadFailureError extends Error {
  code?: string;
  diagnostics?: FailureDiagnostics;
  constructor(message: string, code?: string, diagnostics?: FailureDiagnostics) {
    super(message);
    this.code = code;
    this.diagnostics = diagnostics;
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
