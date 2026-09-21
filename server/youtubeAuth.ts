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
  | "timeout"
  | "extractor_error";

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
  return "extractor_error";
}