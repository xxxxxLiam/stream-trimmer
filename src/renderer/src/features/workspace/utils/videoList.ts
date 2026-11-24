/**
 * File: videoList.ts
 * Path: src/renderer/src/features/workspace/utils/videoList.ts
 * Description: Pure helpers for the Videos list: which videos are open or Done, who is next,
 *   how many moments wait in a video, and what the pill search matches.
 */
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

export function looksLikeLink(text: string): boolean {
  return /^(https?:\/\/|www\.|youtu\.be\/|youtube\.com\/)/i.test(text.trim());
}
