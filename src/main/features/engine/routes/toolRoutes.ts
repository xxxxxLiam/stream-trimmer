/**
 * File: toolRoutes.ts
 * Path: src/main/features/engine/routes/toolRoutes.ts
 * Description: GET /api/tools: whether yt-dlp, ffmpeg and deno are present and run.
 */
import { type Request, type Response, type Express } from "express";
import { currentToolStatus, startToolProbe } from "../services/toolStatus";

export function registerToolRoutes(app: Express): void {
  // Start probing at registration so the first request from the start screen already has an answer.
  startToolProbe();
  app.get("/api/tools", (_req: Request, res: Response) => res.json(currentToolStatus()));
}
