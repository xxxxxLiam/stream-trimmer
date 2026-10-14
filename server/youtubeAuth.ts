/**
 * File: youtubeAuth.ts
 * Path: server/youtubeAuth.ts
 * Description: Classifies sanitized yt-dlp browser-cookie authentication diagnostics.
 */

export type YouTubeAuthProbeStatus =
  | "signed_in"
  | "signed_out"
  // The probe video itself could not be played — says nothing about cookies.
  | "probe_unavailable"
  | "profile_missing"
  | "locked"
  | "decrypt_failed"
  // YouTube is throttling this IP. The session is fine; the answer is to wait.
  | "rate_limited"
  | "timeout"
  // yt-dlp said nothing the classifier recognizes — not a verdict either way.
  | "inconclusive"
  | "extractor_error";

// More than one, because the probe proves a sign-in by fetching a video and
// any single video can be pulled, made private or blocked in a country. When
// that happens the fetch fails for a reason that has nothing to do with the
// user's cookies, so the probe moves to the next one rather than calling a
// perfectly good session signed-out.
//
// yt-dlp's own test video (BaW_jenozKc) used to lead this list and is now
// permanently dead — "This video is unavailable" on every run. A dead target
// is not merely useless: it burned ~10s of yt-dlp startup and network time
// before every single download and always needed a retry. Pick targets that
// have survived a decade and are not single-label music uploads, which are the
// ones that get geo-blocked.
export const AUTH_PROBE_URLS = [
  "https://www.youtube.com/watch?v=jNQXAC9IVRw", // "Me at the zoo" — the oldest video on the site, April 2005
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ", // "Never Gonna Give You Up" — the most-linked video there is
  "https://www.youtube.com/watch?v=9bZkp7q19f0", // "Gangnam Style" — first video to a billion views
] as const;

/**
 * True when the failure is about the video the probe happened to ask for,
 * not about the session.
 *
 * The probe proves a sign-in by fetching one video. If that video is pulled,
 * made private or blocked in the user's country, the fetch fails for a reason
 * that has nothing to do with their cookies — and reporting that as
 * "signed out" sends them to fix something that was never broken. A Windows
 * report showed exactly this: every browser came back signed_out behind
 * "This video is unavailable".
 */
export function isProbeTargetUnusable(output: string): boolean {
  const text = output.toLowerCase();
  return (
    text.includes("video is unavailable") ||
    text.includes("video unavailable") ||
    text.includes("private video") ||
    text.includes("has been removed") ||
    text.includes("is not available in your country") ||
    text.includes("playability status: error")
  );
}

/**
 * True when YouTube is throttling the IP rather than refusing the account.
 *
 * "Sign in to confirm you're not a bot" reads like a sign-out but is not one:
 * it arrives alongside HTTP 429 on sessions whose cookies are provably good,
 * and signing in again does nothing for it. Telling the user to re-authenticate
 * here sends them round a loop that cannot end; the only thing that helps is
 * waiting, so this has to be its own answer. Checked ahead of signed_out
 * because that phrase literally contains "sign in".
 */
export function isRateLimited(output: string): boolean {
  const text = output.toLowerCase();
  return (
    text.includes("http error 429") ||
    text.includes("too many requests") ||
    text.includes("confirm you're not a bot") ||
    text.includes("confirm you are not a bot") ||
    text.includes("confirm youre not a bot")
  );
}

/**
 * True when yt-dlp actually reported a failure, as opposed to saying nothing
 * the classifier understands.
 *
 * Only a line yt-dlp itself prefixed "ERROR:" (or one of its own extraction
 * failures) counts. Substring-matching the bare word would catch the verbose
 * preamble, which says "error utf-8 (No ANSI)" on every single run.
 */
function hasExtractorError(output: string): boolean {
  const text = output.toLowerCase();
  return (
    /^\s*error:/im.test(output) ||
    text.includes("unable to extract") ||
    text.includes("unable to download webpage") ||
    text.includes("unsupported url")
  );
}

export function classifyYouTubeAuthOutput(
  output: string,
): Exclude<YouTubeAuthProbeStatus, "timeout"> {
  const text = output.toLowerCase();

  if (
    text.includes("found youtube account cookies") ||
    text.includes("youtube account cookies are present")
  ) {
    return "signed_in";
  }
  if (
    text.includes("database is locked") ||
    text.includes("cookie database is locked") ||
    text.includes("could not copy chrome cookie database") ||
    text.includes("permission denied")
  ) {
    return "locked";
  }
  if (
    text.includes("failed to decrypt") ||
    text.includes("cannot decrypt") ||
    text.includes("could not decrypt") ||
    text.includes("keyring")
  ) {
    return "decrypt_failed";
  }
  if (
    text.includes("could not find") && text.includes("cookies") ||
    text.includes("no such file") && text.includes("cookie") ||
    text.includes("unsupported browser") ||
    text.includes("unsupported platform")
  ) {
    return "profile_missing";
  }
  // Checked before probe_unavailable: a throttled request often comes back as
  // a playability ERROR too, and retrying the next probe video only spends
  // more of the quota that ran out.
  if (isRateLimited(output)) {
    return "rate_limited";
  }
  // Checked before signed_out: a dead probe target is not a missing session.
  if (isProbeTargetUnusable(output)) {
    return "probe_unavailable";
  }
  if (
    text.includes("extracted") && text.includes("cookies") ||
    text.includes("sign in") ||
    text.includes("login")
  ) {
    return "signed_out";
  }
  if (hasExtractorError(output)) {
    return "extractor_error";
  }
  // Output with no marker at all means the probe failed to decide, not that
  // the session is broken. Returning a hard error here is what blocked a macOS
  // user whose imported cookies.txt was valid and who had been downloading at
  // 1080p minutes earlier: yt-dlp simulated the video without complaint and
  // simply never printed "Found YouTube account cookies", so every download
  // was refused on an unfalsifiable verdict. "I could not tell" is the honest
  // answer and callers are free to proceed on it.
  return "inconclusive";
}

/**
 * What a probe verdict should do to a download that needs a session.
 *
 * Only a probe that found something actually wrong with the session may stop
 * a download. A dead probe video, an unreadable verdict or a slow answer say
 * nothing about the user's cookies, and refusing on them is what told a macOS
 * user with a working 1080p session that it was "no longer valid" — so they
 * re-imported cookies.txt over and over, which could never have helped. If
 * the session really is bad, yt-dlp fails seconds later with a real error,
 * and a real error beats a speculative one.
 */
export function authProbeVerdict(
  status: YouTubeAuthProbeStatus,
): "ok" | "blocked" | "rate_limited" {
  if (status === "rate_limited") return "rate_limited";
  // Positive evidence the session itself is the problem.
  if (
    status === "signed_out" ||
    status === "locked" ||
    status === "decrypt_failed" ||
    status === "profile_missing"
  ) {
    return "blocked";
  }
  // signed_in, probe_unavailable, inconclusive, extractor_error, timeout.
  return "ok";
}
