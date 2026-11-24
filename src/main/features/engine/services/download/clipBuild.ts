/**
 * File: clipBuild.ts
 * Path: src/main/features/engine/services/download/clipBuild.ts
 * Description: Builds the clip: each segment (sectioned download, or whole file then local trim), the join and the cleanup of intermediates.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { joinSegments, probeDurationSec, runProcess, segmentWindow, stageDownloaded, stageDownloading, stageJoining } from "../segments";
import { childEnv, resolvedFfmpeg, yt } from "../binaries";
import { withRunCookies } from "../cookies";
import { CancelledError } from "../downloadJobs";
import { publishProgress } from "../progressChannel";
import { localTrimArgs } from "../../utils/trimArgs";
import { DownloadCtx } from "./jobContext";
import { Runner } from "./progressRunner";
import { Workspace } from "./workspace";
import { createOptionBuilders } from "./ytdlpOptions";

export function createClipBuilder(
  ctx: DownloadCtx,
  ws: Workspace,
  builders: ReturnType<typeof createOptionBuilders>,
  runner: Runner,
) {
  const { sectionOptionsFor, fullOptionsFor } = builders;
  const { runStreaming, isForbidden } = runner;
  const { url, quality, segs, segCount, multi, totalSec, cookieOptions, cookieMode, jobId, job, isAudio, throwIfCancelled, trackChild, ytOpts } = ctx;
  const { tempDir, outputPath, segFiles, listPath, fullPath } = ws;
  // A finished whole-file download. A `.part` is not one: yt-dlp renames it
  // only once the file is complete.
  const findDownloaded = (): string | null => {
    if (fs.existsSync(fullPath)) return fullPath;
    const match = fs
      .readdirSync(tempDir)
      .filter((f) => f.startsWith("source.") && !/\.(part|ytdl)$/.test(f))
      .map((f) => path.join(tempDir, f))[0];
    return match ?? null;
  };

  // ffmpeg can find a duration in it. A file that was renamed into place
  // part-way (no moov atom) or is otherwise not media has none.
  const isReadableMedia = (file: string): boolean =>
    probeDurationSec(resolvedFfmpeg as string, file) !== undefined;

  // Everything a build leaves beside the finished clip: segment files, the
  // concat list and the whole-file source. Partials (`.part`) are never
  // touched, they are what a retry resumes from.
  const dropIntermediates = (keepSource: boolean) => {
    const doomed = [...segFiles, listPath];
    if (!keepSource) {
      try {
        for (const f of fs.readdirSync(tempDir)) {
          if (f.startsWith("source.") && !/\.(part|ytdl)$/.test(f)) {
            doomed.push(path.join(tempDir, f));
          }
        }
      } catch {
        /* folder gone */
      }
    }
    for (const f of doomed) {
      try {
        fs.rmSync(f, { force: true });
      } catch {
        /* ignore */
      }
    }
  };

  // One segment on one set of player clients: sectioned first, whole-file-then-
  // trim if the sectioned URLs 403. `state.sectionsForbidden` carries the 403
  // verdict from one segment to the next, so the rest go straight to the local
  // trim instead of failing the same way again.
  const buildSegment = async (
    clients: string,
    index: number,
    state: { sectionsForbidden: boolean },
  ): Promise<void> => {
    throwIfCancelled();
    const seg = segs[index];
    const out = segFiles[index];
    const win = segmentWindow(index, segCount);
    ctx.segDuration = Math.max(0.1, seg.end - seg.start);
    // Segment one is the one run allowed to refresh the user's saved session;
    // every other is a throwaway copy.
    await withRunCookies(cookieMode, cookieOptions, index === 0, async (cookies) => {
      const sectionOptions = sectionOptionsFor(clients, seg, out, cookies);
      ctx.options = sectionOptions;
      ctx.lastReported = win.from;
      ctx.scaleFrom = win.from;
      ctx.scaleTo = win.to;
      if (!state.sectionsForbidden) {
        console.log(
          `[server] /api/download exec job=${jobId} url=${url} segment=${index + 1}/${segCount} options=${JSON.stringify(sectionOptions)}`,
        );
        try {
          await runStreaming(
            () => yt!.exec(url, sectionOptions, ytOpts()),
            "yt-dlp",
          );
          return;
        } catch (sectionErr) {
          if (job.cancelled || sectionErr instanceof CancelledError) throw sectionErr;
          if (!isForbidden(sectionErr)) throw sectionErr;
          state.sectionsForbidden = true;
          console.warn(
            `[server] sectioned download failed (403) job=${jobId} — retrying with full download + local trim`,
          );
        }
      }

      const fullOptions = fullOptionsFor(clients, cookies);
      ctx.options = fullOptions;
      // One segment splits the bar 70/29 exactly as it always has.
      const mid =
        segCount <= 1
          ? 70
          : Math.round(win.from + (win.to - win.from) * 0.7);
      ctx.lastReported = win.from;
      ctx.scaleFrom = win.from;
      ctx.scaleTo = mid;
      publishProgress(jobId, {
        phase: "downloading",
        percent: win.from,
        message: ctx.currentStage,
        stage: ctx.currentStage,
      });
      // The whole file is the same for every segment, so fetch it once. A
      // copy left by an earlier run is only trusted once ffmpeg can read it:
      // a truncated one used to be kept and re-used forever.
      let source = findDownloaded();
      if (source && source !== ctx.verifiedSource && !isReadableMedia(source)) {
        console.warn(
          `[server] job=${jobId} cached download ${source} is not readable media — discarding and fetching it again`,
        );
        try {
          fs.rmSync(source, { force: true });
        } catch {
          /* ignore */
        }
        source = null;
      }
      if (!source) {
        await runStreaming(
          () => yt!.exec(url, fullOptions, ytOpts()),
          "yt-dlp (full)",
        );
        source = findDownloaded();
      }
      if (!source) throw new Error("yt-dlp produced no output");
      if (source !== ctx.verifiedSource) {
        if (!isReadableMedia(source)) {
          try {
            fs.rmSync(source, { force: true });
          } catch {
            /* ignore */
          }
          throw new Error(
            "The downloaded video file is damaged and was discarded, so nothing could be cut from it",
          );
        }
        ctx.verifiedSource = source;
      }

      ctx.scaleFrom = mid;
      ctx.scaleTo = win.to;
      ctx.lastReported = mid;
      const trimArgs = isAudio
        ? [
            "-hide_banner",
            "-y",
            "-ss",
            String(seg.start),
            "-to",
            String(seg.end),
            "-i",
            source,
            "-vn",
            "-c:a",
            "libmp3lame",
            "-b:a",
            `${quality}k`,
            out,
          ]
        : localTrimArgs(source, seg, out);
      await runStreaming(
        () =>
          spawn(resolvedFfmpeg as string, trimArgs, {
            env: childEnv(),
            windowsHide: true,
            shell: false,
            detached: process.platform !== "win32",
          }),
        "ffmpeg (trim)",
      );
      // A lone segment is done with the source. Several share it, so it goes
      // when the whole clip is built.
      if (!multi) {
        try {
          fs.rmSync(source, { force: true });
        } catch {
          /* ignore */
        }
      }
    });
  };

  // How the last join was made, for the response and the log.

  // One complete build of the clip on one set of player clients: each segment
  // in order, then (for several) the join into one file.
  const buildClip = async (clients: string): Promise<void> => {
    ctx.lastReported = 0;
    let built = false;
    const state = { sectionsForbidden: false };
    try {
      for (let i = 0; i < segCount; i++) {
        ctx.currentStage = stageDownloading(i + 1, segCount);
        publishProgress(jobId, {
          phase: "downloading",
          percent: Math.max(ctx.lastReported, segmentWindow(i, segCount).from),
          message: ctx.currentStage,
          stage: ctx.currentStage,
          segment: i + 1,
          segments: segCount,
        });
        await buildSegment(clients, i, state);
        const win = segmentWindow(i, segCount);
        ctx.currentStage = stageDownloaded(i + 1, segCount);
        ctx.lastReported = Math.max(ctx.lastReported, win.to);
        publishProgress(jobId, {
          phase: "downloading",
          percent: win.to,
          message: ctx.currentStage,
          stage: ctx.currentStage,
          segment: i + 1,
          segments: segCount,
        });
      }

      if (multi) {
        throwIfCancelled();
        ctx.currentStage = stageJoining(segCount);
        publishProgress(jobId, {
          phase: "processing",
          percent: 92,
          message: ctx.currentStage,
          stage: ctx.currentStage,
        });
        const join = await joinSegments(
          segFiles,
          outputPath,
          listPath,
          totalSec,
          { isAudio, audioKbps: quality },
          {
            // The join ffmpeg is a child of the job like any other: a cancel
            // kills it, and once cancelled no further join attempt starts.
            run: (args) =>
              job.cancelled
                ? Promise.resolve({ code: -1, stderr: "cancelled" })
                : runProcess(
                    resolvedFfmpeg as string,
                    args,
                    childEnv(),
                    trackChild,
                  ),
            probeDuration: (file) =>
              probeDurationSec(resolvedFfmpeg as string, file),
            log: (m) => console.log(`[server] /api/download job=${jobId} ${m}`),
          },
        );
        throwIfCancelled();
        ctx.joinMethod = join.method;
        if (!join.durationOk) {
          // The server's own check says this is not the clip that was marked.
          // Delivering it as a success is how a wrong clip got silently saved;
          // fail instead, with the pieces' measurements in the message.
          const got =
            join.duration === undefined
              ? "of unreadable length"
              : `${join.duration.toFixed(2)}s long`;
          const msg = `The joined clip came out ${got} but the marked ranges total ${totalSec.toFixed(2)}s`;
          console.warn(
            `[server] /api/download job=${jobId} ${msg} even after ${join.method} — failing the job`,
          );
          try {
            fs.rmSync(outputPath, { force: true });
          } catch {
            /* ignore */
          }
          const err: any = new Error(msg);
          err.tail = msg;
          err.joinFailed = true;
          throw err;
        }
      }
      if (!multi && fs.existsSync(segFiles[0])) {
        // The finished segment is the clip. A rename within the temp root is
        // atomic and leaves no `.part` behind it.
        fs.renameSync(segFiles[0], outputPath);
      }
      built = true;
    } finally {
      // Success or failure, the pieces are not the deliverable. On success the
      // whole-file source goes too; on failure it stays, a resumable download.
      dropIntermediates(!built);
    }
  };

  return { buildClip };
}
