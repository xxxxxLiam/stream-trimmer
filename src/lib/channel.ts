/**
 * File: channel.ts
 * Path: src/lib/channel.ts
 * Description: Types and CSV builders for the channel profile exporter.
 */
import { sanitizeFilename } from "./clip";
import type { AuthSource } from "./clip";

export type ChannelContentType = "shorts" | "longform" | "all";

/** How many videos to export: a count, or every video the channel lists. */
export type ChannelLimit = number | "all";

export const CHANNEL_LIMIT_MIN = 10;
export const CHANNEL_LIMIT_MAX = 10000;

export interface ChannelExportRequest {
  url: string;
  contentType: ChannelContentType;
  limit: ChannelLimit;
  includeVideoDetails: boolean;
  includeComments: boolean;
  includeTranscripts: boolean;
  /** Ignore any saved progress for this request and start the export over. */
  fresh?: boolean;
  cookiesFromBrowser?: AuthSource;
}

// --- what to export -------------------------------------------------------

/**
 * The three collectable parts of an export, each its own CSV. Everything is
 * on by default; turning one off skips the work, not just the file, so a
 * transcripts-only run of a big channel is a fraction of the time.
 *
 * summary.csv and video-status.csv are not listed: they are a few kilobytes
 * between them and they are how you tell what a run actually did, so they are
 * always written.
 */
export type ChannelPart = "videoDetails" | "comments" | "transcripts";

export type ChannelParts = Record<ChannelPart, boolean>;

export const ALL_PARTS: ChannelParts = {
  videoDetails: true,
  comments: true,
  transcripts: true,
};

export const PART_INFO: {
  key: ChannelPart;
  label: string;
  file: string;
  hint: string;
}[] = [
  {
    key: "videoDetails",
    label: "Video details",
    file: "videos.csv",
    hint: "Title, description, views, likes, upload date, tags and hashtags.",
  },
  {
    key: "comments",
    label: "Comments",
    file: "comments.csv",
    hint: "Top 50 per video, with author, likes and replies.",
  },
  {
    key: "transcripts",
    label: "Transcripts",
    file: "transcripts.csv",
    hint: "Caption lines with their timestamps.",
  },
];

export function anyPartSelected(parts: ChannelParts): boolean {
  return PART_INFO.some((p) => parts[p.key]);
}

/** What summary.csv records under `included`, so a partial run says so. */
export function describeParts(parts: ChannelParts): string {
  return PART_INFO.filter((p) => parts[p.key])
    .map((p) => p.label.toLowerCase())
    .join("; ");
}

/** The CSVs a run with these parts produces, in the order the UI lists them. */
export function partFileNames(parts: ChannelParts): string[] {
  const names: string[] = [];
  if (parts.videoDetails) names.push("videos.csv");
  if (parts.comments) names.push("comments.csv");
  if (parts.transcripts) names.push("transcripts.csv");
  // Always written: the run's receipt, and which videos gave trouble.
  names.push("summary.csv", "video-status.csv");
  return names;
}

/**
 * Turns whatever is in the count field into a usable budget.
 *
 * This used to be `Math.round(n) || CHANNEL_LIMIT_MIN`, which silently turned
 * an empty or unparseable field into 10: you cleared the box, pressed export,
 * and got a ten-video run with nothing saying why. An unusable value is now
 * reported instead of quietly replaced.
 */
export function parseChannelLimit(
  raw: string | number,
): { ok: true; limit: ChannelLimit } | { ok: false; reason: string } {
  if (raw === "all") return { ok: true, limit: "all" };
  const text = String(raw).trim();
  if (!text) {
    return {
      ok: false,
      reason: 'Enter how many videos to export, or choose "Everything".',
    };
  }
  const n = Number(text);
  if (!Number.isFinite(n)) {
    return { ok: false, reason: "That video count isn't a number." };
  }
  const rounded = Math.round(n);
  if (rounded < CHANNEL_LIMIT_MIN) {
    return {
      ok: false,
      reason: `Export at least ${CHANNEL_LIMIT_MIN} videos, or choose "Everything".`,
    };
  }
  if (rounded > CHANNEL_LIMIT_MAX) {
    return {
      ok: false,
      reason: `${CHANNEL_LIMIT_MAX.toLocaleString()} is the most you can ask for by number — choose "Everything" instead.`,
    };
  }
  return { ok: true, limit: rounded };
}

/** How the budget reads in a sentence. */
export function describeChannelLimit(limit: ChannelLimit): string {
  return limit === "all"
    ? "every video on the channel"
    : `${limit.toLocaleString()} videos`;
}

export interface ChannelExportProgress {
  phase: "listing" | "metadata" | "details" | "done" | "error" | "cancelled";
  current: number;
  total: number;
  label?: string;
  message?: string;
}

export interface ChannelSummary {
  name: string;
  url: string;
  subscriber_count: number | "";
  exported_at: string;
  filter: ChannelContentType;
  requested: ChannelLimit;
  exported: number;
}

export type CsvRow = Record<string, unknown>;

/** Every row in the response body. What a browser gets. */
export interface ChannelExportRows {
  jobId: string;
  cancelled: boolean;
  channel: ChannelSummary;
  videos: CsvRow[];
  comments: CsvRow[];
  transcripts: CsvRow[];
  statuses: CsvRow[];
  /** Which parts the run collected. Absent on a response from an older build. */
  parts?: ChannelParts;
  error?: string;
}

/**
 * CSVs already written to disk by the local engine. What the desktop app gets:
 * a whole-channel export is millions of caption lines, so the rows are streamed
 * to files and only their paths are handed back.
 */
export interface ChannelExportPaths {
  jobId: string;
  cancelled: boolean;
  channel: ChannelSummary;
  dir: string;
  files: { name: string; path: string; bytes: number }[];
  counts: { videos: number; comments: number; transcripts: number };
  parts?: ChannelParts;
  error?: string;
}

export type ChannelExportResponse = ChannelExportRows | ChannelExportPaths;

export function isPathDelivery(
  data: ChannelExportResponse,
): data is ChannelExportPaths {
  return Array.isArray((data as ChannelExportPaths).files);
}

// RFC 4180-ish CSV with a UTF-8 BOM so Excel handles emoji and non-Latin text.
export function rowsToCsv(columns: string[], rows: CsvRow[]): string {
  const escape = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [columns.map(escape).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c])).join(","));
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
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

export interface ExportFile {
  name: string;
  contents: string;
}

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

export function buildExportFiles(data: ChannelExportRows): ExportFile[] {
  // Only the parts that were asked for. The server does the same for path
  // delivery, so both routes produce the same set of files.
  const parts = data.parts ?? ALL_PARTS;
  const summaryRows: CsvRow[] = [
    {
      channel: data.channel.name,
      channel_url: data.channel.url,
      subscriber_count: data.channel.subscriber_count,
      exported_at: data.channel.exported_at,
      filter: data.channel.filter,
      requested: data.channel.requested,
      exported: data.channel.exported,
      cancelled: data.cancelled,
      included: describeParts(parts),
    },
  ];
  const files: ExportFile[] = [];
  if (parts.videoDetails) {
    files.push({
      name: "videos.csv",
      contents: rowsToCsv(VIDEO_COLUMNS, data.videos),
    });
  }
  if (parts.comments) {
    files.push({
      name: "comments.csv",
      contents: rowsToCsv(COMMENT_COLUMNS, data.comments),
    });
  }
  if (parts.transcripts) {
    files.push({
      name: "transcripts.csv",
      contents: rowsToCsv(TRANSCRIPT_COLUMNS, data.transcripts),
    });
  }
  files.push(
    { name: "summary.csv", contents: rowsToCsv(SUMMARY_COLUMNS, summaryRows) },
    {
      name: "video-status.csv",
      contents: rowsToCsv(STATUS_COLUMNS, data.statuses),
    },
  );
  return files;
}

// `<channel>-export-YYYY-MM-DD`
export function buildExportFolderName(channelName: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${sanitizeFilename(channelName || "channel")}-export-${date}`;
}

// Accepts @handle, /channel/UC…, /c/name, /user/name, and tab links under them.
export function isLikelyChannelUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (!/youtube\.com$/.test(u.hostname.replace(/^(www|m)\./, "")))
      return false;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return false;
    if (parts[0].startsWith("@")) return true;
    return ["channel", "c", "user"].includes(parts[0]) && Boolean(parts[1]);
  } catch {
    return false;
  }
}
