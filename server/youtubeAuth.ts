/**
 * File: youtubeAuth.ts
 * Path: server/youtubeAuth.ts
 * Description: Classifies sanitized yt-dlp browser-cookie authentication diagnostics.
 */

export type YouTubeAuthProbeStatus =
  | "signed_in"
  | "signed_out"
  | "profile_missing"
  | "locked"
  | "decrypt_failed"
  | "timeout"
  | "extractor_error";

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
  if (
    text.includes("extracted") && text.includes("cookies") ||
    text.includes("sign in") ||
    text.includes("login")
  ) {
    return "signed_out";
  }
  return "extractor_error";
}