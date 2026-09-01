/**
 * File: channel.ts
 * Path: src/lib/channel.ts
 * Description: Types and CSV builders for the channel profile exporter.
 */
import { sanitizeFilename } from "./clip";
import type { CookieBrowser } from "./clip";

export type ChannelContentType = "shorts" | "longform" | "all";

export const CHANNEL_LIMIT_MIN = 10;
export const CHANNEL_LIMIT_MAX = 500;

export interface ChannelExportRequest {
  url: string;
  contentType: ChannelContentType;
  limit: number;
  includeComments: boolean;
  includeTranscripts: boolean;
  cookiesFromBrowser?: CookieBrowser;
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
  requested: number;
  exported: number;
}

export type CsvRow = Record<string, unknown>;

export interface ChannelExportResponse {
  jobId: string;
  cancelled: boolean;
  channel: ChannelSummary;
  videos: CsvRow[];
  comments: CsvRow[];
  transcripts: CsvRow[];
  statuses: CsvRow[];
  error?: string;
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

export function buildExportFiles(data: ChannelExportResponse): ExportFile[] {
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
    },
  ];
  return [
    { name: "videos.csv", contents: rowsToCsv(VIDEO_COLUMNS, data.videos) },
    {
      name: "comments.csv",
      contents: rowsToCsv(COMMENT_COLUMNS, data.comments),
    },
    {
      name: "transcripts.csv",
      contents: rowsToCsv(TRANSCRIPT_COLUMNS, data.transcripts),
    },
    {
      name: "summary.csv",
      contents: rowsToCsv(
        [
          "channel",
          "channel_url",
          "subscriber_count",
          "exported_at",
          "filter",
          "requested",
          "exported",
          "cancelled",
        ],
        summaryRows,
      ),
    },
    {
      name: "video-status.csv",
      contents: rowsToCsv(STATUS_COLUMNS, data.statuses),
    },
  ];
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
