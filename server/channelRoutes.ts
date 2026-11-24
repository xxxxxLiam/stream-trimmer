/**
 * File: channelRoutes.ts
 * Path: server/channelRoutes.ts
 * Description: Channel profile exporter routes (/api/channel/export, /cancel,
 * /progress). Kept in its own module so scripts/build-server.cjs can alias it
 * to channelRoutes.stub.ts in a public build: the code then never enters the
 * packaged bundle at all, rather than sitting in it unreachable.
 */
import { type Express, type Request, type Response } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { COMMENT_COLUMNS, STATUS_COLUMNS, SUMMARY_COLUMNS, TRANSCRIPT_COLUMNS, VIDEO_COLUMNS, describeParts, writeCsv, writeCsvFromJsonl } from "./csv";
import { EXPORT_PREFIX, appendJsonl, markInUse, readJson, readJsonl, workDir, writeJson } from "./resumeCache";
import { ChannelDeps, D, setChannelDeps } from "./channel/channelDeps";
import { cancelChannelJob, getOrCreateChannelJob, publishChannel } from "./channel/channelJobs";
import { channelBaseUrl, fetchTranscript, listChannelTab } from "./channel/channelListing";
import { CHECKPOINT_PREFIX, CheckpointLostError, activeCheckpoints, appendCheckpoint, sweepStaleCheckpoints } from "./channel/checkpoints";
import { mapLimit } from "./channel/concurrency";
import { ChannelExportInput, META_CONCURRENCY, buildChannelExportSchema, listingDepth, poolCap } from "./channel/exportOptions";
import { RankedVideo, RawComment } from "./channel/exportTypes";
import { ownerOnly } from "./channel/ownerAccess";
import { buildVideoRow } from "./channel/videoRows";
import { runForJob } from "./channel/ytRunner";

export function registerChannelRoutes(app: Express, deps: ChannelDeps): void {
  setChannelDeps(deps);
  sweepStaleCheckpoints();

  app.post("/api/channel/export", ownerOnly(async (req: Request, res: Response) => {
    const parsed = buildChannelExportSchema().safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues[0].message });
    if (!D.binariesOk) return D.binaryError(res);

    const input: ChannelExportInput = parsed.data;
    const base = channelBaseUrl(input.url);
    if (!base)
      return res.status(400).json({
        error:
          "That doesn't look like a channel link. Use youtube.com/@handle or /channel/UC…",
      });

    const jobId =
      typeof req.query.jobId === "string" && req.query.jobId
        ? req.query.jobId
        : `chan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (
      !input.includeVideoDetails &&
      !input.includeComments &&
      !input.includeTranscripts
    ) {
      return res.status(400).json({
        error:
          "Pick at least one thing to export — video details, comments or transcripts.",
      });
    }

    const job = getOrCreateChannelJob(jobId);
    const cookieOptions: Record<string, unknown> = D.resolveCookieOptions(
      input.cookiesFromBrowser,
    );


    // Checkpoint folder keyed on everything that changes what gets exported.
    // Rows are flushed to disk per video, so a failure, a cancel or a quit only
    // costs the video in flight — the rerun continues from the next one.
    const ckDir = workDir(CHECKPOINT_PREFIX, [
      base,
      input.contentType,
      input.limit,
      input.includeVideoDetails,
      input.includeComments,
      input.includeTranscripts,
    ]);
    // Two runs of the same request share one checkpoint folder: both append
    // to it (doubled rows), and whichever finishes first deletes it from under
    // the other (header-only CSVs). The second is refused, before it can touch
    // the folder. Different requests have different folders and run freely.
    if (activeCheckpoints.has(ckDir)) {
      return res.status(409).json({
        error:
          "This export is already running. Wait for it to finish, or cancel it, before starting it again.",
      });
    }
    activeCheckpoints.add(ckDir);
    // Clear cache skips a folder that is marked in use (resumeCache.ts). Our
    // checkpoint prefix already keeps it out of that sweep; this is the shared
    // mechanism on top, so either one alone keeps the run safe.
    const releaseInUse = markInUse(ckDir);

    res.on("close", () => {
      if (!res.writableEnded) cancelChannelJob(jobId);
    });
    const ckSelection = path.join(ckDir, "selection.json");
    const ckMetadata = path.join(ckDir, "metadata.jsonl");
    const ckComments = path.join(ckDir, "comments.jsonl");
    const ckTranscripts = path.join(ckDir, "transcripts.jsonl");
    const ckStatuses = path.join(ckDir, "statuses.jsonl");
    const clearCheckpoint = () => {
      try {
        fs.rmSync(ckDir, { recursive: true, force: true });
      } catch {
        /* swept later */
      }
    };

    // "Start fresh" — the saved progress from an earlier run of this exact
    // request is discarded so nothing is carried over or skipped.
    if (input.fresh) {
      clearCheckpoint();
      try {
        fs.mkdirSync(ckDir, { recursive: true });
      } catch {
        /* the checkpoint is best-effort; the export still runs */
      }
    }

    interface Checkpoint {
      channelName: string;
      subs: number | "";
      videos: Record<string, unknown>[];
      selected: { id: string; title: string }[];
    }
    let saved = readJson<Checkpoint>(ckSelection);

    // Which live files this run depends on. Created empty up front so that a
    // file missing later means "deleted", never "nothing was collected".
    const liveFiles = [
      ckStatuses,
      ...(input.includeComments ? [ckComments] : []),
      ...(input.includeTranscripts ? [ckTranscripts] : []),
    ];
    // A resumed run whose rows have gone missing cannot be trusted: the
    // statuses say those videos were collected, so they would be skipped and
    // their comments silently absent. Start over rather than resume into a hole.
    if (saved && liveFiles.some((f) => !fs.existsSync(f))) {
      clearCheckpoint();
      saved = null;
    }
    try {
      fs.mkdirSync(ckDir, { recursive: true });
      for (const f of liveFiles) fs.closeSync(fs.openSync(f, "a"));
    } catch {
      /* the first append reports it if the folder really is unusable */
    }

    // In "path" mode comments and transcripts are never accumulated: they go to
    // the JSONL checkpoint as they are collected and are streamed from there
    // into CSVs at the end. They are the two that grow without bound — a few
    // thousand videos is millions of caption lines — so holding them is what
    // used to put a whole-channel export out of memory.
    const toDisk = input.deliver === "path";
    const videos: Record<string, unknown>[] = [];
    const comments: Record<string, unknown>[] = [];
    const transcripts: Record<string, unknown>[] = [];
    const statuses: Record<string, unknown>[] = [];
    let channelName = "";
    let subs: number | "" = "";

    // Which parts this run collected, echoed back so the UI reports on exactly
    // what it asked for.
    const parts = {
      videoDetails: input.includeVideoDetails,
      comments: input.includeComments,
      transcripts: input.includeTranscripts,
    };

    /**
     * The response body, in whichever delivery mode was asked for.
     *
     * "rows" hands back every row as JSON — fine for a browser and for small
     * runs. "path" writes the CSVs into a temp folder on this machine and
     * returns their paths: comments and transcripts are streamed straight out of
     * the JSONL checkpoints, so neither the server nor the UI ever holds a
     * whole channel's captions at once.
     */
    function buildResponse(cancelled: boolean) {
      const channel = {
        name: channelName || base,
        url: base,
        subscriber_count: subs,
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

    try {
      let selected: { id: string; title: string }[] = [];
      if (saved && Array.isArray(saved.selected) && saved.selected.length > 0) {
        // Resuming: the ranking pass already ran, so the same top-N set is
        // reused rather than re-fetching metadata for the whole candidate pool.
        channelName = saved.channelName || "";
        subs = saved.subs ?? "";
        selected = saved.selected;
        videos.push(...(saved.videos ?? []));
        // Statuses are loaded either way: they are one short row per video, and
        // they are what says which videos have already been collected.
        statuses.push(...readJsonl<Record<string, unknown>>(ckStatuses));
        if (!toDisk) {
          comments.push(...readJsonl<Record<string, unknown>>(ckComments));
          transcripts.push(...readJsonl<Record<string, unknown>>(ckTranscripts));
        }
      } else {
        publishChannel(jobId, {
          phase: "listing",
          current: 0,
          total: 0,
          label: "Reading the channel listing",
        });

        // Flat channel listings are inconsistent: the Videos tab carries duration
        // but no view counts, the Shorts tab carries view counts but no duration.
        // So each tab is pre-ranked with whatever signal it has (the Videos tab is
        // requested in YouTube's own "most popular" order), a candidate pool is
        // taken from the top of each, and the final ranking uses the real view
        // counts from full metadata.
        const tabs =
          input.contentType === "shorts"
            ? [`${base}/shorts`]
            : input.contentType === "longform"
              ? [`${base}/videos?view=0&sort=p`]
              : [`${base}/videos?view=0&sort=p`, `${base}/shorts`];

        const seen = new Map<string, RankedVideo>();
        const listEnd = listingDepth(input.limit);
        const candidates = poolCap(input.limit);
        let listedAny = false;
        let lastListError = "";
        for (const tab of tabs) {
          try {
            const { entries, channelName: name, subs: s } = await listChannelTab(
              job,
              tab,
              cookieOptions,
              listEnd,
            );
            listedAny = true;
            if (!channelName && name) channelName = name;
            if (subs === "" && s !== "") subs = s;
            const tabVideos: RankedVideo[] = [];
            for (const e of entries) {
              if (!e.id || seen.has(e.id)) continue;
              tabVideos.push({
                id: e.id,
                title: e.title ?? "",
                duration: Number(e.duration) || 0,
                view_count: Number(e.view_count) || 0,
              });
            }
            // Only re-sort when the tab actually reported view counts; otherwise
            // the listing order (popularity) is the better signal.
            if (tabVideos.some((v) => v.view_count > 0)) {
              tabVideos.sort((a, b) => b.view_count - a.view_count);
            }
            for (const v of tabVideos.slice(0, candidates)) seen.set(v.id, v);
          } catch (e) {
            lastListError = D.fullErrMessage(e);
            if (job.cancelled) break;
          }
        }
        if (job.cancelled) throw new Error("cancelled");
        if (!listedAny)
          throw new Error(lastListError || "Couldn't read this channel's videos.");

        const pool = [...seen.values()];
        if (pool.length === 0)
          throw new Error("No videos matched that filter on this channel.");

        // The metadata pass is one yt-dlp call per video and dominates a large
        // export. It earns its cost for exactly two things: the videos.csv rows,
        // and the view counts that rank a "Top N by views" run. When neither
        // applies — video details not wanted, and everything being exported
        // anyway — it is skipped outright. That is what makes a
        // transcripts-only run of a few thousand videos practical.
        const needsMetadata = input.includeVideoDetails || input.limit !== "all";

        // Full metadata for the candidate pool (duration, views, likes, comments).
        // Checkpointed per video: on a whole-channel run losing all of it to a
        // single interruption made resuming pointless.
        const cachedRows = new Map<string, Record<string, unknown>>();
        for (const row of readJsonl<Record<string, unknown>>(ckMetadata)) {
          const id = String((row as { video_id?: unknown })?.video_id ?? "");
          if (id) cachedRows.set(id, row);
        }
        let metaDone = 0;
        publishChannel(jobId, {
          phase: "metadata",
          current: 0,
          total: needsMetadata ? pool.length : 0,
          label: needsMetadata
            ? "Collecting video details"
            : "Skipping video details",
        });
        const fetched = !needsMetadata
          ? // Everything the listing already knows, and nothing fetched. The
            // rows are still built so the content-type filter and the selection
            // below work unchanged; they simply never reach a CSV.
            pool.map((v) => buildVideoRow(v, {}, channelName))
          : await mapLimit(pool, META_CONCURRENCY, async (v) => {
              const cached = cachedRows.get(v.id);
              if (cached) {
                metaDone += 1;
                return cached;
              }
              if (job.cancelled) return null;
              let meta: Record<string, any> = {};
              try {
                meta =
                  ((await runForJob(
                    job,
                    `https://www.youtube.com/watch?v=${v.id}`,
                    {
                      dumpSingleJson: true,
                      noPlaylist: true,
                      noWarnings: true,
                      skipDownload: true,
                      ...cookieOptions,
                    },
                    90_000,
                  )) as Record<string, any>) ?? {};
              } catch {
                meta = {};
              } finally {
                metaDone += 1;
                publishChannel(jobId, {
                  phase: "metadata",
                  current: metaDone,
                  total: pool.length,
                  label: v.title || v.id,
                });
              }
              const row = buildVideoRow(v, meta, channelName);
              appendJsonl(ckMetadata, [row]);
              return row;
            });
        if (job.cancelled) throw new Error("cancelled");

        let ranked = fetched.filter(
          (r): r is Record<string, unknown> => r !== null,
        );
        if (input.contentType === "shorts") {
          ranked = ranked.filter(
            (r) => Number(r.duration_seconds) === 0 || r.is_short === true,
          );
        } else if (input.contentType === "longform") {
          ranked = ranked.filter(
            (r) => Number(r.duration_seconds) === 0 || r.is_short === false,
          );
        }
        ranked.sort((a, b) => Number(b.view_count) - Number(a.view_count));
        const keep = input.limit === "all" ? ranked.length : input.limit;
        selected = ranked.slice(0, keep).map((r) => ({
          id: String(r.video_id),
          title: String(r.title),
        }));
        if (selected.length === 0)
          throw new Error("No videos matched that filter on this channel.");
        videos.push(...ranked.slice(0, keep));
        writeJson(ckSelection, { channelName, subs, videos, selected });
      }

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

      const cancelled = job.cancelled;
      publishChannel(jobId, {
        phase: cancelled ? "cancelled" : "done",
        current: selected.length,
        total: selected.length,
      });
      // Built before the checkpoint is dropped: in "path" mode the CSVs are
      // streamed out of those very files.
      const body = buildResponse(cancelled);
      // A finished export has nothing left to resume.
      if (!cancelled) clearCheckpoint();
      return res.json(body);
    } catch (e) {
      const cancelled = job.cancelled || (e as Error)?.message === "cancelled";
      if (cancelled) {
        publishChannel(jobId, {
          phase: "cancelled",
          current: videos.length,
          total: videos.length,
        });
        if (res.writableEnded || res.destroyed) return;
        try {
          return res.json(buildResponse(true));
        } catch (err) {
          return res.status(500).json({ error: D.fullErrMessage(err) });
        }
      }
      D.logYtError("/api/channel/export", input.url, { base }, e);
      const msg =
        e instanceof CheckpointLostError ? e.message : D.fullErrMessage(e);
      publishChannel(jobId, {
        phase: "error",
        current: 0,
        total: 0,
        message: msg,
      });
      if (res.writableEnded || res.destroyed) return;
      return res.status(500).json({ error: msg });
    } finally {
      activeCheckpoints.delete(ckDir);
      releaseInUse();
    }
  }));

  app.post("/api/channel/export/cancel", ownerOnly((req: Request, res: Response) => {
    const jobId = String((req.body ?? {}).jobId || "");
    if (!jobId) return res.status(400).json({ error: "Missing jobId" });
    cancelChannelJob(jobId);
    res.json({ ok: true });
  }));

  app.get("/api/channel/export/progress", ownerOnly((req: Request, res: Response) => {
    const jobId = String(req.query.jobId || "");
    if (!jobId) return res.status(400).end();
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const job = getOrCreateChannelJob(jobId);
    job.clients.add(res);
    res.write(`data: ${JSON.stringify(job.last)}\n\n`);

    const ping = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        /* ignore */
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(ping);
      job.clients.delete(res);
    });
  }));
}
