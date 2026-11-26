/**
 * File: downloadService.ts
 * Path: src/main/features/engine/services/download/downloadService.ts
 * Description: Runs one /api/download request: validate, confirm the session, probe, build the clip and hand it over, in that order.
 */
import { type Request, type Response } from "express";
import fs from "node:fs";
import { STAGE_FOUND, classifyFailure, pruneWorkDir } from "../segments";
import { BIN_DIR } from "../binaries";
import { CancelledError } from "../downloadJobs";
import { publishProgress } from "../progressChannel";
import { fullErrMessage, sendFailure } from "../../utils/errors";
import { RETRY_SENTENCE, rowStateFor } from "../../../../../common/types/clipRowState";
import { updateTools } from "../toolUpdater";
import { runWithToolRetry } from "./toolRetry";
import { createClipBuilder } from "./clipBuild";
import { handleFailure } from "./failureResponse";
import { createDownloadCtx } from "./jobContext";
import { probeSource } from "./probePhase";
import { createRunner } from "./progressRunner";
import { checkDelivery } from "./qualityCheck";
import { parseDownloadRequest } from "./requestInput";
import { setDeliveryHeaders } from "./responseHeaders";
import { verifySession } from "./sessionPhase";
import { sendClip } from "./transferClip";
import { createWorkspace } from "./workspace";
import { potBaseUrl } from "./potTokenProvider";
import { PLAYER_CLIENTS_FALLBACK, PLAYER_CLIENTS_PRIMARY, PLAYER_CLIENTS_PRIMARY_WITH_POT, createOptionBuilders } from "./ytdlpOptions";

export async function runDownload(req: Request, res: Response) {
  const input = parseDownloadRequest(req, res);
  if (!input) return;
  const ctx = createDownloadCtx(req, res, input);
  const { jobId, throwIfCancelled } = ctx;

  if (await verifySession(ctx)) return;
  if (await probeSource(ctx)) return;
  publishProgress(jobId, {
    phase: "downloading",
    percent: 0,
    message: STAGE_FOUND,
  });

  const ws = createWorkspace(ctx);
  const { outputPath, tempDir, releaseWork, resumeBytes } = ws;
  // Null (and near-instant) until `npm run tools:refresh` has vendored a provider — see potTokenProvider.ts.
  // Starting it is cached process-wide, so only the first request in a run pays for it.
  const pot = ctx.isYouTube ? await potBaseUrl() : null;
  const primaryClients = pot ? PLAYER_CLIENTS_PRIMARY_WITH_POT : PLAYER_CLIENTS_PRIMARY;
  const builders = createOptionBuilders(ctx, ws, pot);
  ctx.options = builders.sectionOptionsFor(
    primaryClients,
    ctx.segs[0],
    ws.segFiles[0],
    ctx.cookieOptions,
  );
  const runner = createRunner(ctx);
  const { buildClip } = createClipBuilder(ctx, ws, builders, runner);

  try {
    publishProgress(jobId, {
      phase: "downloading",
      percent: 0,
      ...(resumeBytes > 0
        ? {
            message: `Resuming — ${(resumeBytes / (1024 * 1024)).toFixed(1)} MB already downloaded`,
          }
        : {}),
    });

    console.log(
      `[server] download job=${jobId} using binDir=${BIN_DIR ?? "(none)"}`,
    );
    // A failure of the "tools out of date" class updates yt-dlp quietly and tries this clip
    // once more. The clip's row says so in one sentence; nothing else is shown.
    const attempt = (clients: string) =>
      runWithToolRetry(() => buildClip(clients), {
        isToolError: (e) => classifyFailure(fullErrMessage(e)).code === "engine_behind",
        update: async (willUpdate) => (await updateTools({ onUpdating: willUpdate })).updated,
        onRetrying: (e) =>
          publishProgress(jobId, {
            phase: "downloading",
            percent: ctx.lastReported,
            message: RETRY_SENTENCE,
            row: rowStateFor(classifyFailure(fullErrMessage(e)), { retrying: true }),
          }),
        beforeRetry: () => {
          throwIfCancelled();
          pruneWorkDir(tempDir);
        },
      });
    try {
      await attempt(primaryClients);
    } catch (e) {
      // The format ladder ends in a bare `best`, so this means the player client itself handed back
      // no formats at all — not a quality that can step down, a different client to ask instead. Only
      // this one cause gets a second whole attempt: anything else (including a cancel) is final here.
      if (ctx.job.cancelled || e instanceof CancelledError || classifyFailure(fullErrMessage(e)).code !== "format_unavailable") {
        throw e;
      }
      console.warn(
        `[server] /api/download format_unavailable job=${jobId} on ${primaryClients} — retrying on ${PLAYER_CLIENTS_FALLBACK}`,
      );
      publishProgress(jobId, {
        phase: "downloading",
        percent: 0,
        message: "That player client offered nothing downloadable — retrying with a different one.",
      });
      throwIfCancelled();
      pruneWorkDir(tempDir);
      await attempt(PLAYER_CLIENTS_FALLBACK);
    }
    throwIfCancelled();

    if (!fs.existsSync(outputPath)) {
      // Resumable partials deliberately kept so the next attempt can resume.
      pruneWorkDir(tempDir);
      releaseWork(false);
      const f = classifyFailure("yt-dlp produced no output");
      publishProgress(jobId, {
        phase: "error",
        percent: 0,
        message: "no output",
      });
      return sendFailure(res, f, ctx.diag("yt-dlp produced no output"));
    }

    publishProgress(jobId, { phase: "processing", percent: 99 });

    const report = await checkDelivery(ctx, ws, buildClip);
    setDeliveryHeaders(ctx, report);
    return sendClip(ctx, ws, report.lowQuality);
  } catch (e) {
    return handleFailure(ctx, ws, runner, e);
  }
}
