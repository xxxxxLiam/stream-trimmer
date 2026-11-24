/**
 * File: fallbackRoutes.ts
 * Path: src/main/features/engine/routes/fallbackRoutes.ts
 * Description: The packaged UI fallback, the unknown-endpoint answer and the error handler.
 */
import { type NextFunction, type Request, type Response, type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { uiDir } from "../app";
import { errorResponseFor } from "../utils/errorResponse";

// SPA fallback for the packaged UI — must be registered after all API routes.

export function registerFallbackRoutes(app: Express): void {
  if (uiDir && fs.existsSync(uiDir)) {
    const dir = uiDir;
    app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(dir, "index.html"));
    });
  }

  // --- Errors ---------------------------------------------------------------
  //
  // Express's default handler answers with an HTML page holding the stack trace,
  // and so the absolute install path (and the user's name in it). Every failure
  // that reaches here is answered as {error, code}, with nothing from the stack.
  // The full error goes to the server log only.

  app.use("/api", (req: Request, res: Response) => {
    res
      .status(404)
      .json({ error: `No such endpoint: ${req.method} ${req.path.slice(0, 120)}`, code: "not_found" });
  });

  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    const { status, body } = errorResponseFor(err);
    console.error(
      `[server] ${req.method} ${req.path} -> ${status} ${body.code}: ${
      err instanceof Error ? err.message : String(err)
    }`,
    );
    if (res.headersSent) return next(err);
    res.status(status).json(body);
  });
}
