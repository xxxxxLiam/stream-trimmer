/**
 * File: index.ts
 * Path: src/main/features/engine/index.ts
 * Description: Local Express backend entry — /api/info, /api/download,
 * /api/transcript. Uses bundled yt-dlp (with PATH fallback) and ffmpeg-static.
 * Runs via `tsx`. The pieces live in ./app, ./routes, ./services and ./utils;
 * this file wires them together and starts listening.
 */
import { PORT } from "./utils/engineConfig";
import "./services/jobLogs";
import "./services/binaries";
import { app } from "./app";
import { registerRoutes } from "./routes/registerRoutes";
import { sweepStaleCache } from "./services/resumeCache";

export { isYouTubeUrl } from "./utils/youtubeUrl";
export { appCookieFile, resolveCookieOptions } from "./services/cookies";
export { requestAllowed } from "./app";
export { localTrimArgs } from "./utils/trimArgs";
export { errorResponseFor } from "./utils/errorResponse";

registerRoutes(app);

// Loopback only: with no host Node binds every interface, which put the whole
// API on the user's LAN.
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[server] listening on http://127.0.0.1:${PORT}`);
  const swept = sweepStaleCache();
  if (swept) console.log(`[server] swept ${swept} stale work folder(s)`);
});
