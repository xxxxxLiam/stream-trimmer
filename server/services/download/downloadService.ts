/**
 * File: downloadService.ts
 * Path: server/services/download/downloadService.ts
 * Description: Runs one /api/download request: probe, workspace, download, cut, join and the response.
 */
import { type Request, type Response } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { authProbeVerdict } from "../../youtubeAuth";
import { isDegradedDelivery } from "../../quality";
import { STAGE_FOUND, STAGE_WRITING, classifyFailure, estimateNeededMb, joinFailure, joinSegments, lowQualityWithoutSession, outPointFailure, probeDurationSec, refusedFailure, pruneWorkDir, resolveSegments, runProcess, sectionArg, segmentFileName, segmentWindow, segmentsTotal, staleSessionFailure, stageDownloaded, stageDownloading, stageJoining, type ClipFailure, type Segment } from "../../segments";
import { CLIP_PREFIX, holdFolder, jobDir, markInUse, partialBytes, tryClaim, workDir } from "../../resumeCache";
import { BIN_DIR, binariesOk, childEnv, probeDelivered, resolvedFfmpeg, yt } from "../binaries";
import { cookieModeFor, resolveCookieOptions, withRunCookies } from "../cookies";
import { CancelledError, cancelJobRun, killTree, registerJob, unregisterJob } from "../downloadJobs";
import { publishProgress } from "../progressChannel";
import { buildRunDiagnostics } from "../runDiagnostics";
import { probeYouTubeAuth } from "../youtubeAuthProbe";
import { MAX_CLIP_SECONDS } from "../../utils/engineConfig";
import { binaryError, cookieErrorMessage, fullErrMessage, isCookieError, logYtError, sendFailure } from "../../utils/errors";
import { DownloadInput, downloadSchema } from "../../utils/schemas";
import { localTrimArgs } from "../../utils/trimArgs";

export async function runDownload(req: Request, res: Response) {
  const parsed = downloadSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  const { url, format, quality, deliver, cookiesFromBrowser }: DownloadInput =
    parsed.data;
  // A clip is a list of ranges. The old single start/end is one segment.
  const resolvedSegments = resolveSegments(parsed.data, MAX_CLIP_SECONDS);
  if (!resolvedSegments.ok) {
    return res.status(400).json({ error: resolvedSegments.error });
  }
  const segs: Segment[] = resolvedSegments.segments;
  const segCount = segs.length;
  const multi = segCount > 1;
  const totalSec = segmentsTotal(segs);
  const lastEnd = Math.max(...segs.map((s) => s.end));

  const cookieOptions: Record<string, unknown> = resolveCookieOptions(cookiesFromBrowser);
  const cookieMode = cookieModeFor(cookiesFromBrowser);
  console.log(
    `[server] /api/download auth mode=${cookieMode} segments=${segCount}`,
  );

  const jobId =
    typeof req.query.jobId === "string" && req.query.jobId
      ? req.query.jobId
      : `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // Anything that fails from here on, including the pre-flight, carries the
  // per-run diagnostics Copy diagnostics needs (job id, versions, log lines).
  const diag = (raw: string) => ({ diagnostics: buildRunDiagnostics(jobId, raw) });

  // Cancellable from here until the clip is built or has failed. Hanging up
  // the request cancels it too.
  const job = registerJob(jobId);
  const throwIfCancelled = () => {
    if (job.cancelled) throw new CancelledError();
  };
  res.on("close", () => {
    if (!res.writableEnded && job.building) {
      console.log(`[server] /api/download client went away job=${jobId} — cancelling`);
      cancelJobRun(job);
    }
    unregisterJob(jobId, job);
  });
  const trackChild = (child: ChildProcess) => {
    job.children.add(child);
    child.once("close", () => job.children.delete(child));
    // Cancelled between the spawn decision and the spawn: do not let it run.
    if (job.cancelled) killTree(child);
  };
  const ytOpts = () =>
    ({
      env: childEnv(),
      detached: process.platform !== "win32",
      onSpawn: trackChild,
    }) as any;
  const sendCancelled = () => {
    publishProgress(jobId, { phase: "error", percent: 0, message: "Cancelled" });
    if (res.headersSent || res.writableEnded) return;
    return res.status(499).json({
      error: "Cancelled",
      code: "cancelled",
      cancelled: true,
    });
  };

  // True only when the probe confirmed a signed-in session. A clip that lands
  // at 360p without one is reported as an expired or missing sign-in.
  let sessionConfirmed = false;

  const requiresVerifiedSession =
    format === "mp4" && (quality === "best" || Number(quality) > 360);
  if (requiresVerifiedSession) {
    if (cookieMode === "none") {
      const cause =
        "No YouTube session is connected, and YouTube serves higher formats only to signed-in requests";
      const preserved = "Your marked range is kept.";
      return res.status(401).json({
        code: "YOUTUBE_AUTH_REQUIRED",
        error: `${cause}. Connect YouTube. ${preserved}`,
        cause,
        action: { id: "import_cookies", label: "Connect YouTube" },
        preserved,
        ...diag(cause),
      });
    }
    // A private copy: this is one of possibly many runs in flight, and yt-dlp
    // writes its jar back on every run.
    const auth = await withRunCookies(cookieMode, cookieOptions, false, (c) =>
      probeYouTubeAuth(
        c,
        (child) => {
          if (child) trackChild(child);
        },
        () => job.cancelled,
      ),
    );
    if (job.cancelled) return sendCancelled();
    const verdict = authProbeVerdict(auth.status);
    if (verdict === "rate_limited") {
      return res.status(429).json({
        code: "YOUTUBE_RATE_LIMITED",
        error:
          "YouTube is rate-limiting this network. Wait a few minutes and try again — your sign-in is fine, re-importing cookies won't help.",
        reason: auth.reason,
        ...diag(auth.reason ?? "rate limited"),
      });
    }
    if (verdict === "blocked") {
      const f = staleSessionFailure(401, "Your marked range is kept.");
      return res.status(401).json({
        code: "YOUTUBE_AUTH_REQUIRED",
        error: f.error,
        cause: f.cause,
        action: f.action,
        preserved: f.preserved,
        reason: auth.reason,
        ...diag(auth.reason ?? f.cause),
      });
    }
    if (auth.status !== "signed_in") {
      // Couldn't confirm, but nothing says the session is bad. Proceed and
      // let yt-dlp produce a real error if it genuinely cannot authenticate.
      console.log(
        `[server] /api/download proceeding on an unconfirmed session (${auth.status})`,
      );
    } else {
      sessionConfirmed = true;
    }
  }

  // Re-probe duration so the cap can't be bypassed by a crafted request.
  // Doubles as the source of truth for which heights YouTube actually offers.
  let availableHeights: number[] = [];
  const probeWith = (opts: Record<string, unknown>) => ({
    dumpSingleJson: true,
    noWarnings: true,
    noPlaylist: true,
    ...opts,
  });
  let probeOptions: Record<string, unknown> = probeWith(cookieOptions);
  const runProbe = (opts: Record<string, unknown>) =>
    withRunCookies(cookieMode, opts, false, (c) => {
      const withCookies = probeWith(c);
      probeOptions = withCookies;
      console.log(
        `[server] /api/download probe url=${url} options=${JSON.stringify(withCookies)}`,
      );
      return yt!.run(url, withCookies, ytOpts());
    });
  try {
    const info: any = await runProbe(cookieOptions);
    throwIfCancelled();
    if (typeof info.duration === "number" && lastEnd > info.duration + 1) {
      const f = outPointFailure(lastEnd, info.duration);
      return sendFailure(
        res,
        f,
        diag(`${f.cause} (requested out point ${lastEnd}s, video ${info.duration}s)`),
      );
    }
    availableHeights = Array.from(
      new Set(
        (Array.isArray(info.formats) ? info.formats : [])
          .map((f: { height?: number | null }) => Number(f?.height) || 0)
          .filter((h: number) => h > 0),
      ),
    ).sort((a, b) => (b as number) - (a as number)) as number[];
    console.log(
      `[server] /api/download available heights=${availableHeights.join(",") || "unknown"}`,
    );
  } catch (e) {
    if (job.cancelled || e instanceof CancelledError) return sendCancelled();
    if (cookiesFromBrowser && isCookieError(e)) {
      return res.status(400).json({
        error: cookieErrorMessage(cookiesFromBrowser),
        ...diag(fullErrMessage(e)),
      });
    }
    logYtError("/api/download probe", url, probeOptions, e);
    const raw = fullErrMessage(e);
    return sendFailure(res, classifyFailure(raw), diag(raw));
  }
  publishProgress(jobId, {
    phase: "downloading",
    percent: 0,
    message: STAGE_FOUND,
  });

  const isAudio = format === "mp3";
  const ext = isAudio ? "mp3" : "mp4";
  // Two folders, because two different things have to survive:
  //  - the SHARED folder is keyed by video+format+quality+ranges, so yt-dlp's
  //    `.part` files and a whole-file source outlive a failure and the retry
  //    continues from where it stopped. Only one live job may use it at a time
  //    (a second one with the same key works privately, with no resume), since
  //    two yt-dlp runs must never write the same `.part`.
  //  - the CLIP folder belongs to this request alone (key + random suffix). The
  //    finished clip, the concat list and the join output live there, so a
  //    second download of the same clip, however it arrives, can neither delete
  //    them nor have its own deleted. The app's main process moves the clip out
  //    and removes this folder.
  const keyParts = multi
    ? [
        url,
        format,
        quality,
        "segments",
        ...segs.map((s) => `${s.start.toFixed(2)}-${s.end.toFixed(2)}`),
      ]
    : [url, format, quality, segs[0].start.toFixed(2), segs[0].end.toFixed(2)];
  const sharedDir = workDir(CLIP_PREFIX, keyParts);
  const releaseShared = tryClaim(sharedDir);
  const clipDir = jobDir(CLIP_PREFIX, keyParts);
  const releaseClipDir = markInUse(clipDir);
  // Where segment files, `.part` files and the whole-file source go.
  const tempDir = releaseShared ? sharedDir : clipDir;
  if (!releaseShared) {
    console.log(
      `[server] /api/download job=${jobId} same clip already downloading — working in a private folder`,
    );
  }
  const outputPath = path.join(clipDir, `clip.${ext}`);
  // Per-segment files and the join's inputs. Every segment, a lone one too,
  // is written into the resumable folder, never straight into the per-request
  // clip folder: a failure deletes that whole folder, and with it the `.part`
  // a retry would continue from. A lone segment is moved to outputPath once
  // it is complete (see buildClip).
  const segFiles = segs.map((_, i) => path.join(tempDir, segmentFileName(i, ext)));
  const listPath = path.join(clipDir, "list.txt");
  // A finished clip left from a previous run is never reused — only partials.
  for (const f of [outputPath, listPath, ...segFiles]) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      /* ignore */
    }
  }
  const resumeBytes = partialBytes(tempDir);
  if (resumeBytes > 0) {
    console.log(
      `[server] /api/download resuming with ${resumeBytes} cached byte(s) in ${tempDir}`,
    );
  }
  // Ends this job's claim on both folders. `keepClip` leaves the clip folder in
  // place (the finished clip is being handed over); otherwise it is removed.
  let workReleased = false;
  const releaseWork = (keepClip: boolean) => {
    if (workReleased) return;
    workReleased = true;
    if (!keepClip) {
      try {
        fs.rmSync(clipDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    releaseClipDir();
    releaseShared?.();
    // The shared folder is dropped once nothing resumable is left in it.
    try {
      fs.rmdirSync(sharedDir);
    } catch {
      /* not empty: partials a retry will resume from */
    }
  };
  const cleanup = () => releaseWork(false);


  // Every tier here used to lead with `protocol*=m3u8`. That was written when
  // SABR had stopped web clients handing out usable DASH URLs and web_safari's
  // pre-merged HLS was the only thing left that survived ffmpeg's range
  // requests. It has since inverted: YouTube only returns HLS to logged-in or
  // otherwise "trusted" sessions, so on an ordinary session every m3u8 tier
  // matched nothing, the whole ladder fell through to the bare `best`, and a
  // video the probe had just listed at 1080p was delivered as itag 18 — muxed
  // 360p. Protocol is therefore no longer part of the selection at all:
  // resolution is the key, HLS competes with DASH on equal terms at each
  // height, and the mp4/avc1 pairing is preferred only because it copies into
  // the output container without re-encoding. A DASH URL that does 403 under
  // ffmpeg is still caught by isForbidden() below, which moves the whole job
  // to the fallback path where yt-dlp fetches the media itself — that path,
  // not an HLS-first selector, is what covers the 403.
  const videoFormat =
    quality === "best"
      ? [
          "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]",
          "bestvideo+bestaudio",
          // Pre-merged renditions, itag 18 among them, only once no separate
          // video+audio pair exists at all.
          "best[ext=mp4]",
          "best",
        ].join("/")
      : [
          // Exact requested height first, whatever protocol serves it.
          `bestvideo[height=${quality}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]`,
          `bestvideo[height=${quality}]+bestaudio`,
          `best[height=${quality}][ext=mp4]`,
          `best[height=${quality}]`,
          // Then step down.
          `bestvideo[height<=${quality}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]`,
          `bestvideo[height<=${quality}]+bestaudio`,
          `best[height<=${quality}][ext=mp4]`,
          `best[height<=${quality}]`,
        ].join("/");


  // Naming player clients here is what capped users at 360p: the pinned set
  // (web_safari, web, mweb, tv) turned out to be exactly the clients YouTube
  // now gates behind a GVS PO token this app has no way to mint, while every
  // token-free client was excluded. Per yt-dlp's own extractor tables:
  //   web, web_safari — WEB_PO_TOKEN_POLICIES marks HTTPS and DASH
  //     required=True, so their only ungated formats are HLS, and web_safari
  //     is annotated "Since 2026.07, HLS formats are only returned with some
  //     logged-in or 'trusted' sessions". On a session that is not trusted
  //     these clients contribute nothing usable above 360p.
  //   mweb, tv_simply, android, ios — each carries its own GVS_PO_TOKEN_POLICY
  //     with required=True for HTTPS/DASH. Same dead end.
  //   tv — yt-dlp's workaround for the DRM'd-formats bug (yt-dlp#12563) is
  //     annotated "not effective when logged-in", and this app always sends
  //     cookies, so `tv` is the one state where the workaround does not apply.
  //   android_vr — removed from the fallback: it is annotated "Since
  //     2026.08.17, ALL formats (including live HLS and itag 18) are 403'd",
  //     so it could only make the whole-file retry fail, never succeed.
  // So stop pinning. `default` is yt-dlp's own current choice and it swaps to
  // the authenticated set on its own when cookies are present, which means the
  // next time YouTube rotates which client works this app follows without a
  // release. web_embedded is named explicitly for two reasons: it has no
  // GVS_PO_TOKEN_POLICY at all, and `default` collapses to visionos alone when
  // no JS runtime is installed, which is a thin single point of failure.
  const PLAYER_CLIENTS_PRIMARY = "youtube:player_client=default,web_embedded";
  // Used only when a finished clip comes back far below the resolution the
  // probe listed, so it has to be a genuinely different configuration rather
  // than a superset of the primary: the token-free clients spelled out, in a
  // different order, independent of whatever `default` resolved to. (The
  // 403 retry is a different downloader on the same clients, not this.)
  const PLAYER_CLIENTS_FALLBACK =
    "youtube:player_client=tv_samsung,web_embedded,visionos";

  // Cookie options are deliberately NOT part of this: each yt-dlp run is given
  // its own cookie file by withRunCookies, never the canonical one.
  const commonOptions: Record<string, unknown> = {
    noPlaylist: true,
    noWarnings: true,
    newline: true,
    progress: true,
    // Pick up any `.part` file left in this work folder by a failed run.
    continue: true,
    ffmpegLocation: resolvedFfmpeg,
  };


  const formatOptions: Record<string, unknown> = isAudio
    ? { extractAudio: true, audioFormat: "mp3", audioQuality: quality }
    : { format: videoFormat, mergeOutputFormat: "mp4", remuxVideo: "mp4" };

  // Both attempts are built per client list rather than once, because a clip
  // that comes back far below the resolution YouTube listed is re-run on a
  // different set of clients (see the degraded-delivery check below).

  // Attempt 1: let yt-dlp cut the section (fast, ffmpeg fetches the range).
  // --force-keyframes-at-cuts is what makes the cut frame-accurate: without it
  // the cut snaps to the nearest keyframe and starts early.
  const sectionOptionsFor = (
    clients: string,
    seg: Segment,
    out: string,
    cookies: Record<string, unknown>,
  ): Record<string, unknown> => ({
    ...commonOptions,
    ...cookies,
    ...formatOptions,
    extractorArgs: clients,
    downloadSections: sectionArg(seg),
    forceKeyframesAtCuts: true,
    output: out,
    // Make ffmpeg's range request look like the one that minted the URL.
    addHeader: [
      "Referer:https://www.youtube.com/",
      "Origin:https://www.youtube.com",
    ],
  });

  // Attempt 2 (fallback): yt-dlp downloads the whole media itself (native
  // downloader, no ffmpeg-fetched URLs), then we trim locally.
  const fullPath = path.join(tempDir, `source.${isAudio ? "m4a" : "mp4"}`);
  const fullOptionsFor = (
    clients: string,
    cookies: Record<string, unknown>,
  ): Record<string, unknown> => ({
    ...commonOptions,
    ...cookies,
    extractorArgs: clients,
    // Fetch HLS with yt-dlp's own segment downloader so ffmpeg only ever sees
    // a local file. Older bundled ffmpeg builds crash fetching m3u8 themselves.
    hlsPreferNative: true,
    ...(isAudio
      ? {
          // Protocol is left out of the audio ladder for the same reason as
          // the video one: HLS is no longer reliably offered, so asking for it
          // first meant falling through to `best` and transcoding the muxed
          // 360p stream's audio track.
          format: "bestaudio[ext=m4a]/bestaudio/best",
        }
      : { format: videoFormat, mergeOutputFormat: "mp4" }),
    output: fullPath,
  });

  let options: Record<string, unknown> = sectionOptionsFor(
    PLAYER_CLIENTS_PRIMARY,
    segs[0],
    segFiles[0],
    cookieOptions,
  );

  // Progress is driven by ffmpeg's `... time=HH:MM:SS.ss ...` output, which
  // streams continuously as the clip is processed (yt-dlp routes section
  // downloads through ffmpeg with --download-sections). Progress =
  // processed time / segment length. yt-dlp's own `[download] NN%` only
  // appears once at the very end, so it's used only as a fallback.
  let segDuration = Math.max(0.1, segs[0].end - segs[0].start);
  let lastReported = 0;
  // The named stage the bar is currently in; carried on every tick so the UI
  // always says what the percentage is a percentage of.
  let currentStage = STAGE_FOUND;
  // Progress window the current phase maps onto (fallback splits the bar).
  let scaleFrom = 0;
  let scaleTo = 99;
  const report = (fraction: number) => {
    const pct = Math.min(
      99,
      Math.round(scaleFrom + (scaleTo - scaleFrom) * Math.min(1, fraction)),
    );
    if (pct > lastReported) {
      lastReported = pct;
      publishProgress(jobId, {
        phase: "downloading",
        percent: pct,
        message: currentStage,
        stage: currentStage,
      });
    }
  };
  const hmsToSeconds = (h: string, m: string, s: string) =>
    Number(h) * 3600 + Number(m) * 60 + parseFloat(s);
  // yt-dlp announces its pick as "Downloading 1 format(s): 299+140" — keep it
  // so a silent quality downgrade is diagnosable from the log and the client.
  let chosenFormat = "";
  const updateFromLine = (line: string) => {
    const fm = line.match(/Downloading\s+\d+\s+format\(s\):\s*([\w+\-.,]+)/);
    if (fm) {
      chosenFormat = fm[1];
      console.log(`[server] yt-dlp selected format(s)=${chosenFormat}`);
    }
    const tm = line.match(/time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
    if (tm) {
      const secs = hmsToSeconds(tm[1], tm[2], tm[3]);
      // Ignore ffmpeg's initial bogus negative timestamp.
      if (secs >= 0) report(secs / segDuration);
      return;
    }
    // Fallback: honor a real yt-dlp download percentage if one is emitted.
    const dm = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    if (dm) report(parseFloat(dm[1]) / 100);
  };


  // Everything the engine wrote to stderr during THIS run, for Copy diagnostics.
  const RUN_STDERR_MAX = 60_000;
  let runStderrRaw = "";

  // Spawn a child and stream its output through updateFromLine, rejecting with
  // the trimmed stderr tail on non-zero exit.
  const runStreaming = (
    spawnChild: () => ChildProcess,
    label: string,
  ): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (job.cancelled) return reject(new CancelledError());
      const child = spawnChild();
      trackChild(child);
      runStderrRaw = `${runStderrRaw}# ${label}\n`.slice(-RUN_STDERR_MAX);
      child.stderr?.on("data", (c: Buffer | string) => {
        runStderrRaw = (runStderrRaw + c.toString()).slice(-RUN_STDERR_MAX);
      });
      let buf = "";
      let stderrTail = "";
      const onChunk = (chunk: Buffer | string) => {
        const s = chunk.toString();
        buf += s;
        stderrTail = (stderrTail + s).slice(-4000);
        const parts = buf.split(/\r|\n/);
        buf = parts.pop() || "";
        for (const line of parts) updateFromLine(line);
      };
      child.stdout?.on("data", onChunk);
      child.stderr?.on("data", onChunk);
      child.on("error", reject);
      child.on("close", (code) => {
        if (buf) updateFromLine(buf);
        if (job.cancelled) return reject(new CancelledError());
        if (code === 0) return resolve();
        const tail = stderrTail
          .split(/\r?\n/)
          .filter((l) => l.trim() && !/^\[download\]\s+\d/.test(l))
          .slice(-8)
          .join("\n")
          .trim();
        console.error(`[server] ${label} exit ${code} job=${jobId}:\n${tail}`);
        const err: any = new Error(tail || `${label} exited with code ${code}`);
        err.tail = tail;
        reject(err);
      });
    });

  // A 403 on the media URL, or any ffmpeg failure while it fetches the stream
  // itself (including crashes on m3u8 input), means the sectioned path is
  // unusable for this video — retry via the whole-file + local-trim path.
  const isForbidden = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      /403|Forbidden|ffmpeg exited with code|fragment.*not found/i.test(msg)
    );
  };

  // A finished whole-file download. A `.part` is not one: yt-dlp renames it
  // only once the file is complete.
  const findDownloaded = (): string | null => {
    if (fs.existsSync(fullPath)) return fullPath;
    const match = fs
      .readdirSync(tempDir)
      .filter((f) => f.startsWith("source.") && !/\.(part|ytdl)$/.test(f))
      .map((f) => path.join(tempDir, f))[0];
    return match ?? null;
  };

  // ffmpeg can find a duration in it. A file that was renamed into place
  // part-way (no moov atom) or is otherwise not media has none.
  let verifiedSource: string | null = null;
  const isReadableMedia = (file: string): boolean =>
    probeDurationSec(resolvedFfmpeg as string, file) !== undefined;

  // Everything a build leaves beside the finished clip: segment files, the
  // concat list and the whole-file source. Partials (`.part`) are never
  // touched, they are what a retry resumes from.
  const dropIntermediates = (keepSource: boolean) => {
    const doomed = [...segFiles, listPath];
    if (!keepSource) {
      try {
        for (const f of fs.readdirSync(tempDir)) {
          if (f.startsWith("source.") && !/\.(part|ytdl)$/.test(f)) {
            doomed.push(path.join(tempDir, f));
          }
        }
      } catch {
        /* folder gone */
      }
    }
    for (const f of doomed) {
      try {
        fs.rmSync(f, { force: true });
      } catch {
        /* ignore */
      }
    }
  };

  // One segment on one set of player clients: sectioned first, whole-file-then-
  // trim if the sectioned URLs 403. `state.sectionsForbidden` carries the 403
  // verdict from one segment to the next, so the rest go straight to the local
  // trim instead of failing the same way again.
  const buildSegment = async (
    clients: string,
    index: number,
    state: { sectionsForbidden: boolean },
  ): Promise<void> => {
    throwIfCancelled();
    const seg = segs[index];
    const out = segFiles[index];
    const win = segmentWindow(index, segCount);
    segDuration = Math.max(0.1, seg.end - seg.start);
    // Segment one is the one run allowed to refresh the user's saved session;
    // every other is a throwaway copy.
    await withRunCookies(cookieMode, cookieOptions, index === 0, async (cookies) => {
      const sectionOptions = sectionOptionsFor(clients, seg, out, cookies);
      options = sectionOptions;
      lastReported = win.from;
      scaleFrom = win.from;
      scaleTo = win.to;
      if (!state.sectionsForbidden) {
        console.log(
          `[server] /api/download exec job=${jobId} url=${url} segment=${index + 1}/${segCount} options=${JSON.stringify(sectionOptions)}`,
        );
        try {
          await runStreaming(
            () => yt!.exec(url, sectionOptions, ytOpts()),
            "yt-dlp",
          );
          return;
        } catch (sectionErr) {
          if (job.cancelled || sectionErr instanceof CancelledError) throw sectionErr;
          if (!isForbidden(sectionErr)) throw sectionErr;
          state.sectionsForbidden = true;
          console.warn(
            `[server] sectioned download failed (403) job=${jobId} — retrying with full download + local trim`,
          );
        }
      }

      const fullOptions = fullOptionsFor(clients, cookies);
      options = fullOptions;
      // One segment splits the bar 70/29 exactly as it always has.
      const mid =
        segCount <= 1
          ? 70
          : Math.round(win.from + (win.to - win.from) * 0.7);
      lastReported = win.from;
      scaleFrom = win.from;
      scaleTo = mid;
      publishProgress(jobId, {
        phase: "downloading",
        percent: win.from,
        message: currentStage,
        stage: currentStage,
      });
      // The whole file is the same for every segment, so fetch it once. A
      // copy left by an earlier run is only trusted once ffmpeg can read it:
      // a truncated one used to be kept and re-used forever.
      let source = findDownloaded();
      if (source && source !== verifiedSource && !isReadableMedia(source)) {
        console.warn(
          `[server] job=${jobId} cached download ${source} is not readable media — discarding and fetching it again`,
        );
        try {
          fs.rmSync(source, { force: true });
        } catch {
          /* ignore */
        }
        source = null;
      }
      if (!source) {
        await runStreaming(
          () => yt!.exec(url, fullOptions, ytOpts()),
          "yt-dlp (full)",
        );
        source = findDownloaded();
      }
      if (!source) throw new Error("yt-dlp produced no output");
      if (source !== verifiedSource) {
        if (!isReadableMedia(source)) {
          try {
            fs.rmSync(source, { force: true });
          } catch {
            /* ignore */
          }
          throw new Error(
            "The downloaded video file is damaged and was discarded, so nothing could be cut from it",
          );
        }
        verifiedSource = source;
      }

      scaleFrom = mid;
      scaleTo = win.to;
      lastReported = mid;
      const trimArgs = isAudio
        ? [
            "-hide_banner",
            "-y",
            "-ss",
            String(seg.start),
            "-to",
            String(seg.end),
            "-i",
            source,
            "-vn",
            "-c:a",
            "libmp3lame",
            "-b:a",
            `${quality}k`,
            out,
          ]
        : localTrimArgs(source, seg, out);
      await runStreaming(
        () =>
          spawn(resolvedFfmpeg as string, trimArgs, {
            env: childEnv(),
            windowsHide: true,
            shell: false,
            detached: process.platform !== "win32",
          }),
        "ffmpeg (trim)",
      );
      // A lone segment is done with the source. Several share it, so it goes
      // when the whole clip is built.
      if (!multi) {
        try {
          fs.rmSync(source, { force: true });
        } catch {
          /* ignore */
        }
      }
    });
  };

  // How the last join was made, for the response and the log.
  let joinMethod: "copy" | "reencode" | null = null;

  // One complete build of the clip on one set of player clients: each segment
  // in order, then (for several) the join into one file.
  const buildClip = async (clients: string): Promise<void> => {
    lastReported = 0;
    let built = false;
    const state = { sectionsForbidden: false };
    try {
      for (let i = 0; i < segCount; i++) {
        currentStage = stageDownloading(i + 1, segCount);
        publishProgress(jobId, {
          phase: "downloading",
          percent: Math.max(lastReported, segmentWindow(i, segCount).from),
          message: currentStage,
          stage: currentStage,
          segment: i + 1,
          segments: segCount,
        });
        await buildSegment(clients, i, state);
        const win = segmentWindow(i, segCount);
        currentStage = stageDownloaded(i + 1, segCount);
        lastReported = Math.max(lastReported, win.to);
        publishProgress(jobId, {
          phase: "downloading",
          percent: win.to,
          message: currentStage,
          stage: currentStage,
          segment: i + 1,
          segments: segCount,
        });
      }

      if (multi) {
        throwIfCancelled();
        currentStage = stageJoining(segCount);
        publishProgress(jobId, {
          phase: "processing",
          percent: 92,
          message: currentStage,
          stage: currentStage,
        });
        const join = await joinSegments(
          segFiles,
          outputPath,
          listPath,
          totalSec,
          { isAudio, audioKbps: quality },
          {
            // The join ffmpeg is a child of the job like any other: a cancel
            // kills it, and once cancelled no further join attempt starts.
            run: (args) =>
              job.cancelled
                ? Promise.resolve({ code: -1, stderr: "cancelled" })
                : runProcess(
                    resolvedFfmpeg as string,
                    args,
                    childEnv(),
                    trackChild,
                  ),
            probeDuration: (file) =>
              probeDurationSec(resolvedFfmpeg as string, file),
            log: (m) => console.log(`[server] /api/download job=${jobId} ${m}`),
          },
        );
        throwIfCancelled();
        joinMethod = join.method;
        if (!join.durationOk) {
          // The server's own check says this is not the clip that was marked.
          // Delivering it as a success is how a wrong clip got silently saved;
          // fail instead, with the pieces' measurements in the message.
          const got =
            join.duration === undefined
              ? "of unreadable length"
              : `${join.duration.toFixed(2)}s long`;
          const msg = `The joined clip came out ${got} but the marked ranges total ${totalSec.toFixed(2)}s`;
          console.warn(
            `[server] /api/download job=${jobId} ${msg} even after ${join.method} — failing the job`,
          );
          try {
            fs.rmSync(outputPath, { force: true });
          } catch {
            /* ignore */
          }
          const err: any = new Error(msg);
          err.tail = msg;
          err.joinFailed = true;
          throw err;
        }
      }
      if (!multi && fs.existsSync(segFiles[0])) {
        // The finished segment is the clip. A rename within the temp root is
        // atomic and leaves no `.part` behind it.
        fs.renameSync(segFiles[0], outputPath);
      }
      built = true;
    } finally {
      // Success or failure, the pieces are not the deliverable. On success the
      // whole-file source goes too; on failure it stays, a resumable download.
      dropIntermediates(!built);
    }
  };

  try {
    publishProgress(jobId, {
      phase: "downloading",
      percent: 0,
      ...(resumeBytes > 0
        ? {
            message: `Resuming — ${(resumeBytes / (1024 * 1024)).toFixed(1)} MB already downloaded`,
          }
        : {}),
    });

    console.log(
      `[server] download job=${jobId} using binDir=${BIN_DIR ?? "(none)"}`,
    );
    await buildClip(PLAYER_CLIENTS_PRIMARY);
    throwIfCancelled();

    if (!fs.existsSync(outputPath)) {
      // Resumable partials deliberately kept so the next attempt can resume.
      pruneWorkDir(tempDir);
      releaseWork(false);
      const f = classifyFailure("yt-dlp produced no output");
      publishProgress(jobId, {
        phase: "error",
        percent: 0,
        message: "no output",
      });
      return sendFailure(res, f, diag("yt-dlp produced no output"));
    }

    publishProgress(jobId, { phase: "processing", percent: 99 });

    // Report what was actually delivered: YouTube's SABR rollout can leave a
    // video whose only fetchable renditions sit below the requested height, so
    // the clip legitimately completes at a lower resolution. Probed with the
    // resolved ffmpeg (ffprobe is not bundled) and passed back as headers since
    // the response body is the media stream itself.
    let delivered = probeDelivered(outputPath, resolvedFfmpeg as string);

    // The 360p-from-a-1080p-video bug was invisible for months because the
    // two numbers that prove it — what the probe listed and what came out —
    // only ever met in a log line. A clip that lands below half of what both
    // the request and the probe said was reachable is not a compromise, it is
    // a player client that handed back nothing usable, so it is worth paying
    // for one more download on a different client set before giving up.
    const requestedHeight: number | "best" =
      quality === "best" ? "best" : Number(quality);
    let degraded = isDegradedDelivery(
      delivered.height,
      requestedHeight,
      availableHeights,
    );
    if (degraded) {
      console.warn(
        `[server] /api/download degraded job=${jobId} requested=${quality} delivered=${delivered.height ?? "?"} available=${availableHeights.join(",") || "unknown"} — rebuilding on ${PLAYER_CLIENTS_FALLBACK}`,
      );
      publishProgress(jobId, {
        phase: "downloading",
        percent: 0,
        message:
          "YouTube served a much lower resolution than it listed — retrying with a different player client.",
      });
      // The degraded clip is moved aside rather than deleted: if the retry
      // fails outright the user still gets a watchable clip instead of an
      // error, which is what they had before this check existed.
      const keptPath = path.join(clipDir, `degraded.${ext}`);
      const keptFormat = chosenFormat;
      try {
        fs.rmSync(keptPath, { force: true });
      } catch {
        /* ignore */
      }
      fs.renameSync(outputPath, keptPath);
      try {
        chosenFormat = "";
        await buildClip(PLAYER_CLIENTS_FALLBACK);
        if (!fs.existsSync(outputPath)) {
          throw new Error("yt-dlp produced no output");
        }
      } catch (retryErr) {
        if (job.cancelled || retryErr instanceof CancelledError) throw retryErr;
        const why =
          retryErr instanceof Error ? retryErr.message : String(retryErr);
        console.warn(
          `[server] /api/download degraded retry failed job=${jobId}: ${why} — keeping the ${delivered.height ?? "?"}p clip`,
        );
        chosenFormat = keptFormat;
        try {
          fs.rmSync(outputPath, { force: true });
        } catch {
          /* ignore */
        }
        fs.renameSync(keptPath, outputPath);
      }
      try {
        fs.rmSync(keptPath, { force: true });
      } catch {
        /* ignore */
      }
      publishProgress(jobId, { phase: "processing", percent: 99 });
      delivered = probeDelivered(outputPath, resolvedFfmpeg as string);
      degraded = isDegradedDelivery(
        delivered.height,
        requestedHeight,
        availableHeights,
      );
    }

    // A 360p file with no confirmed session behind it is the expired-sign-in
    // failure, not a quality choice. The clip is still delivered (it is real
    // work), but it never passes silently: the cause and the one fix travel
    // with it.
    const lowQuality = lowQualityWithoutSession({
      deliveredHeight: delivered.height,
      requested: requestedHeight,
      sessionValid: sessionConfirmed,
      isAudio,
    })
      ? staleSessionFailure(200, "The 360p clip is kept.")
      : null;
    if (lowQuality) {
      console.warn(
        `[server] /api/download low quality without a session job=${jobId} delivered=${delivered.height} auth=${cookieMode} confirmed=${sessionConfirmed}`,
      );
    }

    if (delivered.height) {
      res.setHeader("X-Delivered-Height", String(delivered.height));
    }
    if (delivered.audioKbps) {
      res.setHeader("X-Delivered-Audio-Kbps", String(delivered.audioKbps));
    }
    if (chosenFormat) res.setHeader("X-Selected-Format", chosenFormat);
    if (availableHeights.length)
      res.setHeader("X-Available-Heights", availableHeights.join(","));
    res.setHeader("X-Auth-Mode", cookieMode);
    res.setHeader("X-Segments", String(segCount));
    if (joinMethod) res.setHeader("X-Join-Method", joinMethod);
    if (lowQuality) {
      res.setHeader("X-Quality-Cause", lowQuality.code);
      res.setHeader("X-Quality-Message", lowQuality.cause);
      res.setHeader("X-Quality-Action", lowQuality.action.id);
    }
    // Both client sets came back degraded. Nothing left to retry, so say so
    // out loud rather than letting a 360p file pass for a 1080p download.
    if (degraded) {
      res.setHeader("X-Quality-Degraded", "1");
      console.error(
        `[server] /api/download still degraded job=${jobId} requested=${quality} delivered=${delivered.height ?? "?"} available=${availableHeights.join(",") || "unknown"} format=${chosenFormat || "?"} auth=${cookieMode}`,
      );
    }
    console.log(
      `[server] /api/download built job=${jobId} requested=${quality} delivered=${delivered.height ?? "?"} format=${chosenFormat || "?"} auth=${cookieMode} segments=${segCount}${joinMethod ? ` join=${joinMethod}` : ""}`,
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "X-Delivered-Height, X-Delivered-Audio-Kbps, X-Selected-Format, X-Available-Heights, X-Auth-Mode, X-Quality-Degraded, X-Segments, X-Join-Method, X-Quality-Cause, X-Quality-Message, X-Quality-Action",
    );


    // The clip is built: from here on it is a transfer, not a build.
    job.building = false;
    const stat = fs.statSync(outputPath);
    publishProgress(jobId, {
      phase: "processing",
      percent: 99,
      message: STAGE_WRITING,
      stage: STAGE_WRITING,
    });

    // Desktop app: hand back the location, not the media. Sending a clip as
    // an HTTP body means the UI buffers the whole file, converts it to an
    // ArrayBuffer and copies it across IPC to be written — several complete
    // copies of a file that can run to hundreds of megabytes, purely to move
    // it between two processes on the same machine. The main process opens
    // the file directly instead. `tempDir` is deliberately NOT cleaned up
    // here; whoever moves the file removes it (and startup sweeps orphans).
    if (deliver === "path") {
      console.log(
        `[server] /api/download handing off job=${jobId} bytes=${stat.size}`,
      );
      publishProgress(jobId, {
        phase: "done",
        percent: 100,
        ...(lowQuality ? { message: lowQuality.error } : {}),
      });
      // The clip's only copy is in clipDir until the main process moves it, so
      // Clear cache must leave it alone for a while after this response.
      holdFolder(clipDir);
      releaseWork(true);
      return res.json({
        path: outputPath,
        size: stat.size,
        segments: segCount,
        ...(joinMethod ? { joinMethod } : {}),
        ...(lowQuality
          ? {
              warning: {
                code: lowQuality.code,
                cause: lowQuality.cause,
                action: lowQuality.action,
                preserved: lowQuality.preserved,
                error: lowQuality.error,
              },
            }
          : {}),
      });
    }

    const name = `clip.${ext}`;
    res.setHeader("Content-Type", isAudio ? "audio/mpeg" : "video/mp4");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    console.log(
      `[server] /api/download sending job=${jobId} bytes=${stat.size}`,
    );

    // The clip is finished at this point; everything below is the transfer.
    // It used to be untraced: a connection that broke mid-body left no log
    // line at all, and an 'error' on the response with no listener is an
    // unhandled stream error in-process. A client that sees "failed to fetch"
    // after a completed download is exactly this window, so it is now
    // reported with the byte count that got through.
    const stream = fs.createReadStream(outputPath);
    let sent = 0;
    let settled = false;
    const settle = (why: string, err?: unknown) => {
      if (settled) return;
      settled = true;
      const ok = sent === stat.size && res.writableEnded;
      if (ok) {
        console.log(
          `[server] /api/download sent job=${jobId} bytes=${sent}`,
        );
        publishProgress(jobId, { phase: "done", percent: 100 });
      } else {
        const detail = err instanceof Error ? `: ${err.message}` : "";
        console.error(
          `[server] /api/download transfer failed job=${jobId} ${why} sent=${sent}/${stat.size}${detail}`,
        );
        publishProgress(jobId, {
          phase: "error",
          percent: 0,
          message: `The clip was built but only ${sent} of ${stat.size} bytes reached the app (${why}).`,
        });
      }
      stream.destroy();
      // Only a completed transfer clears the work folder; a broken one keeps
      // the finished clip (held, so Clear cache leaves it for a while).
      if (ok) cleanup();
      else {
        holdFolder(clipDir);
        releaseWork(true);
      }
    };


    stream.on("data", (chunk) => {
      sent += chunk.length;
    });
    stream.on("error", (err) => settle("read error", err));
    res.on("error", (err) => settle("response error", err));
    res.on("close", () => settle("connection closed early"));
    stream.pipe(res);
  } catch (e) {
    // What is on disk now is what a retry resumes from. Measure it before the
    // work folder is pruned down to exactly that: partial downloads stay,
    // finished segment files, the concat list and half-written joins go.
    const partial = partialBytes(tempDir);
    pruneWorkDir(tempDir);
    releaseWork(false);
    if (job.cancelled || e instanceof CancelledError) return sendCancelled();
    if (cookiesFromBrowser && isCookieError(e)) {
      const msg = cookieErrorMessage(cookiesFromBrowser);
      publishProgress(jobId, { phase: "error", percent: 0, message: msg });
      return res.status(400).json({
        error: msg,
        diagnostics: buildRunDiagnostics(jobId, fullErrMessage(e)),
      });
    }
    logYtError("/api/download", url, options, e);

    const raw = fullErrMessage(e);
    console.error(`[server] /api/download failed job=${jobId}: ${raw.slice(0, 400)}`);
    // The per-run record for Copy diagnostics: this run's stderr and job id,
    // never the whole log. A failure that never reached a child process still
    // carries what the error itself said.
    const diagnostics = buildRunDiagnostics(jobId, runStderrRaw || raw);
    // Keep the friendly sentence but append the real yt-dlp stderr tail so the
    // next YouTube-side change is diagnosable straight from the UI.
    const tail = ((e as { tail?: string } | null)?.tail || raw || "").trim();
    let failure: ClipFailure;
    if ((e as { joinFailed?: boolean } | null)?.joinFailed) {
      failure = joinFailure(tail);
    } else {
      const ctx = { percent: lastReported, partialBytes: partial };
      failure = classifyFailure(raw, ctx);
      if (failure.code === "disk_full") {
        let freeMb: number | undefined;
        try {
          const st = fs.statfsSync(os.tmpdir());
          freeMb = Math.floor((st.bavail * st.bsize) / (1024 * 1024));
        } catch {
          /* statfs unavailable: say it without the numbers */
        }
        failure = classifyFailure(raw, {
          ...ctx,
          freeMb,
          neededMb: estimateNeededMb(totalSec, quality, isAudio, segCount),
        });
      } else if (failure.code === "unknown" && isForbidden(e)) {
        failure = refusedFailure(tail);
      }
    }
    publishProgress(jobId, {
      phase: "error",
      percent: 0,
      message: failure.error,
    });
    sendFailure(res, failure, { diagnostics });
  }
}
