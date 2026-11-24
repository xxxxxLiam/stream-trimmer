/**
 * File: channelCsv.ts
 * Path: src/common/schemas/channelCsv.ts
 * Description: The channel exporter's CSV format, shared by the engine (which
 * streams CSVs to disk) and the renderer (which builds them in memory): column
 * orders and the one cell-encoding rule, so the two can never drift apart.
 */

// Excel only reads a UTF-8 CSV correctly when it starts with a BOM.
export const CSV_BOM = "\uFEFF";
export const CSV_EOL = "\r\n";

// Every field is quoted, so nothing in the data needs escaping beyond the
// quote character itself.
//
// A spreadsheet reads a cell that starts with = + - @ (or a tab / CR / LF) as a
// formula, and the text here is written by strangers (comments, captions). Such
// a cell is prefixed with a single quote, the conventional neutraliser: the
// spreadsheet shows the text, and the field is still plain RFC 4180. Numbers
// (typeof number, or a string that is just a decimal) are left alone, so a
// negative like_count is not turned into text.
const FORMULA_START = /^[=+\-@\t\r\n]/;
const PLAIN_NUMBER = /^[+-]?\d+(?:\.\d+)?$/;

export function neutraliseFormula(s: string): string {
  return FORMULA_START.test(s) && !PLAIN_NUMBER.test(s) ? `'${s}` : s;
}

export function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  const safe = typeof value === "number" ? s : neutraliseFormula(s);
  return `"${safe.replace(/"/g, '""')}"`;
}

export const VIDEO_COLUMNS = [
  "video_id",
  "url",
  "title",
  "description",
  "upload_date",
  "duration_seconds",
  "is_short",
  "view_count",
  "like_count",
  "comment_count",
  "channel",
  "thumbnail",
  "tags",
  "tag_count",
  "hashtags",
  "hashtags_in_title",
];

export const COMMENT_COLUMNS = [
  "video_id",
  "comment_id",
  "parent_id",
  "is_reply",
  "author",
  "author_channel_id",
  "text",
  "like_count",
  "is_pinned",
  "is_uploader",
  "published_time",
  "timestamp",
];

export const TRANSCRIPT_COLUMNS = ["video_id", "start", "end", "text"];

export const STATUS_COLUMNS = ["video_id", "title", "status"];

export const SUMMARY_COLUMNS = [
  "channel",
  "channel_url",
  "subscriber_count",
  "exported_at",
  "filter",
  "requested",
  "exported",
  "cancelled",
  "included",
];
