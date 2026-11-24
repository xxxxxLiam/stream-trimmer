/**
 * File: progressRoutes.ts
 * Path: src/main/features/engine/routes/progressRoutes.ts
 * Description: GET /api/download/progress.
 */
import { type Request, type Response, type Express } from "express";
import { getOrCreateJob } from "../services/progressChannel";

export function registerProgressRoutes(app: Express): void {
  app.get("/api/download/progress", (req: Request, res: Response) => {
    const jobId = String(req.query.jobId || "");
    if (!jobId) return res.status(400).end();
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const job = getOrCreateJob(jobId);
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
  });
}
