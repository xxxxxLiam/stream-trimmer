/**
 * File: cacheRoutes.ts
 * Path: server/routes/cacheRoutes.ts
 * Description: Resume-cache usage and clear routes.
 */
import { type Request, type Response, type Express } from "express";
import { cacheUsage, clearCache } from "../resumeCache";

// --- Resume cache -------------------------------------------------------

export function registerCacheRoutes(app: Express): void {
  app.get("/api/cache/usage", (_req: Request, res: Response) => {
    return res.json(cacheUsage());
  });

  app.post("/api/cache/clear", (_req: Request, res: Response) => {
    // Folders a running job is writing to, and finished clips still waiting to be
    // collected, are skipped: this clears abandoned work, nothing in flight.
    const { removed, skipped } = clearCache();
    console.log(
      `[server] cleared ${removed} unfinished work folder(s), left ${skipped} in use`,
    );
    return res.json({ ok: true, removed, skipped, ...cacheUsage() });
  });
}
