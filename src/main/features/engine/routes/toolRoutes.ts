/**
 * File: toolRoutes.ts
 * Path: src/main/features/engine/routes/toolRoutes.ts
 * Description: GET /api/tools: whether yt-dlp, ffmpeg and deno are present and run. Broken ones are looked at again on later asks.
 */
import { type Request, type Response, type Express } from "express";
import { currentToolStatus, startToolProbe } from "../services/toolStatus";

export function registerToolRoutes(app: Express): void {
  // Start probing at registration so the first request from the start screen already has an answer.
  startToolProbe();
  // ?retry=1 is the screen's Try again: look at a broken tool again now instead of waiting out the backoff.
  app.get("/api/tools", (req: Request, res: Response) => res.json(currentToolStatus(Date.now(), req.query.retry === "1")));
}
