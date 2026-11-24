/**
 * File: progressRunner.ts
 * Path: server/services/download/progressRunner.ts
 * Description: Streams a child process's output into the progress bar and the run's stderr record.
 */
import { type ChildProcess } from "node:child_process";
import { CancelledError } from "../downloadJobs";
import { publishProgress } from "../progressChannel";
import { DownloadCtx } from "./jobContext";

export type Runner = ReturnType<typeof createRunner>;

export function createRunner(ctx: DownloadCtx) {
  const { jobId, job, trackChild } = ctx;
  // Progress is driven by ffmpeg's `... time=HH:MM:SS.ss ...` output, which
  // streams continuously as the clip is processed (yt-dlp routes section
  // downloads through ffmpeg with --download-sections). Progress =
  // processed time / segment length. yt-dlp's own `[download] NN%` only
  // appears once at the very end, so it's used only as a fallback.
  // The named stage the bar is currently in; carried on every tick so the UI
  // always says what the percentage is a percentage of.
  // Progress window the current phase maps onto (fallback splits the bar).
  const report = (fraction: number) => {
    const pct = Math.min(
      99,
      Math.round(ctx.scaleFrom + (ctx.scaleTo - ctx.scaleFrom) * Math.min(1, fraction)),
    );
    if (pct > ctx.lastReported) {
      ctx.lastReported = pct;
      publishProgress(jobId, {
        phase: "downloading",
        percent: pct,
        message: ctx.currentStage,
        stage: ctx.currentStage,
      });
    }
  };
  const hmsToSeconds = (h: string, m: string, s: string) =>
    Number(h) * 3600 + Number(m) * 60 + parseFloat(s);
  // yt-dlp announces its pick as "Downloading 1 format(s): 299+140" — keep it
  // so a silent quality downgrade is diagnosable from the log and the client.
  const updateFromLine = (line: string) => {
    const fm = line.match(/Downloading\s+\d+\s+format\(s\):\s*([\w+\-.,]+)/);
    if (fm) {
      ctx.chosenFormat = fm[1];
      console.log(`[server] yt-dlp selected format(s)=${ctx.chosenFormat}`);
    }
    const tm = line.match(/time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
    if (tm) {
      const secs = hmsToSeconds(tm[1], tm[2], tm[3]);
      // Ignore ffmpeg's initial bogus negative timestamp.
      if (secs >= 0) report(secs / ctx.segDuration);
      return;
    }
    // Fallback: honor a real yt-dlp download percentage if one is emitted.
    const dm = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    if (dm) report(parseFloat(dm[1]) / 100);
  };


  // Everything the engine wrote to stderr during THIS run, for Copy diagnostics.
  const RUN_STDERR_MAX = 60_000;

  // Spawn a child and stream its output through updateFromLine, rejecting with
  // the trimmed stderr tail on non-zero exit.
  const runStreaming = (
    spawnChild: () => ChildProcess,
    label: string,
  ): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (job.cancelled) return reject(new CancelledError());
      const child = spawnChild();
      trackChild(child);
      ctx.runStderrRaw = `${ctx.runStderrRaw}# ${label}\n`.slice(-RUN_STDERR_MAX);
      child.stderr?.on("data", (c: Buffer | string) => {
        ctx.runStderrRaw = (ctx.runStderrRaw + c.toString()).slice(-RUN_STDERR_MAX);
      });
      let buf = "";
      let stderrTail = "";
      const onChunk = (chunk: Buffer | string) => {
        const s = chunk.toString();
        buf += s;
        stderrTail = (stderrTail + s).slice(-4000);
        const parts = buf.split(/\r|\n/);
        buf = parts.pop() || "";
        for (const line of parts) updateFromLine(line);
      };
      child.stdout?.on("data", onChunk);
      child.stderr?.on("data", onChunk);
      child.on("error", reject);
      child.on("close", (code) => {
        if (buf) updateFromLine(buf);
        if (job.cancelled) return reject(new CancelledError());
        if (code === 0) return resolve();
        const tail = stderrTail
          .split(/\r?\n/)
          .filter((l) => l.trim() && !/^\[download\]\s+\d/.test(l))
          .slice(-8)
          .join("\n")
          .trim();
        console.error(`[server] ${label} exit ${code} job=${jobId}:\n${tail}`);
        const err: any = new Error(tail || `${label} exited with code ${code}`);
        err.tail = tail;
        reject(err);
      });
    });

  // A 403 on the media URL, or any ffmpeg failure while it fetches the stream
  // itself (including crashes on m3u8 input), means the sectioned path is
  // unusable for this video — retry via the whole-file + local-trim path.
  const isForbidden = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      /403|Forbidden|ffmpeg exited with code|fragment.*not found/i.test(msg)
    );
  };

  return { runStreaming, isForbidden };
}
