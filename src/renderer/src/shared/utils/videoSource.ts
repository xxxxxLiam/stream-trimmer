/**
 * File: videoSource.ts
 * Path: src/renderer/src/shared/utils/videoSource.ts
 * Description: Links from sites other than YouTube (Twitch VODs and clips, Kick VODs and clips). Each gets a
 *   namespaced video id ("twitch:123", "twitchclip:Slug", "kick:<uuid>", "kickclip:<channel>~<id>") so it
 *   can sit beside YouTube ids everywhere an id is used, and a canonical link to give the engine and the
 *   "open on site" buttons. YouTube ids stay bare.
 */
export type StreamSite = "twitch" | "kick";

const PREFIXES: Record<string, StreamSite> = { twitch: "twitch", twitchclip: "twitch", kick: "kick", kickclip: "kick" };

const SAFE = /^[A-Za-z0-9_-]+$/;

function asUrl(text: string): URL | null {
  const t = text.trim().split(/\s+/)[0] ?? "";
  if (!t) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
}

/** The namespaced id of a Twitch or Kick video or clip link, or null (YouTube and everything else give null). */
export function streamVideoId(raw: string): string | null {
  const u = asUrl(raw);
  if (!u || (u.protocol !== "http:" && u.protocol !== "https:")) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "twitch.tv") {
    if (parts[0] === "videos" && /^\d+$/.test(parts[1] ?? "")) return `twitch:${parts[1]}`;
    if (parts.length >= 3 && parts[1] === "clip" && SAFE.test(parts[2])) return `twitchclip:${parts[2]}`;
    return null;
  }
  if (host === "clips.twitch.tv") {
    const slug = parts[0] === "embed" ? u.searchParams.get("clip") : parts[0];
    return slug && SAFE.test(slug) ? `twitchclip:${slug}` : null;
  }
  if (host === "kick.com") {
    if (parts[0] === "video" && SAFE.test(parts[1] ?? "")) return `kick:${parts[1]}`;
    if (parts.length >= 3 && parts[1] === "videos" && SAFE.test(parts[2])) return `kick:${parts[2]}`;
    const clip = parts.length >= 3 && parts[1] === "clips" ? parts[2] : u.searchParams.get("clip");
    if (parts.length >= 1 && clip && SAFE.test(parts[0]) && SAFE.test(clip)) return `kickclip:${parts[0]}~${clip}`;
    return null;
  }
  return null;
}

/** Which non-YouTube site a video id belongs to, or null for a YouTube id (or none). */
export function streamSiteOf(videoId: string | null | undefined): StreamSite | null {
  const prefix = (videoId ?? "").split(":", 1)[0];
  return (videoId ?? "").includes(":") ? PREFIXES[prefix] ?? null : null;
}

export const isStreamSource = (videoId: string | null | undefined): boolean => streamSiteOf(videoId) !== null;

export const siteName = (site: StreamSite): string => (site === "twitch" ? "Twitch" : "Kick");

/** The canonical link to a video id on its own site (YouTube for a bare id). */
export function sourceLinkFor(videoId: string): string {
  const [kind, rest] = videoId.includes(":") ? [videoId.slice(0, videoId.indexOf(":")), videoId.slice(videoId.indexOf(":") + 1)] : ["", videoId];
  switch (kind) {
    case "twitch":
      return `https://www.twitch.tv/videos/${rest}`;
    case "twitchclip":
      return `https://clips.twitch.tv/${rest}`;
    case "kick":
      return `https://kick.com/video/${rest}`;
    case "kickclip": {
      const [channel, id] = rest.split("~");
      return `https://kick.com/${channel}/clips/${id}`;
    }
    default:
      return `https://www.youtube.com/watch?v=${videoId}`;
  }
}
