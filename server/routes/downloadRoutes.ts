/**
 * File: downloadRoutes.ts
 * Path: server/routes/downloadRoutes.ts
 * Description: POST /api/download and /api/download/cancel.
 */
import { type Request, type Response, type Express } from "express";
import { cancelJob } from "../services/downloadJobs";

// Contract for the renderer (B-6): POST /api/download/cancel?jobId=<id> (or a
// JSON body {jobId}) -> 200 {ok:true, found:boolean}. `found` is false when no
// job with that id is being built any more (already finished, or never
// existed); that is not an error. The cancelled /api/download request itself
// answers 499 {code:"cancelled", cancelled:true}, and its progress channel
// publishes phase "error" with message "Cancelled". Hanging up the download
// request (AbortController) cancels it the same way.

import { runDownload } from "../services/download/downloadService";

export function registerDownloadRoutes(app: Express): void {
  app.post("/api/download/cancel", (req: Request, res: Response) => {
    const fromQuery =
      typeof req.query.jobId === "string" ? req.query.jobId : "";
    const fromBody =
      req.body && typeof req.body.jobId === "string" ? req.body.jobId : "";
    const id = fromQuery || fromBody;
    if (!id) return res.status(400).json({ error: "jobId is required" });
    const n = cancelJob(id);
    console.log(`[server] /api/download/cancel job=${id} cancelled=${n}`);
    return res.json({ ok: true, found: n > 0 });
  });

  app.post("/api/download", runDownload);
}
