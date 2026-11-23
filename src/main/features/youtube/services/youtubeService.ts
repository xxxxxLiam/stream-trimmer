/**
 * File: youtubeService.ts
 * Path: src/main/features/youtube/services/youtubeService.ts
 * Description: What the renderer can ask about, import and clear in the imported
 *   YouTube session (a cookies.txt). The session itself is youtubeSession.ts.
 */
import * as youtubeSession from "../../../../../electron/youtubeSession";
import * as logger from "../../../../../electron/logger";

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
  } catch (err: any) {
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
  return result;
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
    return result;
  } catch (err: any) {
    logger.log("youtube", `cookie drop threw: ${logger.describe(err)}`);
    return { ok: false, error: logger.describe(err) };
  }
}

export async function disconnect() {
  try {
    await youtubeSession.clear();
    logger.log("youtube", "disconnect: cleared");
    return { ok: true };
  } catch (err: any) {
    logger.log("youtube", `disconnect: threw ${logger.describe(err)}`);
    return { ok: false };
  }
}

/**
 * Fallback path only: opens YouTube in the user's default browser so
 * yt-dlp can read that browser's session instead.
 */
export async function openSignInPage(shell: any) {
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
