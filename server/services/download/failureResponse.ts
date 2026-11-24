/**
 * File: failureResponse.ts
 * Path: server/services/download/failureResponse.ts
 * Description: Turns an error thrown during a run into its table-shaped failure response and releases the work folder.
 */
import { type Response } from "express";
import fs from "node:fs";
import os from "node:os";
import { classifyFailure, estimateNeededMb, joinFailure, refusedFailure, pruneWorkDir, type ClipFailure } from "../../segments";
import { partialBytes } from "../../resumeCache";
import { CancelledError } from "../downloadJobs";
import { publishProgress } from "../progressChannel";
import { buildRunDiagnostics } from "../runDiagnostics";
import { cookieErrorMessage, fullErrMessage, isCookieError, logYtError, sendFailure } from "../../utils/errors";
import { DownloadCtx } from "./jobContext";
import { Runner } from "./progressRunner";
import { Workspace } from "./workspace";

export function handleFailure(ctx: DownloadCtx, ws: Workspace, runner: Runner, e: unknown): void | Response {
  const { isForbidden } = runner;
  const { res, url, quality, cookiesFromBrowser, segCount, totalSec, jobId, job, isAudio, sendCancelled } = ctx;
  const { tempDir, releaseWork } = ws;
    // What is on disk now is what a retry resumes from. Measure it before the
    // work folder is pruned down to exactly that: partial downloads stay,
    // finished segment files, the concat list and half-written joins go.
    const partial = partialBytes(tempDir);
    pruneWorkDir(tempDir);
    releaseWork(false);
    if (job.cancelled || e instanceof CancelledError) return sendCancelled();
    if (cookiesFromBrowser && isCookieError(e)) {
      const msg = cookieErrorMessage(cookiesFromBrowser);
      publishProgress(jobId, { phase: "error", percent: 0, message: msg });
      return res.status(400).json({
        error: msg,
        diagnostics: buildRunDiagnostics(jobId, fullErrMessage(e)),
      });
    }
    logYtError("/api/download", url, ctx.options, e);

    const raw = fullErrMessage(e);
    console.error(`[server] /api/download failed job=${jobId}: ${raw.slice(0, 400)}`);
    // The per-run record for Copy diagnostics: this run's stderr and job id,
    // never the whole log. A failure that never reached a child process still
    // carries what the error itself said.
    const diagnostics = buildRunDiagnostics(jobId, ctx.runStderrRaw || raw);
    // Keep the friendly sentence but append the real yt-dlp stderr tail so the
    // next YouTube-side change is diagnosable straight from the UI.
    const tail = ((e as { tail?: string } | null)?.tail || raw || "").trim();
    let failure: ClipFailure;
    if ((e as { joinFailed?: boolean } | null)?.joinFailed) {
      failure = joinFailure(tail);
    } else {
      const failCtx = { percent: ctx.lastReported, partialBytes: partial };
      failure = classifyFailure(raw, failCtx);
      if (failure.code === "disk_full") {
        let freeMb: number | undefined;
        try {
          const st = fs.statfsSync(os.tmpdir());
          freeMb = Math.floor((st.bavail * st.bsize) / (1024 * 1024));
        } catch {
          /* statfs unavailable: say it without the numbers */
        }
        failure = classifyFailure(raw, {
          ...failCtx,
          freeMb,
          neededMb: estimateNeededMb(totalSec, quality, isAudio, segCount),
        });
      } else if (failure.code === "unknown" && isForbidden(e)) {
        failure = refusedFailure(tail);
      }
    }
    publishProgress(jobId, {
      phase: "error",
      percent: 0,
      message: failure.error,
    });
    sendFailure(res, failure, { diagnostics });
}
