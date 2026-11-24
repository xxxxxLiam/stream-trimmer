/**
 * File: exportRun.ts
 * Path: server/channel/exportRun.ts
 * Description: Validates a channel export request and sets up its checkpoint folder and row buffers.
 */
import { type ChannelJob } from "./channelJobs";
import { type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { markInUse, readJson, workDir } from "../resumeCache";
import { D } from "./channelDeps";
import { cancelChannelJob, getOrCreateChannelJob } from "./channelJobs";
import { channelBaseUrl } from "./channelListing";
import { CHECKPOINT_PREFIX, activeCheckpoints } from "./checkpoints";
import { ChannelExportInput, buildChannelExportSchema } from "./exportOptions";

export interface Checkpoint {
  channelName: string;
  subs: number | "";
  videos: Record<string, unknown>[];
  selected: { id: string; title: string }[];
}

/** One channel export request after validation, with its checkpoint folder and the run's rows. */
export interface ExportRun {
  req: Request;
  res: Response;
  input: ChannelExportInput;
  base: string;
  jobId: string;
  job: ChannelJob;
  cookieOptions: Record<string, unknown>;
  ckDir: string;
  ckSelection: string;
  ckMetadata: string;
  ckComments: string;
  ckTranscripts: string;
  ckStatuses: string;
  clearCheckpoint: () => void;
  releaseInUse: () => void;
  saved: Checkpoint | null;
  liveFiles: string[];
  /** In "path" mode comments and transcripts are never accumulated in memory. */
  toDisk: boolean;
  parts: { videoDetails: boolean; comments: boolean; transcripts: boolean };
  videos: Record<string, unknown>[];
  comments: Record<string, unknown>[];
  transcripts: Record<string, unknown>[];
  statuses: Record<string, unknown>[];
  channelName: string;
  subs: number | "";
}

/**
 * Answers 400/409 itself and returns null when the request cannot start. Once
 * it returns a run, the caller owns releasing it (activeCheckpoints, in-use mark).
 */
export function startExportRun(req: Request, res: Response): ExportRun | null {
  const parsed = buildChannelExportSchema().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return null;
  }
  if (!D.binariesOk) {
    D.binaryError(res);
    return null;
  }

  const input: ChannelExportInput = parsed.data;
  const base = channelBaseUrl(input.url);
  if (!base) {
    res.status(400).json({
      error:
        "That doesn't look like a channel link. Use youtube.com/@handle or /channel/UC…",
    });
    return null;
  }

  const jobId =
    typeof req.query.jobId === "string" && req.query.jobId
      ? req.query.jobId
      : `chan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (
    !input.includeVideoDetails &&
    !input.includeComments &&
    !input.includeTranscripts
  ) {
    res.status(400).json({
      error:
        "Pick at least one thing to export — video details, comments or transcripts.",
    });
    return null;
  }

  const job = getOrCreateChannelJob(jobId);
  const cookieOptions: Record<string, unknown> = D.resolveCookieOptions(
    input.cookiesFromBrowser,
  );


  // Checkpoint folder keyed on everything that changes what gets exported.
  // Rows are flushed to disk per video, so a failure, a cancel or a quit only
  // costs the video in flight — the rerun continues from the next one.
  const ckDir = workDir(CHECKPOINT_PREFIX, [
    base,
    input.contentType,
    input.limit,
    input.includeVideoDetails,
    input.includeComments,
    input.includeTranscripts,
  ]);
  // Two runs of the same request share one checkpoint folder: both append
  // to it (doubled rows), and whichever finishes first deletes it from under
  // the other (header-only CSVs). The second is refused, before it can touch
  // the folder. Different requests have different folders and run freely.
  if (activeCheckpoints.has(ckDir)) {
    res.status(409).json({
      error:
        "This export is already running. Wait for it to finish, or cancel it, before starting it again.",
    });
    return null;
  }
  activeCheckpoints.add(ckDir);
  // Clear cache skips a folder that is marked in use (resumeCache.ts). Our
  // checkpoint prefix already keeps it out of that sweep; this is the shared
  // mechanism on top, so either one alone keeps the run safe.
  const releaseInUse = markInUse(ckDir);

  res.on("close", () => {
    if (!res.writableEnded) cancelChannelJob(jobId);
  });
  const ckSelection = path.join(ckDir, "selection.json");
  const ckMetadata = path.join(ckDir, "metadata.jsonl");
  const ckComments = path.join(ckDir, "comments.jsonl");
  const ckTranscripts = path.join(ckDir, "transcripts.jsonl");
  const ckStatuses = path.join(ckDir, "statuses.jsonl");
  const clearCheckpoint = () => {
    try {
      fs.rmSync(ckDir, { recursive: true, force: true });
    } catch {
      /* swept later */
    }
  };

  // "Start fresh" — the saved progress from an earlier run of this exact
  // request is discarded so nothing is carried over or skipped.
  if (input.fresh) {
    clearCheckpoint();
    try {
      fs.mkdirSync(ckDir, { recursive: true });
    } catch {
      /* the checkpoint is best-effort; the export still runs */
    }
  }

  let saved = readJson<Checkpoint>(ckSelection);

  // Which live files this run depends on. Created empty up front so that a
  // file missing later means "deleted", never "nothing was collected".
  const liveFiles = [
    ckStatuses,
    ...(input.includeComments ? [ckComments] : []),
    ...(input.includeTranscripts ? [ckTranscripts] : []),
  ];
  // A resumed run whose rows have gone missing cannot be trusted: the
  // statuses say those videos were collected, so they would be skipped and
  // their comments silently absent. Start over rather than resume into a hole.
  if (saved && liveFiles.some((f) => !fs.existsSync(f))) {
    clearCheckpoint();
    saved = null;
  }
  try {
    fs.mkdirSync(ckDir, { recursive: true });
    for (const f of liveFiles) fs.closeSync(fs.openSync(f, "a"));
  } catch {
    /* the first append reports it if the folder really is unusable */
  }

  // In "path" mode comments and transcripts are never accumulated: they go to
  // the JSONL checkpoint as they are collected and are streamed from there
  // into CSVs at the end. They are the two that grow without bound — a few
  // thousand videos is millions of caption lines — so holding them is what
  // used to put a whole-channel export out of memory.
  const toDisk = input.deliver === "path";
  const videos: Record<string, unknown>[] = [];
  const comments: Record<string, unknown>[] = [];
  const transcripts: Record<string, unknown>[] = [];
  const statuses: Record<string, unknown>[] = [];
  // Which parts this run collected, echoed back so the UI reports on exactly
  // what it asked for.
  const parts = {
    videoDetails: input.includeVideoDetails,
    comments: input.includeComments,
    transcripts: input.includeTranscripts,
  };

  return {
    req,
    res,
    input,
    base,
    jobId,
    job,
    cookieOptions,
    ckDir,
    ckSelection,
    ckMetadata,
    ckComments,
    ckTranscripts,
    ckStatuses,
    clearCheckpoint,
    releaseInUse,
    saved,
    liveFiles,
    toDisk,
    parts,
    videos,
    comments,
    transcripts,
    statuses,
    channelName: "",
    subs: "",
  };
}
