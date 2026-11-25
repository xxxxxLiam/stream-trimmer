/**
 * File: videoList.ts
 * Path: src/renderer/src/features/workspace/utils/videoList.ts
 * Description: Pure helpers for the Videos list: which videos are open or Done, who is next,
 *   how many moments wait in a video, and what the pill search matches.
 */
import { extractVideoId } from "../../../shared/utils/clip";
import type { WorkspaceTab } from "../hooks/WorkspaceContext";
import { clipsFor, type BankData } from "../../../shared/utils/bank";

/**
 * Mark one video Done, or bring it back. Other videos are untouched. A video just moved to Done goes to
 * the top of the Done group (the fold shows the latest first, as on board 03.2.6).
 */
export function setDone(tabs: WorkspaceTab[], id: string, done: boolean): WorkspaceTab[] {
  const next: WorkspaceTab[] = tabs.map((t) => {
    if (t.id !== id) return t;
    const { done: _drop, ...rest } = t;
    return done ? { ...rest, done: true } : rest;
  });
  if (!done) return next;
  const moved = next.find((t) => t.id === id);
  const others = next.filter((t) => t.id !== id);
  if (!moved) return next;
  const firstDone = others.findIndex((t) => t.done);
  if (firstDone < 0) return next;
  return [...others.slice(0, firstDone), moved, ...others.slice(firstDone)];
}

export function splitVideos(tabs: readonly WorkspaceTab[]): { open: WorkspaceTab[]; done: WorkspaceTab[] } {
  return { open: tabs.filter((t) => !t.done), done: tabs.filter((t) => t.done) };
}

/** The open video after `id`, wrapping round; null when `id` is the only open one. */
export function nextOpenId(tabs: readonly WorkspaceTab[], id: string): string | null {
  const at = tabs.findIndex((t) => t.id === id);
  for (let k = 1; k < tabs.length; k++) {
    const t = tabs[(at + k) % tabs.length];
    if (!t.done && t.id !== id) return t.id;
  }
  return null;
}

/** Moments still waiting (banked) for one campaign's video. */
export function waitingIn(
  data: BankData,
  campaignId: string | undefined,
  videoId: string | null,
  /** The moment being made right now: it is not waiting any more. */
  makingId: string | null = null,
): number {
  if (!campaignId || !videoId) return 0;
  return clipsFor(data, campaignId, videoId).filter((c) => c.status === "banked" && c.id !== makingId).length;
}

/** Every word typed must appear in the title or the campaign name. */
export function matchesVideoQuery(title: string, campaign: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${title} ${campaign}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

const YT_HOST = /^(?:[\w-]+\.)*(?:youtube(?:-nocookie)?\.com|youtu\.be)(?:[/?#:]|$)/i;

/**
 * What a pasted line is: a "video" link to open, a link that is "bad" (another site, or a YouTube
 * channel or playlist page with no single video), or plain search words ("none"). A YouTube host counts
 * as a link with or without https:// (B-5).
 */
export function linkKind(text: string): "video" | "bad" | "none" {
  const t = text.trim();
  if (!t || /\s/.test(t)) return "none";
  const urlish = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^www\./i.test(t) || YT_HOST.test(t);
  if (!urlish) return "none";
  return extractVideoId(t) ? "video" : "bad";
}

/** The first YouTube video link inside pasted text (share text such as "Watch this https://youtu.be/abc – wow"). */
export function linkInText(text: string): string | null {
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^[("'<\[]+|[)"'>\],.;!?]+$/g, "");
    if (token && linkKind(token) === "video") return token;
  }
  return null;
}

/** What Enter does in the top bar's link field: open a link, or say what is wrong with the text. */
export type LinkAction =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "open"; target: string; existingId: string | null; reopen: boolean };

export const NOT_A_LINK = "Paste a YouTube link";
export const NOT_A_VIDEO = "That isn't a YouTube video link";

/**
 * Decides the top bar field's Enter: share text keeps only its video link (linkInText), a link that is
 * already open selects that tab (and takes it out of Done), anything else is a new tab.
 */
export function resolveLink(raw: string, tabs: readonly WorkspaceTab[]): LinkAction {
  const value = raw.trim();
  if (!value) return { kind: "empty" };
  const inside = /\s/.test(value) ? linkInText(value) : null;
  const target = inside ?? value;
  const kind = inside ? "video" : linkKind(value);
  if (kind === "none") return { kind: "error", message: NOT_A_LINK };
  if (kind === "bad") return { kind: "error", message: NOT_A_VIDEO };
  const vid = extractVideoId(target);
  const same = vid ? tabs.find((t) => t.url && extractVideoId(t.url) === vid) : undefined;
  return { kind: "open", target, existingId: same?.id ?? null, reopen: !!same?.done };
}

export function looksLikeLink(text: string): boolean {
  return linkKind(text) !== "none";
}

/** The next open video (after `activeId`, wrapping) that has moments waiting, or null. */
export function nextWaitingId(
  tabs: readonly WorkspaceTab[],
  activeId: string,
  waiting: (t: WorkspaceTab) => number,
): string | null {
  const at = tabs.findIndex((t) => t.id === activeId);
  for (let k = 1; k < tabs.length; k++) {
    const t = tabs[(at + k) % tabs.length];
    if (!t.done && t.id !== activeId && waiting(t) > 0) return t.id;
  }
  return null;
}
