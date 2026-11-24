/**
 * File: channelRoutes.ts
 * Path: src/main/features/engine/routes/channelRoutes.ts
 * Description: Channel profile exporter routes (/api/channel/export, /cancel,
 * /progress). Kept in its own module so scripts/build-server.cjs can alias it
 * to channelRoutes.stub.ts in a public build: the code then never enters the
 * packaged bundle at all, rather than sitting in it unreachable.
 */
import { type Express, type Request, type Response } from "express";
import { activeCheckpoints } from "../services/channelExport/checkpoints";
import { CheckpointLostError, sweepStaleCheckpoints } from "../services/channelExport/checkpoints";
import { ChannelDeps, D, setChannelDeps } from "../services/channelExport/channelDeps";
import { cancelChannelJob, getOrCreateChannelJob, publishChannel } from "../services/channelExport/channelJobs";
import { collectDetails } from "../services/channelExport/collectDetails";
import { buildResponse } from "../services/channelExport/exportResponse";
import { startExportRun } from "../services/channelExport/exportRun";
import { ownerOnly } from "../services/channelExport/ownerAccess";
import { selectVideos } from "../services/channelExport/selectVideos";

export function registerChannelRoutes(app: Express, deps: ChannelDeps): void {
  setChannelDeps(deps);
  sweepStaleCheckpoints();

  app.post("/api/channel/export", ownerOnly(async (req: Request, res: Response) => {
    const run = startExportRun(req, res);
    if (!run) return;
    const { input, base, jobId, job, ckDir, releaseInUse, clearCheckpoint, videos } = run;

    try {
      const selected = await selectVideos(run);
      await collectDetails(run, selected);

      const cancelled = job.cancelled;
      publishChannel(jobId, {
        phase: cancelled ? "cancelled" : "done",
        current: selected.length,
        total: selected.length,
      });
      // Built before the checkpoint is dropped: in "path" mode the CSVs are
      // streamed out of those very files.
      const body = buildResponse(run, cancelled);
      // A finished export has nothing left to resume.
      if (!cancelled) clearCheckpoint();
      return res.json(body);
    } catch (e) {
      const cancelled = job.cancelled || (e as Error)?.message === "cancelled";
      if (cancelled) {
        publishChannel(jobId, {
          phase: "cancelled",
          current: videos.length,
          total: videos.length,
        });
        if (res.writableEnded || res.destroyed) return;
        try {
          return res.json(buildResponse(run, true));
        } catch (err) {
          return res.status(500).json({ error: D.fullErrMessage(err) });
        }
      }
      D.logYtError("/api/channel/export", input.url, { base }, e);
      const msg =
        e instanceof CheckpointLostError ? e.message : D.fullErrMessage(e);
      publishChannel(jobId, {
        phase: "error",
        current: 0,
        total: 0,
        message: msg,
      });
      if (res.writableEnded || res.destroyed) return;
      return res.status(500).json({ error: msg });
    } finally {
      activeCheckpoints.delete(ckDir);
      releaseInUse();
    }
  }));

  app.post("/api/channel/export/cancel", ownerOnly((req: Request, res: Response) => {
    const jobId = String((req.body ?? {}).jobId || "");
    if (!jobId) return res.status(400).json({ error: "Missing jobId" });
    cancelChannelJob(jobId);
    res.json({ ok: true });
  }));

  app.get("/api/channel/export/progress", ownerOnly((req: Request, res: Response) => {
    const jobId = String(req.query.jobId || "");
    if (!jobId) return res.status(400).end();
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const job = getOrCreateChannelJob(jobId);
    job.clients.add(res);
    res.write(`data: ${JSON.stringify(job.last)}\n\n`);

    const ping = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        /* ignore */
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(ping);
      job.clients.delete(res);
    });
  }));
}
