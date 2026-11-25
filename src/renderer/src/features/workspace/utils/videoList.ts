/**
 * File: videoList.ts
 * Path: src/renderer/src/features/workspace/utils/videoList.ts
 * Description: Pure helpers for the Videos list: which videos are open or Done, who is next,
 *   how many moments wait in a video, and what the pill search matches.
 */
import { extractVideoId } from "../../../shared/utils/clip";
import type { WorkspaceTab } from "../hooks/WorkspaceContext";
import { clipsFor, type BankData } from "../../../shared/utils/bank";

/** Mark one video Done, or bring it back. Other videos are untouched. */
export function setDone(tabs: WorkspaceTab[], id: string, done: boolean): WorkspaceTab[] {
  return tabs.map((t) => {
    if (t.id !== id) return t;
    const { done: _drop, ...rest } = t;
    return done ? { ...rest, done: true } : rest;
  });
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
export function waitingIn(data: BankData, campaignId: string | undefined, videoId: string | null): number {
  if (!campaignId || !videoId) return 0;
  return clipsFor(data, campaignId, videoId).filter((c) => c.status === "banked").length;
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
