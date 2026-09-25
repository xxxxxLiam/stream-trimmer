/**
 * File: csv.ts
 * Path: server/csv.ts
 * Description: Streaming CSV output for the channel exporter. Rows go from the
 * JSONL checkpoints straight to a .csv on disk, a line at a time, so a
 * whole-channel export never has to hold every comment and caption line in
 * memory at once.
 */
import fs from "node:fs";
import { StringDecoder } from "node:string_decoder";

// Excel only reads a UTF-8 CSV correctly when it starts with a BOM, which is
// why the client-side builder emits one too.
export const CSV_BOM = "﻿";
const EOL = "\r\n";

// Every field is quoted, so nothing in the data needs escaping beyond the
// quote character itself. This matches rowsToCsv() in src/lib/channel.ts.
export function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvLine(columns: string[], row: Record<string, unknown>): string {
  return columns.map((c) => csvCell(row[c])).join(",") + EOL;
}

export function csvHeader(columns: string[]): string {
  return CSV_BOM + columns.map(csvCell).join(",") + EOL;
}

// Column orders are duplicated from src/lib/channel.ts because the server is
// bundled separately and cannot import from src/. channelCsv.test.ts asserts
// the two copies stay identical.
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

/**
 * What summary.csv records under `included`, so a partial export says which
 * parts it holds. Mirrors describeParts in src/lib/channel.ts — channelCsv
 * drift tests keep the two in step.
 */
export function describeParts(parts: {
  videoDetails: boolean;
  comments: boolean;
  transcripts: boolean;
}): string {
  const out: string[] = [];
  if (parts.videoDetails) out.push("video details");
  if (parts.comments) out.push("comments");
  if (parts.transcripts) out.push("transcripts");
  return out.join("; ");
}

/** Writes a complete CSV from rows already in memory. For the small files. */
export function writeCsv(
  dest: string,
  columns: string[],
  rows: Record<string, unknown>[],
): number {
  const fd = fs.openSync(dest, "w");
  try {
    fs.writeSync(fd, csvHeader(columns));
    for (const row of rows) fs.writeSync(fd, csvLine(columns, row));
  } finally {
    fs.closeSync(fd);
  }
  return rows.length;
}

const READ_CHUNK = 1 << 20; // 1 MiB

/**
 * Converts a JSONL checkpoint into a CSV without ever holding more than one
 * chunk of it in memory. A missing source file yields a header-only CSV, which
 * is what an export with comments or transcripts switched off should produce.
 *
 * Returns the number of data rows written.
 */
export function writeCsvFromJsonl(
  src: string,
  dest: string,
  columns: string[],
): number {
  const out = fs.openSync(dest, "w");
  let rows = 0;
  try {
    fs.writeSync(out, csvHeader(columns));

    let input: number;
    try {
      input = fs.openSync(src, "r");
    } catch {
      return 0; // nothing was collected for this file
    }
    try {
      const buffer = Buffer.allocUnsafe(READ_CHUNK);
      // A comment or caption can put a multi-byte character across a chunk
      // boundary. StringDecoder holds an incomplete sequence back until the
      // next chunk completes it; decoding each chunk on its own would mangle
      // exactly the emoji and non-Latin text the BOM above is there to serve.
      const decoder = new StringDecoder("utf8");
      let pending = "";
      for (;;) {
        const read = fs.readSync(input, buffer, 0, READ_CHUNK, null);
        if (read === 0) break;
        pending += decoder.write(buffer.subarray(0, read));
        let newline: number;
        while ((newline = pending.indexOf("\n")) !== -1) {
          const line = pending.slice(0, newline);
          pending = pending.slice(newline + 1);
          if (writeJsonlLine(out, columns, line)) rows += 1;
        }
      }
      pending += decoder.end();
      // A checkpoint interrupted mid-write can end without a newline; the
      // reader in resumeCache.ts tolerates that, so this does too.
      if (writeJsonlLine(out, columns, pending)) rows += 1;
    } finally {
      fs.closeSync(input);
    }
  } finally {
    fs.closeSync(out);
  }
  return rows;
}

function writeJsonlLine(fd: number, columns: string[], line: string): boolean {
  if (!line.trim()) return false;
  let row: Record<string, unknown>;
  try {
    row = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return false; // truncated final line from an interrupted write
  }
  fs.writeSync(fd, csvLine(columns, row));
  return true;
}
