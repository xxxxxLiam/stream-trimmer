/**
 * File: sessionPhase.ts
 * Path: src/main/features/engine/services/download/sessionPhase.ts
 * Description: Confirms the signed-in YouTube session before a high-quality run; answers 401/429 itself when it cannot proceed.
 */
import { authProbeVerdict } from "../../utils/youtubeAuth";
import { staleSessionFailure } from "../segments";
import { withRunCookies } from "../cookies";
import { probeYouTubeAuth } from "../youtubeAuthProbe";
import { signIn } from "../../../../shared/utils/signInSignal";
import { DownloadCtx } from "./jobContext";

/** Resolves true when the response has been sent and the run must stop. */
export async function verifySession(ctx: DownloadCtx): Promise<boolean> {
  const { res, format, quality, cookieOptions, cookieMode, job, trackChild, diag, sendCancelled } = ctx;
  const requiresVerifiedSession =
    ctx.isYouTube &&
    format === "mp4" && (quality === "best" || Number(quality) > 360);
  if (requiresVerifiedSession) {
    if (cookieMode === "none") {
      const cause =
        "No YouTube session is connected, and YouTube serves higher formats only to signed-in requests";
      const preserved = "Your marked range is kept.";
      res.status(401).json({
        code: "YOUTUBE_AUTH_REQUIRED",
        error: `${cause}. Connect YouTube. ${preserved}`,
        cause,
        action: { id: "import_cookies", label: "Connect YouTube" },
        preserved,
        ...diag(cause),
      });
      return true;
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
    if (job.cancelled) { sendCancelled(); return true; }
    const verdict = authProbeVerdict(auth.status);
    if (verdict === "rate_limited") {
      res.status(429).json({
        code: "YOUTUBE_RATE_LIMITED",
        error:
          "YouTube is rate-limiting this network. Wait a few minutes and try again — your sign-in is fine, re-importing cookies won't help.",
        reason: auth.reason,
        ...diag(auth.reason ?? "rate limited"),
      });
      return true;
    }
    if (verdict === "blocked") {
      signIn.sessionEnded();
      const f = staleSessionFailure(401, "Your marked range is kept.");
      res.status(401).json({
        code: "YOUTUBE_AUTH_REQUIRED",
        error: f.error,
        cause: f.cause,
        action: f.action,
        preserved: f.preserved,
        reason: auth.reason,
        ...diag(auth.reason ?? f.cause),
      });
      return true;
    }
    if (auth.status !== "signed_in") {
      // Couldn't confirm, but nothing says the session is bad. Proceed and
      // let yt-dlp produce a real error if it genuinely cannot authenticate.
      console.log(
        `[server] /api/download proceeding on an unconfirmed session (${auth.status})`,
      );
    } else {
      ctx.sessionConfirmed = true;
      signIn.sessionConfirmed();
    }
  }
  return false;
}
