/**
 * File: youtubeService.ts
 * Path: src/main/features/youtube/services/youtubeService.ts
 * Description: What the renderer can ask about, import and clear in the imported
 *   YouTube session (a cookies.txt). The session itself is youtubeSession.ts.
 */
import * as youtubeSession from "./youtubeSession";
import * as logger from "../../../modules/logger/logger";
import { verifyImportedSession } from "./verifyImport";

/** A refusal passes through untouched; an adopted file gets YouTube's verdict added. */
async function withVerdict(result: any) {
  if (!result || !result.ok) return result;
  const verified = await verifyImportedSession(process.env.PORT);
  logger.log("youtube", `cookie import verify=${verified.verify}`);
  return { ...result, ...verified };
}

/**
 * Cheap, offline read of the imported cookies.txt. Says whether a session
 * is on disk at all; whether YouTube still accepts it is the engine's
 * /api/auth/youtube/status check, which costs a real request.
 */
export async function probeSession() {
  try {
    const result: any = await youtubeSession.probe();
    return {
      connected: !!result.connected,
      error: result.error,
      expiresAt: result.expiresAt ?? null,
      expired: !!result.expired,
    };
  } catch (err: unknown) {
    logger.log("youtube", `probe: threw ${logger.describe(err)}`);
    return { connected: false, error: logger.describe(err) };
  }
}

/** Imports a cookies.txt the user picked. Throws; the caller logs and shapes the failure. */
export async function importCookiesFromFile(filePath: string) {
  const result: any = await youtubeSession.importCookieFile(filePath);
  logger.log(
    "youtube",
    `cookie import ok=${result.ok}${result.ok ? ` cookies=${result.count}` : `: ${result.error}`}`,
  );
  return withVerdict(result);
}

/**
 * A cookies.txt dropped on the window. The renderer reads the text; the
 * same validation and atomic commit as the picker runs here.
 */
export async function importCookiesFromText(text: string) {
  try {
    const result: any = await youtubeSession.importCookieText(text);
    logger.log(
      "youtube",
      `cookie drop ok=${result.ok}${result.ok ? ` cookies=${result.count}` : `: ${result.error}`}`,
    );
    return await withVerdict(result);
  } catch (err: unknown) {
    logger.log("youtube", `cookie drop threw: ${logger.describe(err)}`);
    return { ok: false, error: logger.describe(err) };
  }
}

export async function disconnect() {
  try {
    await youtubeSession.clear();
    logger.log("youtube", "disconnect: cleared");
    return { ok: true };
  } catch (err: unknown) {
    logger.log("youtube", `disconnect: threw ${logger.describe(err)}`);
    return { ok: false };
  }
}

/**
 * Fallback path only: opens YouTube in the user's default browser so
 * yt-dlp can read that browser's session instead.
 */
export async function openSignInPage(shell: Electron.Shell) {
  try {
    await shell.openExternal("https://www.youtube.com/signin");
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err && err.message ? err.message : "Failed to open browser",
    };
  }
}
