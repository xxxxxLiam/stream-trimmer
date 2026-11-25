/**
 * File: topComments.ts
 * Path: src/main/features/engine/services/channelExport/topComments.ts
 * Description: Picks each video's top comments for the export: top-level comments only, most liked first, each with how many
 *   replies were seen under it.
 */
import type { RawComment } from "./exportTypes";

/** Top-level comments kept per video. */
export const COMMENTS_PER_VIDEO = 20;
/** Replies fetched under each, so reply_count reads "5" for five or more. */
export const REPLIES_PER_THREAD = 5;

export type TopComment = RawComment & { replies: number };

export function topComments(raw: readonly RawComment[], limit: number = COMMENTS_PER_VIDEO): TopComment[] {
  const replies = new Map<string, number>();
  for (const c of raw) {
    if (c.parent && c.parent !== "root") replies.set(c.parent, (replies.get(c.parent) ?? 0) + 1);
  }
  return raw
    .filter((c) => !(c.parent && c.parent !== "root"))
    .map((c) => ({ ...c, replies: replies.get(c.id ?? "") ?? 0 }))
    .sort((a, b) => (b.like_count ?? -1) - (a.like_count ?? -1))
    .slice(0, limit);
}
