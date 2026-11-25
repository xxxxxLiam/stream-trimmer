/**
 * File: qualityCheck.ts
 * Path: src/main/features/engine/services/download/qualityCheck.ts
 * Description: Checks what resolution was actually delivered, re-runs once on other player clients when it is far below what was listed, and flags a sign-in problem.
 */
import fs from "node:fs";
import path from "node:path";
import { BEST_HEIGHT_CAP, isDegradedDelivery } from "../../utils/quality";
import { lowQualityWithoutSession, staleSessionFailure } from "../segments";
import { probeDelivered, resolvedFfmpeg } from "../binaries";
import { CancelledError } from "../downloadJobs";
import { publishProgress } from "../progressChannel";
import { DownloadCtx } from "./jobContext";
import { Workspace } from "./workspace";
import { PLAYER_CLIENTS_FALLBACK } from "./ytdlpOptions";

export type DeliveryReport = Awaited<ReturnType<typeof checkDelivery>>;

export async function checkDelivery(
  ctx: DownloadCtx,
  ws: Workspace,
  buildClip: (clients: string) => Promise<void>,
) {
  const { quality, cookieMode, jobId, job, isAudio, ext } = ctx;
  const { clipDir, outputPath } = ws;
    let delivered = probeDelivered(outputPath, resolvedFfmpeg as string);

    // The 360p-from-a-1080p-video bug was invisible for months because the
    // two numbers that prove it — what the probe listed and what came out —
    // only ever met in a log line. A clip that lands below half of what both
    // the request and the probe said was reachable is not a compromise, it is
    // a player client that handed back nothing usable, so it is worth paying
    // for one more download on a different client set before giving up.
    const requestedHeight: number | "best" =
      quality === "best" ? BEST_HEIGHT_CAP : Number(quality);
    let degraded = isDegradedDelivery(
      delivered.height,
      requestedHeight,
      ctx.availableHeights,
    );
    if (degraded) {
      console.warn(
        `[server] /api/download degraded job=${jobId} requested=${quality} delivered=${delivered.height ?? "?"} available=${ctx.availableHeights.join(",") || "unknown"} — rebuilding on ${PLAYER_CLIENTS_FALLBACK}`,
      );
      publishProgress(jobId, {
        phase: "downloading",
        percent: 0,
        message:
          "YouTube served a much lower resolution than it listed — retrying with a different player client.",
      });
      // The degraded clip is moved aside rather than deleted: if the retry
      // fails outright the user still gets a watchable clip instead of an
      // error, which is what they had before this check existed.
      const keptPath = path.join(clipDir, `degraded.${ext}`);
      const keptFormat = ctx.chosenFormat;
      try {
        fs.rmSync(keptPath, { force: true });
      } catch {
        /* ignore */
      }
      fs.renameSync(outputPath, keptPath);
      try {
        ctx.chosenFormat = "";
        await buildClip(PLAYER_CLIENTS_FALLBACK);
        if (!fs.existsSync(outputPath)) {
          throw new Error("yt-dlp produced no output");
        }
      } catch (retryErr) {
        if (job.cancelled || retryErr instanceof CancelledError) throw retryErr;
        const why =
          retryErr instanceof Error ? retryErr.message : String(retryErr);
        console.warn(
          `[server] /api/download degraded retry failed job=${jobId}: ${why} — keeping the ${delivered.height ?? "?"}p clip`,
        );
        ctx.chosenFormat = keptFormat;
        try {
          fs.rmSync(outputPath, { force: true });
        } catch {
          /* ignore */
        }
        fs.renameSync(keptPath, outputPath);
      }
      try {
        fs.rmSync(keptPath, { force: true });
      } catch {
        /* ignore */
      }
      publishProgress(jobId, { phase: "processing", percent: 99 });
      delivered = probeDelivered(outputPath, resolvedFfmpeg as string);
      degraded = isDegradedDelivery(
        delivered.height,
        requestedHeight,
        ctx.availableHeights,
      );
    }

    // A 360p file with no confirmed session behind it is the expired-sign-in
    // failure, not a quality choice. The clip is still delivered (it is real
    // work), but it never passes silently: the cause and the one fix travel
    // with it.
    const lowQuality = lowQualityWithoutSession({
      deliveredHeight: delivered.height,
      requested: requestedHeight,
      sessionValid: ctx.sessionConfirmed,
      isAudio,
    })
      ? staleSessionFailure(200, "The 360p clip is kept.")
      : null;
    if (lowQuality) {
      console.warn(
        `[server] /api/download low quality without a session job=${jobId} delivered=${delivered.height} auth=${cookieMode} confirmed=${ctx.sessionConfirmed}`,
      );
    }

  return { delivered, degraded, lowQuality };
}
