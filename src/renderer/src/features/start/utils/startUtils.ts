/**
 * File: startUtils.ts
 * Path: src/renderer/src/features/start/utils/startUtils.ts
 * Description: Small pure helpers for the cold start screen: the paste key label per platform,
 *   whether clipboard text is a YouTube video link, and how a link and a folder read on the chips.
 */
import { extractVideoId } from "../../../shared/utils/clip";

/** "⌘V" on a Mac, "Ctrl V" elsewhere. Pass navigator.platform. */
export function pasteKeyLabel(platform: string): string {
  return /mac|iphone|ipad/i.test(platform) ? "⌘V" : "Ctrl V";
}

/** The trimmed link when the text is one YouTube video link and nothing else, else null. */
export function youtubeLinkFromText(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t || /\s/.test(t)) return null;
  return extractVideoId(t) ? t : null;
}

/** "https://www.youtube.com/watch?v=abc123&t=9" reads as "youtube.com/watch?v=abc123…". */
export function shortLink(link: string): string {
  const bare = link.trim().replace(/^https?:\/\/(www\.|m\.)?/i, "");
  return bare.length > 36 ? `${bare.slice(0, 36)}…` : bare;
}

export type ToolsStatus = "ready" | "checking" | "broken";

/** Reads the engine's GET /api/tools body. Anything unreadable counts as ready, so a dev browser with no engine is never blocked. */
export function toolsStatusFrom(body: unknown): ToolsStatus {
  const o = (body && typeof body === "object" ? (body as { overall?: unknown }).overall : undefined);
  return o === "checking" || o === "broken" ? o : "ready";
}

/** What the Start screen says when a video would not open and the engine gave no plain sentence. */
export const OPEN_FAILED = "Clipr couldn't open that video. Check the link and try again.";

/**
 * The sentence under the link box for a failed open. The engine sends one plain sentence; anything that
 * still looks like tool output (exit codes, "ERROR:", yt-dlp, stack lines, paths) is never shown.
 */
export function plainOpenError(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return OPEN_FAILED;
  const raw_ = /exitCode|exit code|ERROR:|yt-dlp|ffmpeg|Command failed|\n\s+at |\bat .+\(.+:\d+|[A-Za-z]:\\|\/(usr|home|Users|var|tmp)\//i;
  return raw_.test(t) ? OPEN_FAILED : t;
}
