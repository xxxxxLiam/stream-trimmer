/**
 * File: authRoutes.ts
 * Path: src/main/features/engine/routes/authRoutes.ts
 * Description: POST /api/auth/youtube/status.
 */
import { type Request, type Response, type Express } from "express";
import { type ChildProcess } from "node:child_process";
import { z } from "zod";
import { type YouTubeAuthProbeStatus } from "../utils/youtubeAuth";
import { binariesOk } from "../services/binaries";
import { appCookieFile, cookieModeFor, resolveCookieOptions, withRunCookies } from "../services/cookies";
import { authProbeMessage, probeYouTubeAuth } from "../services/youtubeAuthProbe";
import { binaryError } from "../utils/errors";
import { authSourceSchema } from "../utils/schemas";

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/youtube/status", async (req: Request, res: Response) => {
    const parsed = z
      .object({ browser: authSourceSchema })
      .safeParse(req.body ?? {});
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues[0].message });
    if (!binariesOk) return binaryError(res);

    const source = parsed.data.browser;
    console.log(
      `[server] /api/auth/youtube/status source=${source} cookieFile=${
      source === "app" ? Boolean(appCookieFile()) : "n/a"
    }`,
    );
    if (source === "app" && !appCookieFile()) {
      return res.json({
        status: "signed_out" satisfies YouTubeAuthProbeStatus,
        source,
        browser: source,
        message: "No in-app YouTube sign-in yet.",
      });
    }
    const cookieOptions = resolveCookieOptions(source);
    let activeChild: ChildProcess | null = null;
    let clientGone = false;
    res.on("close", () => {
      if (res.writableEnded) return;
      clientGone = true;
      if (activeChild) activeChild.kill("SIGKILL");
    });
    // One private copy of the jar covers the whole probe loop (up to three runs).
    const { status, reason } = await withRunCookies(
      cookieModeFor(source),
      cookieOptions,
      false,
      (cookies) =>
        probeYouTubeAuth(
          cookies,
          (child) => {
            activeChild = child;
          },
          () => clientGone,
        ),
    );
    if (res.writableEnded || res.destroyed) return;
    return res.json({
      status,
      source,
      browser: parsed.data.browser,
      message: authProbeMessage(source, status),
      reason,
    });
  });
}
