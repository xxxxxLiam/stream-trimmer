/**
 * File: segments.ts
 * Path: src/main/features/engine/services/segments.ts
 * Description: The pure parts of cutting a clip that is a LIST of ranges. A clip
 * is one or more `{start, end}` segments of one source video. Each segment is
 * downloaded on its own, then the pieces are joined, in order, into one file.
 *
 * Everything here is free of Express and of the yt-dlp runner so it can be
 * pinned by tests: validating the request, the section string handed to
 * yt-dlp, the concat list, the copy-versus-re-encode decision, the named
 * progress stages, and the failure table (cause, the one fix, the work kept).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ytReasonOf } from "../utils/ytReasons";

export interface Segment {
  start: number;
  end: number;
}

export const MAX_SEGMENTS = 20;

/** How far the joined file may drift from the sum of its segments (seconds). */
export const DURATION_TOLERANCE_SEC = 0.5;

// --- request -------------------------------------------------------------

export type ResolvedSegments =
  | { ok: true; segments: Segment[] }
  | { ok: false; error: string };

/**
 * Turns a download request into its list of segments. The older single
 * `start`/`end` shape is one segment, so existing callers keep working. The
 * messages are the ones the single-range schema always produced.
 */
export function resolveSegments(
  body: { start?: number; end?: number; segments?: Segment[] },
  maxTotalSeconds: number,
): ResolvedSegments {
  let list: Segment[];
  if (body.segments && body.segments.length > 0) {
    list = body.segments.map((s) => ({ start: s.start, end: s.end }));
  } else if (typeof body.start === "number" && typeof body.end === "number") {
    list = [{ start: body.start, end: body.end }];
  } else {
    return { ok: false, error: "Mark at least one segment to cut" };
  }
  if (list.length > MAX_SEGMENTS) {
    return {
      ok: false,
      error: `A clip can join at most ${MAX_SEGMENTS} segments`,
    };
  }
  for (const s of list) {
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0) {
      return { ok: false, error: "Segment times must be positive numbers" };
    }
    if (!(s.end > s.start)) {
      return { ok: false, error: "End must be greater than start" };
    }
  }
  if (segmentsTotal(list) > maxTotalSeconds) {
    return {
      ok: false,
      error: `Clip length capped at ${maxTotalSeconds} seconds (10 minutes)`,
    };
  }
  return { ok: true, segments: list };
}

export function segmentsTotal(segments: readonly Segment[]): number {
  return segments.reduce((sum, s) => sum + (s.end - s.start), 0);
}

/** The value of yt-dlp's --download-sections for one segment. */
export function sectionArg(seg: Segment): string {
  return `*${seg.start.toFixed(2)}-${seg.end.toFixed(2)}`;
}

/** `seg-01.mp4`, `seg-02.mp4`, ... zero padded so a directory listing sorts. */
export function segmentFileName(index: number, ext: string): string {
  return `seg-${String(index + 1).padStart(2, "0")}.${ext}`;
}

// --- named stages ---------------------------------------------------------

export const STAGE_FOUND = "Found the stream";
export const STAGE_WRITING = "Writing to your folder";
export const stageDownloaded = (n: number, m: number) =>
  `Downloaded segment ${n} of ${m}`;
/** Shown while a segment is in flight, so a long one is not a silent bar. */
export const stageDownloading = (n: number, m: number) =>
  `Downloading segment ${n} of ${m}`;
export const stageJoining = (m: number) => `Joining ${m} segments`;

/**
 * The slice of the 0..99 progress bar a segment owns. One segment owns all of
 * it, exactly as before; several share the first 90, and the join and the
 * hand-off take the rest.
 */
export function segmentWindow(
  index: number,
  count: number,
): { from: number; to: number } {
  if (count <= 1) return { from: 0, to: 99 };
  const span = 90 / count;
  return {
    from: Math.round(span * index),
    to: Math.round(span * (index + 1)),
  };
}

// --- joining --------------------------------------------------------------

/** One line of an ffmpeg concat list. Single quotes are escaped as `'\''`. */
export function concatListLine(file: string): string {
  return `file '${file.replace(/'/g, "'\\''")}'`;
}

export function buildConcatList(files: readonly string[]): string {
  return files.map(concatListLine).join("\n") + "\n";
}

export interface JoinOptions {
  isAudio: boolean;
  /** MP3 bitrate in kbps; only read when `isAudio`. */
  audioKbps?: string;
}

export function concatCopyArgs(
  list: string,
  output: string,
  opts: JoinOptions,
): string[] {
  return [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-c",
    "copy",
    ...(opts.isAudio ? [] : ["-movflags", "+faststart"]),
    output,
  ];
}

export function concatReencodeArgs(
  list: string,
  output: string,
  opts: JoinOptions,
): string[] {
  return [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    ...(opts.isAudio
      ? ["-vn", "-c:a", "libmp3lame", "-b:a", `${opts.audioKbps ?? "192"}k`]
      : [
          "-c:v",
          "libx264",
          "-crf",
          "18",
          "-preset",
          "veryfast",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-movflags",
          "+faststart",
        ]),
    output,
  ];
}

/** `Duration: 00:01:30.50` out of `ffmpeg -i` output, in seconds. */
export function parseDurationSec(text: string): number | undefined {
  const m = text.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!m) return undefined;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + parseFloat(m[3]);
}

export function durationMatches(
  actual: number | undefined,
  expected: number,
  tolerance = DURATION_TOLERANCE_SEC,
): boolean {
  if (actual === undefined || !Number.isFinite(actual)) return false;
  return Math.abs(actual - expected) <= tolerance;
}

export interface JoinDeps {
  /** Runs ffmpeg. Resolves with its exit status and stderr; never rejects. */
  run(args: string[]): Promise<{ code: number | null; stderr: string }>;
  /** Duration in seconds of a finished file, or undefined if unreadable. */
  probeDuration(file: string): number | undefined;
  log(message: string): void;
}

export interface JoinResult {
  /** Which path produced the file. */
  method: "copy" | "reencode";
  /** Duration of the file that was kept. */
  duration?: number;
  /** Why the copy path was not used, when it was not. */
  reason?: string;
  /** False when even the re-encode missed the expected length. */
  durationOk: boolean;
}

/**
 * Joins the segment files with the concat demuxer. Stream copy first: every
 * segment is cut from the same source, so the codec parameters match and a
 * copy is both instant and lossless. If the copy fails, or the file it made is
 * the wrong length, the pieces are re-encoded instead. Which path ran is
 * logged either way.
 */
export async function joinSegments(
  files: readonly string[],
  output: string,
  listPath: string,
  expectedSec: number,
  opts: JoinOptions,
  deps: JoinDeps,
): Promise<JoinResult> {
  fs.writeFileSync(listPath, buildConcatList(files), "utf8");

  let reason: string;
  const copy = await deps.run(concatCopyArgs(listPath, output, opts));
  if (copy.code === 0 && fs.existsSync(output)) {
    const actual = deps.probeDuration(output);
    if (durationMatches(actual, expectedSec)) {
      deps.log(
        `join: stream copy ok (${files.length} segments, ${actual?.toFixed(2)}s, expected ${expectedSec.toFixed(2)}s)`,
      );
      return { method: "copy", duration: actual, durationOk: true };
    }
    reason =
      actual === undefined
        ? "joined file has no readable duration"
        : `joined file is ${actual.toFixed(2)}s, expected ${expectedSec.toFixed(2)}s`;
  } else {
    reason = `ffmpeg -c copy exited ${copy.code}`;
  }
  deps.log(`join: stream copy rejected (${reason}); re-encoding`);

  try {
    fs.rmSync(output, { force: true });
  } catch {
    /* ffmpeg -y overwrites anyway */
  }
  const enc = await deps.run(concatReencodeArgs(listPath, output, opts));
  if (enc.code !== 0 || !fs.existsSync(output)) {
    const tail = enc.stderr.trim().split(/\r?\n/).slice(-6).join("\n");
    const err: any = new Error(
      tail || `ffmpeg (join) exited with code ${enc.code}`,
    );
    err.tail = tail;
    err.joinFailed = true;
    throw err;
  }
  const actual = deps.probeDuration(output);
  const ok = durationMatches(actual, expectedSec);
  deps.log(
    `join: re-encode done (${actual?.toFixed(2) ?? "?"}s, expected ${expectedSec.toFixed(2)}s${ok ? "" : ", STILL OFF"})`,
  );
  return { method: "reencode", duration: actual, reason, durationOk: ok };
}

/**
 * Runs a binary to completion. Never rejects: a spawn error is a status.
 * `onSpawn` hands the child to whoever may need to stop it (a cancelled job
 * kills its join ffmpeg through this); with it the child leads its own process
 * group so the whole tree can be killed, not just the direct child.
 */
export function runProcess(
  bin: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
  onSpawn?: (child: ChildProcess) => void,
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = "";
    let child: ChildProcess;
    try {
      child = spawn(bin, args, {
        env,
        windowsHide: true,
        shell: false,
        detached: !!onSpawn && process.platform !== "win32",
      });
      onSpawn?.(child);
    } catch (e) {
      return resolve({ code: -1, stderr: String(e) });
    }
    child.stdout?.on("data", () => undefined);
    child.stderr?.on("data", (c: Buffer) => {
      stderr = (stderr + c.toString()).slice(-8000);
    });
    child.on("error", (e) => resolve({ code: -1, stderr: String(e) }));
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

export function probeDurationSec(
  ffmpegBin: string,
  file: string,
): number | undefined {
  try {
    const out = spawnSync(ffmpegBin, ["-hide_banner", "-i", file], {
      encoding: "utf8",
      windowsHide: true,
    });
    return parseDurationSec(`${out.stderr ?? ""}${out.stdout ?? ""}`);
  } catch {
    return undefined;
  }
}

// --- temp cleanup ---------------------------------------------------------

/**
 * Empties a clip's work folder of everything except what a retry can resume
 * from: `.part` / `.ytdl` partials and a whole-file `source.*` download. Used
 * on failure. Finished segment files, the concat list and a half-written join
 * are dead weight that would otherwise sit in the temp dir until the weekly
 * sweep, and the next attempt redownloads segments anyway.
 */
export function pruneWorkDir(dir: string): void {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (/\.(part|ytdl)$/.test(name) || /^source\./.test(name)) continue;
    try {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    } catch {
      /* in use or already gone */
    }
  }
}

// --- failures: cause, the one fix, the work kept ---------------------------

export type FailureCode =
  | "stale_session"
  | "private_video"
  | "sign_in_needed"
  | "video_unavailable"
  | "network_dropped"
  | "out_point_past_end"
  | "save_folder_gone"
  | "disk_full"
  | "engine_behind"
  | "join_failed"
  | "unknown";

export type FixId =
  | "reimport_cookies"
  | "import_cookies"
  | "resume"
  | "snap_out_point"
  | "choose_folder"
  | "choose_other_folder"
  | "update_engine"
  | "retry";

export interface ClipFailure {
  code: FailureCode;
  /** HTTP status when this is an outright failure. */
  status: number;
  /** What went wrong, in plain words. */
  cause: string;
  /** The single action that fixes it. `id` is for the UI; `label` is the button. */
  action: { id: FixId; label: string };
  /** What was kept. */
  preserved: string;
  /** cause + action + preserved, as one sentence group for a plain `error`. */
  error: string;
  /** Extra numbers a button needs, e.g. where to snap the out point. */
  detail?: Record<string, number>;
}

function failure(
  code: FailureCode,
  status: number,
  cause: string,
  action: ClipFailure["action"],
  preserved: string,
  detail?: Record<string, number>,
): ClipFailure {
  const end = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
  return {
    code,
    status,
    cause,
    action,
    preserved,
    error: `${end(cause)} ${end(action.label)} ${end(preserved)}`,
    ...(detail ? { detail } : {}),
  };
}

const MARKED_KEPT = "Your marked range is kept.";

export function staleSessionFailure(
  status: number,
  kept = "The clip you got is kept.",
): ClipFailure {
  return failure(
    "stale_session",
    status,
    "YouTube serves higher formats to signed-in requests and the saved session expired, so only 360p was offered",
    { id: "reimport_cookies", label: "Re-import cookies.txt" },
    kept,
  );
}

export function outPointFailure(asked: number, runsTo: number): ClipFailure {
  const fmt = (s: number) => {
    const t = Math.floor(s);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = t % 60;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(h)}:${p(m)}:${p(sec)}`;
  };
  return failure(
    "out_point_past_end",
    400,
    `You asked for ${fmt(asked)} but the video runs to ${fmt(runsTo)}`,
    { id: "snap_out_point", label: "Snap out point to the end" },
    MARKED_KEPT,
    { asked, runsTo },
  );
}

/**
 * A rough guide to how many megabytes per second of finished video a quality
 * costs, so "needs about N MB" is a believable number rather than a guess at
 * nothing. Deliberately generous: this is only ever shown after a real
 * out-of-space error.
 */
export function estimateNeededMb(
  totalSeconds: number,
  quality: string,
  isAudio: boolean,
  segmentCount: number,
): number {
  const h = Number(quality);
  let perSec = 1.2; // best / 1080p
  if (isAudio) perSec = 0.04;
  else if (Number.isFinite(h)) {
    perSec = h >= 2160 ? 6 : h >= 1440 ? 3.2 : h >= 1080 ? 1.2 : h >= 720 ? 0.7 : h >= 480 ? 0.4 : 0.25;
  } else if (quality === "best") perSec = 1.5;
  // Segments sit on disk beside the joined file, so a join needs both.
  const copies = segmentCount > 1 ? 2 : 1;
  return Math.max(1, Math.ceil(totalSeconds * perSec * copies * 1.25));
}

export interface FailureContext {
  /** Percent reached when the run stopped, for "Resume from N%". */
  percent?: number;
  /** Bytes sitting in `.part` files. */
  partialBytes?: number;
  neededMb?: number;
  freeMb?: number;
}

const PATTERNS = {
  private:
    /private video|video is private|members[- ]only|join this channel|available to this channel'?s members|requires? (?:a )?(?:membership|payment)/i,
  noFfmpeg: /ffprobe and ffmpeg not found|ffmpeg not found|ffmpeg is not installed/i,
  permission: /EACCES|EPERM|permission denied/i,
  disk: /ENOSPC|no space left on device|not enough space|disk full/i,
  folder: /ENOTDIR|\bENOENT\b|no such file or directory|Errno 2\b/i,
  spawnMissing: /spawn [^\n]*ENOENT/i,
  network:
    /ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|EPIPE|timed out|connection (?:reset|refused|aborted)|network is unreachable|temporary failure in name resolution|unable to download (?:webpage|video data)|read timed out|incomplete ?read|HTTP Error 5\d\d|server closed|unexpected eof|Connection reset by peer|I\/O error/i,
  engine:
    /unable to extract|nsig|signature extraction|please report this issue|player response|yt-dlp -U|update yt-dlp|confirm you.re on the latest version|no video formats found|sabr/i,
};

/**
 * Maps a failed run onto the failure table. Every row names its cause in
 * plain words, offers the one action that fixes it, and says what was kept.
 * Anything that matches no row still comes out in the same shape, with the
 * real text as the cause, rather than a bare error string.
 */
export function classifyFailure(
  message: string,
  ctx: FailureContext = {},
): ClipFailure {
  const text = message || "";
  const kept = (extra?: string) => `${MARKED_KEPT}${extra ? ` ${extra}` : ""}`;

  const reason = ytReasonOf(text);
  if (reason && (reason.kind === "age" || reason.kind === "signin")) {
    return failure(
      "sign_in_needed",
      403,
      reason.sentence,
      { id: "import_cookies", label: "Import cookies from a signed-in account" },
      kept(),
    );
  }
  if (reason && (reason.kind === "removed" || reason.kind === "region" || reason.kind === "live")) {
    return failure(
      "video_unavailable",
      404,
      reason.sentence,
      { id: "retry", label: reason.kind === "live" ? "Try again once it has started" : "Try a different video" },
      kept(),
    );
  }
  if (reason?.kind === "refused") return refusedFailure("");
  if (PATTERNS.noFfmpeg.test(text)) {
    return failure(
      "unknown",
      500,
      "Clipr's video tools are incomplete on this computer",
      { id: "retry", label: "Restart Clipr to repair them" },
      kept(),
    );
  }
  if (!PATTERNS.disk.test(text) && PATTERNS.permission.test(text)) {
    return failure(
      "save_folder_gone",
      500,
      "Clipr can't write to that folder",
      { id: "choose_folder", label: "Choose a folder" },
      kept(),
    );
  }
  if (PATTERNS.private.test(text)) {
    return failure(
      "private_video",
      403,
      "This video is private or members-only and needs an account that can see it",
      { id: "import_cookies", label: "Import cookies from that account" },
      kept(),
    );
  }
  if (PATTERNS.disk.test(text)) {
    const needed = ctx.neededMb;
    const free = ctx.freeMb;
    const cause =
      needed !== undefined && free !== undefined
        ? `The disk is full: this clip needs about ${needed} MB and ${free} MB is free`
        : "The disk is full, so the clip could not be written";
    return failure(
      "disk_full",
      507,
      cause,
      { id: "choose_other_folder", label: "Choose another folder" },
      kept("What was downloaded so far is kept."),
    );
  }
  if (!PATTERNS.spawnMissing.test(text) && PATTERNS.folder.test(text)) {
    return failure(
      "save_folder_gone",
      500,
      "The folder this clip was being written to was renamed, deleted, or is on a drive that is no longer mounted",
      { id: "choose_folder", label: "Choose a folder" },
      kept(),
    );
  }
  if (PATTERNS.network.test(text)) {
    const pct = Math.max(0, Math.min(99, Math.round(ctx.percent ?? 0)));
    const mb = ctx.partialBytes ? ctx.partialBytes / (1024 * 1024) : 0;
    return failure(
      "network_dropped",
      502,
      `The connection dropped and the download stopped at ${pct}%`,
      { id: "resume", label: `Resume from ${pct}%` },
      kept(
        mb > 0
          ? `The ${mb.toFixed(1)} MB already fetched is on disk.`
          : "Anything already fetched is on disk.",
      ),
      { percent: pct },
    );
  }
  if (PATTERNS.engine.test(text)) {
    return failure(
      "engine_behind",
      502,
      "YouTube changed something this version of the download engine cannot read",
      { id: "update_engine", label: "Update the engine" },
      kept(),
    );
  }
  const tail = text.trim();
  return failure(
    "unknown",
    500,
    tail || "The download failed for a reason yt-dlp did not explain",
    { id: "retry", label: "Try again" },
    kept("Anything already fetched is on disk."),
  );
}

/** A 403 or a failed fetch of the media itself: not one of the seven rows. */
export function refusedFailure(_tail = ""): ClipFailure {
  return failure(
    "unknown",
    500,
    "YouTube refused the media request for this video",
    { id: "retry", label: "Try again in a moment, or pick a different quality" },
    `${MARKED_KEPT} Anything already fetched is on disk.`,
  );
}

/** The join step failing is its own row: the pieces are fine, the stitch is not. */
export function joinFailure(tail: string): ClipFailure {
  return failure(
    "join_failed",
    500,
    `The segments downloaded but could not be joined${tail ? `: ${tail.split(/\r?\n/).pop()}` : ""}`,
    { id: "retry", label: "Try again" },
    `${MARKED_KEPT} Every segment is still marked.`,
  );
}

// --- never let a 360p result pass silently ---------------------------------

/**
 * True when a clip landed at 360p or below although something better was
 * wanted, and no valid session was used. That is the signature of an expired
 * or absent sign-in, and it is never to be handed over without saying so.
 *
 * `sessionValid` is true only when the session was confirmed (the probe said
 * signed in). An unconfirmed or stale session counts as not valid, because a
 * confirmed one that still yields 360p is a different problem (the video, or
 * a player client) that the degraded-delivery check already handles.
 */
export function lowQualityWithoutSession(args: {
  deliveredHeight: number | undefined;
  requested: number | "best";
  sessionValid: boolean;
  isAudio: boolean;
}): boolean {
  const { deliveredHeight, requested, sessionValid, isAudio } = args;
  if (isAudio || sessionValid) return false;
  if (!deliveredHeight || deliveredHeight > 360) return false;
  return requested === "best" || requested > 360;
}
