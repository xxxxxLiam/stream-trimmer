/**
 * File: registerRoutes.ts
 * Path: src/main/features/engine/routes/registerRoutes.ts
 * Description: Registers every engine route on the app, in the order Express
 * must see them: the API first, then the packaged UI fallback, the unknown
 * endpoint answer and the error handler last.
 */
import type { Express } from "express";
import { registerInfoRoutes } from "./infoRoutes";
import { registerAuthRoutes } from "./authRoutes";
import { registerDownloadRoutes } from "./downloadRoutes";
import { registerCommentsRoutes } from "./commentsRoutes";
import { registerProgressRoutes } from "./progressRoutes";
import { registerChannelRegistration } from "./channelRegistration";
import { registerToolRoutes } from "./toolRoutes";
import { registerCacheRoutes } from "./cacheRoutes";
import { registerFallbackRoutes } from "./fallbackRoutes";

export function registerRoutes(app: Express): void {
  registerInfoRoutes(app);
  registerAuthRoutes(app);
  registerDownloadRoutes(app);
  registerCommentsRoutes(app);
  registerProgressRoutes(app);
  registerChannelRegistration(app);
  registerCacheRoutes(app);
  registerToolRoutes(app);
  registerFallbackRoutes(app);
}
