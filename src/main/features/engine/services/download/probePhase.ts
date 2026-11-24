/**
 * File: probePhase.ts
 * Path: src/main/features/engine/services/download/probePhase.ts
 * Description: Re-probes the video: refuses an out point past its end and records which heights YouTube offers.
 */
import { STAGE_FOUND, classifyFailure, outPointFailure } from "../segments";
import { yt } from "../binaries";
import { withRunCookies } from "../cookies";
import { CancelledError } from "../downloadJobs";
import { publishProgress } from "../progressChannel";
import { cookieErrorMessage, fullErrMessage, isCookieError, logYtError, sendFailure } from "../../utils/errors";
import { audioTracksOf, resolveAudioLanguage } from "../../utils/audioTracks";
import { DownloadCtx } from "./jobContext";

/** Resolves true when the response has been sent and the run must stop. */
export async function probeSource(ctx: DownloadCtx): Promise<boolean> {
  const { res, url, cookiesFromBrowser, lastEnd, cookieOptions, cookieMode, jobId, job, diag, throwIfCancelled, ytOpts, sendCancelled } = ctx;
  // Re-probe duration so the cap can't be bypassed by a crafted request.
  // Doubles as the source of truth for which heights YouTube actually offers.
  const probeWith = (opts: Record<string, unknown>) => ({
    dumpSingleJson: true,
    noWarnings: true,
    noPlaylist: true,
    ...opts,
  });
  ctx.probeOptions = probeWith(cookieOptions);
  const runProbe = (opts: Record<string, unknown>) =>
    withRunCookies(cookieMode, opts, false, (c) => {
      const withCookies = probeWith(c);
      ctx.probeOptions = withCookies;
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
      sendFailure(
        res,
        f,
        diag(`${f.cause} (requested out point ${lastEnd}s, video ${info.duration}s)`),
      );
      return true;
    }
    ctx.availableHeights = Array.from(
      new Set(
        (Array.isArray(info.formats) ? info.formats : [])
          .map((f: { height?: number | null }) => Number(f?.height) || 0)
          .filter((h: number) => h > 0),
      ),
    ).sort((a, b) => (b as number) - (a as number)) as number[];
    const resolved = resolveAudioLanguage(ctx.audioLanguage, audioTracksOf(info));
    ctx.audioLanguageUsed = resolved.language;
    ctx.audioFellBack = resolved.fellBack;
    console.log(
      `[server] /api/download available heights=${ctx.availableHeights.join(",") || "unknown"}`,
    );
  } catch (e) {
    if (job.cancelled || e instanceof CancelledError) { sendCancelled(); return true; }
    if (cookiesFromBrowser && isCookieError(e)) {
      res.status(400).json({
        error: cookieErrorMessage(cookiesFromBrowser),
        ...diag(fullErrMessage(e)),
      });
      return true;
    }
    logYtError("/api/download probe", url, ctx.probeOptions, e);
    const raw = fullErrMessage(e);
    sendFailure(res, classifyFailure(raw), diag(raw));
    return true;
  }
  publishProgress(jobId, {
    phase: "downloading",
    percent: 0,
    message: STAGE_FOUND,
  });
  return false;
}
