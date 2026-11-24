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
