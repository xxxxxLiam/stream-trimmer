/**
 * File: transferClip.ts
 * Path: src/main/features/engine/services/download/transferClip.ts
 * Description: Hands the finished clip over: its path for the desktop app, or the bytes as the response body.
 */
import { type Response } from "express";
import fs from "node:fs";
import { STAGE_WRITING } from "../segments";
import { holdFolder } from "../resumeCache";
import { publishProgress } from "../progressChannel";
import { DownloadCtx } from "./jobContext";
import { DeliveryReport } from "./qualityCheck";
import { Workspace } from "./workspace";

export function sendClip(ctx: DownloadCtx, ws: Workspace, lowQuality: DeliveryReport["lowQuality"]): void | Response {
  const { res, deliver, segCount, jobId, job, isAudio, ext } = ctx;
  const { clipDir, outputPath, releaseWork, cleanup } = ws;
    // The clip is built: from here on it is a transfer, not a build.
    job.building = false;
    const stat = fs.statSync(outputPath);
    publishProgress(jobId, {
      phase: "processing",
      percent: 99,
      message: STAGE_WRITING,
      stage: STAGE_WRITING,
    });

    // Desktop app: hand back the location, not the media. Sending a clip as
    // an HTTP body means the UI buffers the whole file, converts it to an
    // ArrayBuffer and copies it across IPC to be written — several complete
    // copies of a file that can run to hundreds of megabytes, purely to move
    // it between two processes on the same machine. The main process opens
    // the file directly instead. `tempDir` is deliberately NOT cleaned up
    // here; whoever moves the file removes it (and startup sweeps orphans).
    if (deliver === "path") {
      console.log(
        `[server] /api/download handing off job=${jobId} bytes=${stat.size}`,
      );
      publishProgress(jobId, {
        phase: "done",
        percent: 100,
        ...(lowQuality ? { message: lowQuality.error } : {}),
      });
      // The clip's only copy is in clipDir until the main process moves it, so
      // Clear cache must leave it alone for a while after this response.
      holdFolder(clipDir);
      releaseWork(true);
      return res.json({
        path: outputPath,
        size: stat.size,
        segments: segCount,
        ...(ctx.joinMethod ? { joinMethod: ctx.joinMethod } : {}),
        ...(lowQuality
          ? {
              warning: {
                code: lowQuality.code,
                cause: lowQuality.cause,
                action: lowQuality.action,
                preserved: lowQuality.preserved,
                error: lowQuality.error,
              },
            }
          : {}),
      });
    }

    const name = `clip.${ext}`;
    res.setHeader("Content-Type", ext === "m4a" ? "audio/mp4" : isAudio ? "audio/mpeg" : "video/mp4");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    console.log(
      `[server] /api/download sending job=${jobId} bytes=${stat.size}`,
    );

    // The clip is finished at this point; everything below is the transfer.
    // It used to be untraced: a connection that broke mid-body left no log
    // line at all, and an 'error' on the response with no listener is an
    // unhandled stream error in-process. A client that sees "failed to fetch"
    // after a completed download is exactly this window, so it is now
    // reported with the byte count that got through.
    const stream = fs.createReadStream(outputPath);
    let sent = 0;
    let settled = false;
    const settle = (why: string, err?: unknown) => {
      if (settled) return;
      settled = true;
      const ok = sent === stat.size && res.writableEnded;
      if (ok) {
        console.log(
          `[server] /api/download sent job=${jobId} bytes=${sent}`,
        );
        publishProgress(jobId, { phase: "done", percent: 100 });
      } else {
        const detail = err instanceof Error ? `: ${err.message}` : "";
        console.error(
          `[server] /api/download transfer failed job=${jobId} ${why} sent=${sent}/${stat.size}${detail}`,
        );
        publishProgress(jobId, {
          phase: "error",
          percent: 0,
          message: `The clip was built but only ${sent} of ${stat.size} bytes reached the app (${why}).`,
        });
      }
      stream.destroy();
      // Only a completed transfer clears the work folder; a broken one keeps
      // the finished clip (held, so Clear cache leaves it for a while).
      if (ok) cleanup();
      else {
        holdFolder(clipDir);
        releaseWork(true);
      }
    };


    stream.on("data", (chunk) => {
      sent += chunk.length;
    });
    stream.on("error", (err) => settle("read error", err));
    res.on("error", (err) => settle("response error", err));
    res.on("close", () => settle("connection closed early"));
    stream.pipe(res);
}
