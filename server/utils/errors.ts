/**
 * File: errors.ts
 * Path: server/utils/errors.ts
 * Description: Error text, classification and failure responses shared by the engine's routes.
 */
import { type Response } from "express";
import { type ClipFailure } from "../segments";
import { BIN_DIR, yt } from "../services/binaries";

export function binaryError(res: Response) {
  return res.status(500).json({
    error:
      "yt-dlp or ffmpeg not available. Check the server console for the install command, then run `npm run setup`.",
  });
}

function errMessage(e: unknown): string {
  const anyE = e as { stderr?: string; message?: string } | null;
  return (anyE?.stderr || anyE?.message || "").toString().trim();
}

// yt-dlp signals an unreadable cookie database in a handful of phrasings; all
// of them mention the cookie source. Matched on the message only — never the
// cookie values, which yt-dlp reads internally and never emits.
export function isCookieError(e: unknown): boolean {
  const text = errMessage(e).toLowerCase();
  if (!text) return false;
  return (
    text.includes("could not find") && text.includes("cookies") ||
    text.includes("failed to decrypt") ||
    text.includes("unsupported browser") ||
    // yt-dlp's Safari cookie reader emits this on non-macOS platforms.
    text.includes("unsupported platform") ||
    text.includes("cookie database") ||
    (text.includes("cookies") &&
      (text.includes("permission denied") ||
        text.includes("no such file") ||
        text.includes("is locked") ||
        text.includes("database is locked")))
  );
}

export function cookieErrorMessage(browser: string): string {
  if (browser === "app")
    return "Your in-app YouTube sign-in is no longer valid. Sign in again from the YouTube button.";
  return `Couldn't read ${browser}'s cookies. The browser may need to be fully closed, or that profile isn't supported. You can turn sign-in off and retry for standard quality.`;
}

// Log every field execa/youtube-dl-exec typically attaches, plus context
// about what we invoked, so the real failure is visible in the server log.
export function logYtError(
  where: string,
  url: string,
  options: Record<string, unknown>,
  e: unknown,
): void {
  const anyE = (e ?? {}) as {
    stderr?: string;
    stdout?: string;
    message?: string;
    shortMessage?: string;
    exitCode?: number;
    signal?: string;
    command?: string;
    escapedCommand?: string;
    failed?: boolean;
    timedOut?: boolean;
    killed?: boolean;
  };
  console.error(`[server] ${where} FAILED`);
  console.error(`[server]   url=${url}`);
  console.error(`[server]   binary=${yt?.source ?? "(unresolved)"}`);
  console.error(`[server]   binDir=${BIN_DIR ?? "(none)"}`);
  try {
    console.error(`[server]   options=${JSON.stringify(options)}`);
  } catch {
    console.error(`[server]   options=(unserializable)`);
  }
  if (anyE.command) console.error(`[server]   command=${anyE.command}`);
  if (anyE.escapedCommand)
    console.error(`[server]   escapedCommand=${anyE.escapedCommand}`);
  if (typeof anyE.exitCode === "number")
    console.error(`[server]   exitCode=${anyE.exitCode}`);
  if (anyE.signal) console.error(`[server]   signal=${anyE.signal}`);
  if (anyE.shortMessage)
    console.error(`[server]   shortMessage=${anyE.shortMessage}`);
  if (anyE.message) console.error(`[server]   message=${anyE.message}`);
  if (anyE.stdout) console.error(`[server]   stdout:\n${anyE.stdout}`);
  if (anyE.stderr) console.error(`[server]   stderr:\n${anyE.stderr}`);
  console.error(`[server]   raw:`, e);
}

export function fullErrMessage(e: unknown): string {
  const anyE = (e ?? {}) as {
    stderr?: string;
    stdout?: string;
    shortMessage?: string;
    message?: string;
    exitCode?: number;
  };
  const parts: string[] = [];
  if (anyE.stderr?.trim()) parts.push(anyE.stderr.trim());
  if (
    anyE.shortMessage?.trim() &&
    !parts.join("\n").includes(anyE.shortMessage.trim())
  )
    parts.push(anyE.shortMessage.trim());
  if (anyE.message?.trim() && !parts.join("\n").includes(anyE.message.trim()))
    parts.push(anyE.message.trim());
  if (anyE.stdout?.trim()) parts.push(`stdout: ${anyE.stdout.trim()}`);
  if (typeof anyE.exitCode === "number")
    parts.push(`exitCode=${anyE.exitCode}`);
  const combined = parts.join("\n").trim();
  return combined || "yt-dlp failed (no error output captured)";
}

/** Sends a failure in the table shape: cause, the one fix, the work kept. */
export function sendFailure(
  res: Response,
  f: ClipFailure,
  extra: Record<string, unknown> = {},
) {
  return res.status(f.status).json({
    error: f.error,
    code: f.code,
    cause: f.cause,
    action: f.action,
    preserved: f.preserved,
    ...(f.detail ? { detail: f.detail } : {}),
    ...extra,
  });
}
