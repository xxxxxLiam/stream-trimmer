/**
 * File: videoRows.ts
 * Path: src/main/features/engine/services/channelExport/videoRows.ts
 * Description: Builds one videos.csv row from a listing entry and its metadata, hashtags included.
 */
import { SHORT_MAX_SECONDS } from "./exportOptions";
import { RankedVideo } from "./exportTypes";

// Collects #hashtags from a string, keeping first-seen casing.
function collectHashtags(text: string, into: Map<string, string>): void {
  if (!text) return;
  const re = /#([\p{L}\p{N}_]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tag = m[1];
    const key = tag.toLowerCase();
    if (!into.has(key)) into.set(key, tag);
  }
}

// Merges yt-dlp's hashtag field with hashtags found in the title/description.
function extractHashtags(meta: Record<string, any>): {
  hashtags: string;
  hashtags_in_title: string;
} {
  const all = new Map<string, string>();
  const titleOnly = new Map<string, string>();
  const field = (meta as any).hashtags ?? (meta as any).hashtag;
  if (Array.isArray(field)) {
    for (const raw of field) {
      collectHashtags(String(raw).startsWith("#") ? String(raw) : `#${raw}`, all);
    }
  }
  collectHashtags(String(meta.title ?? ""), titleOnly);
  for (const [k, v] of titleOnly) if (!all.has(k)) all.set(k, v);
  collectHashtags(String(meta.description ?? ""), all);
  const fmt = (m: Map<string, string>) =>
    [...m.values()].map((t) => `#${t}`).join("; ");
  return { hashtags: fmt(all), hashtags_in_title: fmt(titleOnly) };
}

// One videos.csv row, built from the flat listing entry plus whatever full
// metadata came back (an empty object when the metadata fetch failed).
export function buildVideoRow(
  v: RankedVideo,
  meta: Record<string, any>,
  channelName: string,
): Record<string, unknown> {
  const duration = Number(meta.duration) || v.duration;
  const views =
    typeof meta.view_count === "number" ? meta.view_count : v.view_count;
  return {
    video_id: v.id,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    title: meta.title ?? v.title,
    description: meta.description ?? "",
    upload_date: meta.upload_date ?? "",
    duration_seconds: duration,
    is_short: duration > 0 && duration <= SHORT_MAX_SECONDS,
    view_count: views,
    like_count: typeof meta.like_count === "number" ? meta.like_count : "",
    comment_count:
      typeof meta.comment_count === "number" ? meta.comment_count : "",
    channel: meta.channel ?? channelName,
    thumbnail: meta.thumbnail ?? "",
    tags: Array.isArray(meta.tags) ? meta.tags.join("; ") : "",
    tag_count: Array.isArray(meta.tags) ? meta.tags.length : 0,
    ...extractHashtags(meta),
  };
}
