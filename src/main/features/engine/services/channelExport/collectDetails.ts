/**
 * File: collectDetails.ts
 * Path: src/main/features/engine/services/channelExport/collectDetails.ts
 * Description: Collects comments and transcripts per selected video and flushes each to the checkpoint as it goes.
 */
import { D } from "./channelDeps";
import { publishChannel } from "./channelJobs";
import { fetchTranscript } from "./channelListing";
import { appendCheckpoint } from "./checkpoints";
import { RawComment } from "./exportTypes";
import { runForJob } from "./ytRunner";
import { ExportRun } from "./exportRun";

export async function collectDetails(run: ExportRun, selected: { id: string; title: string }[]): Promise<void> {
  const { input, jobId, job, cookieOptions, ckComments, ckTranscripts, ckStatuses, toDisk, comments, transcripts, statuses } = run;
  const alreadyDone = new Set(
    statuses.map((s) => String((s as { video_id?: unknown }).video_id ?? "")),
  );
  if (alreadyDone.size > 0) {
    console.log(
      `[server] channel export resuming with ${alreadyDone.size} video(s) already collected`,
    );
    publishChannel(jobId, {
      phase: "details",
      current: alreadyDone.size,
      total: selected.length,
      label: `Resuming — ${alreadyDone.size} of ${selected.length} already collected`,
    });
  }


  // Per-video comments + transcripts. Sequential: these are the heavy calls
  // and YouTube throttles parallel comment scrapes aggressively.
  if (input.includeComments || input.includeTranscripts) {
    for (let i = 0; i < selected.length; i++) {
      if (job.cancelled) break;
      const v = selected[i];
      // Already collected on an earlier attempt — its rows were loaded from
      // the checkpoint, so skip the expensive scrape entirely.
      if (alreadyDone.has(v.id)) continue;
      const videoUrl = `https://www.youtube.com/watch?v=${v.id}`;
      const notes: string[] = [];
      const videoComments: Record<string, unknown>[] = [];
      const videoTranscripts: Record<string, unknown>[] = [];
      publishChannel(jobId, {
        phase: "details",
        current: i,
        total: selected.length,
        label: v.title || v.id,
      });

      if (input.includeComments) {
        try {
          const info = await runForJob(
            job,
            videoUrl,
            {
              dumpSingleJson: true,
              writeComments: true,
              noPlaylist: true,
              noWarnings: true,
              skipDownload: true,
              extractorArgs:
                "youtube:comment_sort=top;max_comments=50,50,0,0",
              ...cookieOptions,
            },
            240_000,
          );
          const raw: RawComment[] = Array.isArray(info?.comments)
            ? info.comments
            : [];
          if (raw.length === 0) notes.push("no comments");
          for (const c of raw) {
            const isReply = Boolean(c.parent && c.parent !== "root");
            videoComments.push({
              video_id: v.id,
              comment_id: c.id ?? "",
              parent_id: isReply ? c.parent ?? "" : "",
              is_reply: isReply,
              author: c.author ?? "",
              author_channel_id: c.author_id ?? "",
              text: c.text ?? "",
              like_count: typeof c.like_count === "number" ? c.like_count : "",
              is_pinned: Boolean(c.is_pinned),
              is_uploader: Boolean(c.author_is_uploader),
              published_time: c.time_text ?? "",
              timestamp: typeof c.timestamp === "number" ? c.timestamp : "",
            });
          }
        } catch (e) {
          notes.push(
            /comments are disabled/i.test(D.fullErrMessage(e))
              ? "comments disabled"
              : "comments unavailable",
          );
        }
      }

      if (!job.cancelled && input.includeTranscripts) {
        const lines = await fetchTranscript(job, videoUrl, cookieOptions);
        if (lines.length === 0) notes.push("no captions");
        for (const l of lines) {
          videoTranscripts.push({
            video_id: v.id,
            start: l.start,
            end: l.end,
            text: l.text,
          });
        }
      }

      if (job.cancelled) break;
      const statusRow = {
        video_id: v.id,
        title: v.title,
        status: notes.length === 0 ? "ok" : notes.join("; "),
      };
      if (!toDisk) {
        comments.push(...videoComments);
        transcripts.push(...videoTranscripts);
      }
      statuses.push(statusRow);
      // Flush this video to the checkpoint before moving on, so an
      // interruption never costs more than the video in flight.
      // Strict: a checkpoint deleted under us must stop the run, not turn
      // the rest of the export into an empty file reported as a success.
      appendCheckpoint(ckComments, videoComments);
      appendCheckpoint(ckTranscripts, videoTranscripts);
      appendCheckpoint(ckStatuses, [statusRow]);
    }
  }
}
