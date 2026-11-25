/**
 * File: clipListText.ts
 * Path: src/renderer/src/shared/utils/clipListText.ts
 * Description: A list of clips as plain text anyone can read in a chat or an email (board "Copy a clip
 *   list", 25 Nov): per video its title and link, then numbered clips with their times and a link that
 *   opens YouTube at the start. History groups by day and campaign. Pure, so the wording has tests.
 */
import { formatLength } from "./segments";

export type ListClip = { name: string; segments: ReadonlyArray<{ start: number; end: number }>; seconds?: number };
export type ListVideo = { videoId?: string; title?: string; clips: ListClip[] };
export type ListGroup = { heading: string; videos: ListVideo[] };

/** "14 clips", "1 clip". */
export const clipCountText = (n: number): string => `${n} ${n === 1 ? "clip" : "clips"}`;

/** h:mm:ss, the hours without a leading zero ("1:12:04"). */
export function hms(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

const link = (videoId: string) => `https://youtu.be/${videoId}`;

/** "1. Honest Version · 1:12:04 to 1:12:46 (0:42)" and, indented, the link that opens at the start. */
export function clipLines(n: number, clip: ListClip, videoId?: string): string[] {
  const span = clip.segments.map((s) => `${hms(s.start)} to ${hms(s.end)}`).join(" + ");
  const total = clip.seconds ?? clip.segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);
  const times = clip.segments.length > 0 ? `${span} (${formatLength(total)})` : total > 0 ? `(${formatLength(total)})` : "";
  const lines = [`${n}. ${[clip.name, times].filter(Boolean).join(" · ")}`];
  if (videoId && clip.segments.length > 0) lines.push(`   ${link(videoId)}?t=${Math.floor(clip.segments[0].start)}`);
  return lines;
}

/** One video: its title, its link, a blank line, then the numbered clips. */
export function videoBlock(video: ListVideo): string {
  const head = [video.title?.trim() || (video.videoId ? "Video" : "Clips"), ...(video.videoId ? [link(video.videoId)] : [])];
  const body = video.clips.flatMap((c, i) => clipLines(i + 1, c, video.videoId));
  return [...head, "", ...body].join("\n");
}

/** The Export panel: the clips waiting in the open video. */
export const exportListText = (video: ListVideo): string => videoBlock(video);

/** The History panel: "Tuesday 25 November · Acme" headings, the videos inside each. */
export function historyListText(groups: readonly ListGroup[]): string {
  return groups.map((g) => [g.heading, "", g.videos.map(videoBlock).join("\n\n")].join("\n")).join("\n\n");
}

/** "Tuesday 25 November": the day, in words a client reads without thinking. */
export function dayHeading(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/** A file name that is safe on both systems, from a title. */
export function listFileName(title: string | undefined, fallback: string): string {
  const base = (title ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${base || fallback}.txt`;
}
