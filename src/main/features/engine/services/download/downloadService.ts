/**
 * File: downloadService.ts
 * Path: src/main/features/engine/services/download/downloadService.ts
 * Description: Runs one /api/download request: validate, confirm the session, probe, build the clip and hand it over, in that order.
 */
import { type Request, type Response } from "express";
import fs from "node:fs";
import { STAGE_FOUND, classifyFailure, pruneWorkDir } from "../segments";
import { BIN_DIR } from "../binaries";
import { publishProgress } from "../progressChannel";
import { sendFailure } from "../../utils/errors";
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
import { PLAYER_CLIENTS_PRIMARY, createOptionBuilders } from "./ytdlpOptions";

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
  const builders = createOptionBuilders(ctx, ws);
  ctx.options = builders.sectionOptionsFor(
    PLAYER_CLIENTS_PRIMARY,
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
    await buildClip(PLAYER_CLIENTS_PRIMARY);
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
