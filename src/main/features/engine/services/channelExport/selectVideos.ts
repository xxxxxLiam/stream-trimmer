/**
 * File: selectVideos.ts
 * Path: src/main/features/engine/services/channelExport/selectVideos.ts
 * Description: Picks the videos to export: resumes the saved selection, or lists the channel, collects metadata and ranks by views.
 */
import { appendJsonl, readJsonl, writeJson } from "../resumeCache";
import { D } from "./channelDeps";
import { publishChannel } from "./channelJobs";
import { listChannelTab } from "./channelListing";
import { mapLimit } from "./concurrency";
import { META_CONCURRENCY, listingDepth, poolCap } from "./exportOptions";
import { RankedVideo } from "./exportTypes";
import { buildVideoRow } from "./videoRows";
import { runForJob } from "./ytRunner";
import { ExportRun } from "./exportRun";

export async function selectVideos(run: ExportRun): Promise<{ id: string; title: string }[]> {
  const { input, base, jobId, job, cookieOptions, ckSelection, ckMetadata, ckComments, ckTranscripts, ckStatuses, toDisk, videos, comments, transcripts, statuses } = run;
  let selected: { id: string; title: string }[] = [];
  if (run.saved && Array.isArray(run.saved.selected) && run.saved.selected.length > 0) {
    // Resuming: the ranking pass already ran, so the same top-N set is
    // reused rather than re-fetching metadata for the whole candidate pool.
    run.channelName = run.saved.channelName || "";
    run.subs = run.saved.subs ?? "";
    selected = run.saved.selected;
    videos.push(...(run.saved.videos ?? []));
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
        if (!run.channelName && name) run.channelName = name;
        if (run.subs === "" && s !== "") run.subs = s;
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
        pool.map((v) => buildVideoRow(v, {}, run.channelName))
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
          const row = buildVideoRow(v, meta, run.channelName);
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
    writeJson(ckSelection, {
  channelName: run.channelName,
  subs: run.subs,
  videos,
  selected,
});
  }

  return selected;
}
