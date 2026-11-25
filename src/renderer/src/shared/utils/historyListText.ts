/**
 * File: historyListText.ts
 * Path: src/renderer/src/shared/utils/historyListText.ts
 * Description: History entries (the ones the search shows) shaped into day and campaign groups for the
 *   copied text. A clip and its language copies are one clip.
 */
import type { DownloadEntry } from "./downloads";
import { clipTitle } from "./downloads";
import { dayHeading, type ListGroup, type ListVideo } from "./clipListText";

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function historyGroups(entries: readonly DownloadEntry[]): ListGroup[] {
  // The first file of a clip (the original) stands for it; dubs share its clip id.
  const seen = new Set<string>();
  const newestFirst = [...entries].sort((a, b) => b.savedAt - a.savedAt);
  const groups: Array<ListGroup & { key: string; at: number }> = [];
  for (const e of newestFirst) {
    const once = e.clipId && e.videoId ? `${e.campaignId ?? ""}|${e.videoId}|${e.clipId}` : "";
    if (once && seen.has(once)) continue;
    if (once) seen.add(once);
    const key = `${dayKey(e.savedAt)}|${e.campaign ?? ""}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, at: e.savedAt, heading: [dayHeading(e.savedAt), e.campaign].filter(Boolean).join(" · "), videos: [] };
      groups.push(g);
    }
    const vkey = e.videoId ?? "";
    let v: ListVideo | undefined = g.videos.find((x) => (x.videoId ?? "") === vkey && (vkey || x.title === e.videoTitle));
    if (!v) {
      v = { videoId: e.videoId, title: e.videoTitle, clips: [] };
      g.videos.push(v);
    }
    v.clips.push({ name: clipTitle(e.label), segments: e.segments ?? [], seconds: e.seconds });
  }
  // Within a video the clips read in the order they sit in the video.
  for (const g of groups) for (const v of g.videos) v.clips.sort((a, b) => (a.segments[0]?.start ?? 0) - (b.segments[0]?.start ?? 0));
  return groups.map(({ heading, videos }) => ({ heading, videos }));
}

/** How many clips the text holds (language copies counted once). */
export const historyClipCount = (groups: readonly ListGroup[]): number => groups.reduce((n, g) => n + g.videos.reduce((m, v) => m + v.clips.length, 0), 0);
