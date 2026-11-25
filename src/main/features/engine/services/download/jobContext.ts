/**
 * File: jobContext.ts
 * Path: src/main/features/engine/services/download/jobContext.ts
 * Description: The per-request state every download phase shares: the job, its cancel hooks and the run's mutable progress fields.
 */
import { rememberChild } from "../childRegistry";
import { type Request, type Response } from "express";
import { type ChildProcess } from "node:child_process";
import { STAGE_FOUND } from "../segments";
import { childEnv } from "../binaries";
import { CancelledError, cancelJobRun, killTree, registerJob, unregisterJob, type ActiveJob } from "../downloadJobs";
import { publishProgress } from "../progressChannel";
import { buildRunDiagnostics } from "../runDiagnostics";
import { DownloadRequest } from "./requestInput";

/**
 * Everything one /api/download run shares. The first group never changes after
 * it is built; the second group is the run's mutable state, written by the
 * phases as the run moves along.
 */
export interface DownloadCtx extends DownloadRequest {
  req: Request;
  res: Response;
  jobId: string;
  job: ActiveJob;
  isAudio: boolean;
  ext: "mp3" | "mp4";
  diag: (raw: string) => { diagnostics: ReturnType<typeof buildRunDiagnostics> };
  throwIfCancelled: () => void;
  trackChild: (child: ChildProcess) => void;
  ytOpts: () => any;
  sendCancelled: () => Response | undefined;

  /** True only when the probe confirmed a signed-in session. */
  sessionConfirmed: boolean;
  availableHeights: number[];
  /** The language filter in use (null = original), and whether a missing language fell back to it. */
  audioLanguageUsed: string | null;
  audioFellBack: boolean;
  probeOptions: Record<string, unknown>;
  /** The yt-dlp options of the attempt in flight, for the failure log. */
  options: Record<string, unknown>;
  lastReported: number;
  currentStage: string;
  scaleFrom: number;
  scaleTo: number;
  segDuration: number;
  chosenFormat: string;
  runStderrRaw: string;
  verifiedSource: string | null;
  joinMethod: "copy" | "reencode" | null;
}

export function createDownloadCtx(req: Request, res: Response, input: DownloadRequest): DownloadCtx {
  const { segs, format } = input;
  const jobId =
    typeof req.query.jobId === "string" && req.query.jobId
      ? req.query.jobId
      : `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // Anything that fails from here on, including the pre-flight, carries the
  // per-run diagnostics Copy diagnostics needs (job id, versions, log lines).
  const diag = (raw: string) => ({ diagnostics: buildRunDiagnostics(jobId, raw) });

  // Cancellable from here until the clip is built or has failed. Hanging up
  // the request cancels it too.
  const job = registerJob(jobId);
  const throwIfCancelled = () => {
    if (job.cancelled) throw new CancelledError();
  };
  res.on("close", () => {
    if (!res.writableEnded && job.building) {
      console.log(`[server] /api/download client went away job=${jobId} — cancelling`);
      cancelJobRun(job);
    }
    unregisterJob(jobId, job);
  });
  const trackChild = (child: ChildProcess) => {
    job.children.add(child);
    rememberChild(child);
    child.once("close", () => job.children.delete(child));
    // Cancelled between the spawn decision and the spawn: do not let it run.
    if (job.cancelled) killTree(child);
  };
  const ytOpts = () =>
    ({
      env: childEnv(),
      detached: process.platform !== "win32",
      onSpawn: trackChild,
    }) as any;
  const sendCancelled = () => {
    publishProgress(jobId, { phase: "error", percent: 0, message: "Cancelled" });
    if (res.headersSent || res.writableEnded) return;
    return res.status(499).json({
      error: "Cancelled",
      code: "cancelled",
      cancelled: true,
    });
  };

  const isAudio = format === "mp3";
  return {
    ...input,
    req,
    res,
    jobId,
    job,
    isAudio,
    ext: isAudio ? "mp3" : "mp4",
    diag,
    throwIfCancelled,
    trackChild,
    ytOpts,
    sendCancelled,
    sessionConfirmed: false,
    availableHeights: [],
    audioLanguageUsed: null,
    audioFellBack: false,
    probeOptions: {},
    options: {},
    lastReported: 0,
    currentStage: STAGE_FOUND,
    scaleFrom: 0,
    scaleTo: 99,
    segDuration: Math.max(0.1, segs[0].end - segs[0].start),
    chosenFormat: "",
    runStderrRaw: "",
    verifiedSource: null,
    joinMethod: null,
  };
}
