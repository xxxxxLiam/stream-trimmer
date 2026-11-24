/**
 * File: exportResponse.ts
 * Path: server/channel/exportResponse.ts
 * Description: Builds the export response body: rows as JSON, or CSV files written to a temp folder.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { COMMENT_COLUMNS, STATUS_COLUMNS, SUMMARY_COLUMNS, TRANSCRIPT_COLUMNS, VIDEO_COLUMNS, describeParts, writeCsv, writeCsvFromJsonl } from "../csv";
import { EXPORT_PREFIX } from "../resumeCache";
import { CheckpointLostError } from "./checkpoints";
import { ExportRun } from "./exportRun";

  /**
   * The response body, in whichever delivery mode was asked for.
   *
   * "rows" hands back every row as JSON — fine for a browser and for small
   * runs. "path" writes the CSVs into a temp folder on this machine and
   * returns their paths: comments and transcripts are streamed straight out of
   * the JSONL checkpoints, so neither the server nor the UI ever holds a
   * whole channel's captions at once.
   */
export function buildResponse(run: ExportRun, cancelled: boolean) {
  const { input, base, jobId, ckComments, ckTranscripts, ckStatuses, liveFiles, toDisk, parts, videos, comments, transcripts, statuses } = run;
    const channel = {
      name: run.channelName || base,
      url: base,
      subscriber_count: run.subs,
      exported_at: new Date().toISOString(),
      filter: input.contentType,
      requested: input.limit,
      exported: videos.length,
    };
    if (!toDisk) {
      return {
        jobId,
        cancelled,
        channel,
        parts,
        videos,
        comments,
        transcripts,
        statuses,
      };
    }

    // The CSVs are streamed out of the live files. A missing one has been
    // deleted (it was created empty at the start), and streaming "nothing"
    // from it would write an empty CSV and call the run a success.
    for (const f of liveFiles.filter((x) => x !== ckStatuses)) {
      if (!fs.existsSync(f)) throw new CheckpointLostError(f);
    }
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), EXPORT_PREFIX));
    const at = (name: string) => path.join(outDir, name);
    // Only the requested CSVs are written. An unasked-for part yields no file
    // at all rather than an empty one, so the folder says what the run was.
    const names: string[] = [];
    const counts = { videos: 0, comments: 0, transcripts: 0 };
    if (parts.videoDetails) {
      counts.videos = writeCsv(at("videos.csv"), VIDEO_COLUMNS, videos);
      names.push("videos.csv");
    }
    if (parts.comments) {
      counts.comments = writeCsvFromJsonl(
        ckComments,
        at("comments.csv"),
        COMMENT_COLUMNS,
      );
      names.push("comments.csv");
    }
    if (parts.transcripts) {
      counts.transcripts = writeCsvFromJsonl(
        ckTranscripts,
        at("transcripts.csv"),
        TRANSCRIPT_COLUMNS,
      );
      names.push("transcripts.csv");
    }
    // Always written: one row saying what the run did, and a line per video
    // saying which ones gave trouble. A few kilobytes between them.
    writeCsv(at("summary.csv"), SUMMARY_COLUMNS, [
      {
        channel: channel.name,
        channel_url: channel.url,
        subscriber_count: channel.subscriber_count,
        exported_at: channel.exported_at,
        filter: channel.filter,
        requested: channel.requested,
        exported: channel.exported,
        cancelled,
        included: describeParts(parts),
      },
    ]);
    writeCsv(at("video-status.csv"), STATUS_COLUMNS, statuses);
    names.push("summary.csv", "video-status.csv");

    const files = names.map((name) => {
      let bytes = 0;
      try {
        bytes = fs.statSync(at(name)).size;
      } catch {
        /* reported as 0 */
      }
      return { name, path: at(name), bytes };
    });
    return { jobId, cancelled, channel, parts, dir: outDir, files, counts };
  }
