/**
 * File: channelRegistration.ts
 * Path: server/routes/channelRegistration.ts
 * Description: Registers the channel profile exporter, only in builds that include it.
 */
import fs from "node:fs";
import path from "node:path";
import { registerChannelRoutes } from "../channelRoutes";
import { type Express } from "express";
import { binariesOk, childEnv, resolvedFfmpeg, yt } from "../services/binaries";
import { appCookieFile, resolveCookieOptions } from "../services/cookies";
import { binaryError, fullErrMessage, logYtError } from "../utils/errors";
import { authSourceSchema, urlSchema } from "../utils/schemas";
import { parseVtt } from "../utils/vtt";

// ---------------------------------------------------------------------------
// Channel profile exporter — lives in ./channelRoutes. It exists only in builds
// made with VITE_ENABLE_CHANNEL_DATA (the same flag that gates the UI): without
// it scripts/build-server.cjs aliases "./channelRoutes" to an empty stub, so the
// exporter's code and URLs are absent from the packaged server, not just
// unregistered. The runtime check below only matters when running from source
// (`npm run dev:server`, tests); it is not what keeps the code out of a build.
// ---------------------------------------------------------------------------
const CHANNEL_FLAG_RE = /^(1|true|yes|on)$/i;
function readChannelFlag(): boolean {
  const fromEnv = String(process.env.VITE_ENABLE_CHANNEL_DATA ?? "").trim();
  if (fromEnv) return CHANNEL_FLAG_RE.test(fromEnv);
  // `npm run dev:server` does not load .env, so read it there. Never in the packaged app.
  if (process.env.ELECTRON_RESOURCES) return false;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
    const line = raw.split(/\r?\n/).find((l) => l.startsWith("VITE_ENABLE_CHANNEL_DATA="));
    return CHANNEL_FLAG_RE.test((line ? line.split("=").slice(1).join("=") : "").trim());
  } catch {
    return false;
  }
}

export function registerChannelRegistration(app: Express): void {
  if (readChannelFlag()) {
    registerChannelRoutes(app, {
      app,
      yt,
      binariesOk,
      binaryError,
      resolvedFfmpeg,
      urlSchema,
      authSourceSchema,
      childEnv,
      appCookieFile,
      resolveCookieOptions,
      parseVtt,
      fullErrMessage,
      logYtError,
    });
  }
}
