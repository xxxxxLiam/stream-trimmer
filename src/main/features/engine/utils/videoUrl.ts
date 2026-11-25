/**
 * File: videoUrl.ts
 * Path: src/main/features/engine/utils/videoUrl.ts
 * Description: Which links the engine accepts as one video: YouTube, and the Twitch and Kick VODs and clips. Every host
 *   passes the same strict URL reading as YouTube (see strictHttpUrl), so a crafted address can't point yt-dlp elsewhere.
 */
import { isYouTubeUrl, isYouTubeVideoUrl, strictHttpUrl } from "./youtubeUrl";

const DIGITS = /^\d{1,20}$/;
const SLUG = /^[A-Za-z0-9_-]{1,100}$/;
const CHANNEL = /^[A-Za-z0-9_]{1,40}$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** twitch.tv/videos/<id>, twitch.tv/<channel>/clip/<slug>, clips.twitch.tv/<slug>. */
export function isTwitchVideoUrl(value: string): boolean {
  const parsed = strictHttpUrl(value);
  if (!parsed || parsed.url.port) return false;
  const { host, url } = parsed;
  const segs = url.pathname.split("/").filter(Boolean);
  if (host === "clips.twitch.tv") return segs.length === 1 && SLUG.test(segs[0]);
  if (host !== "twitch.tv" && host !== "www.twitch.tv" && host !== "m.twitch.tv") return false;
  if (segs[0] === "videos") return segs.length === 2 && DIGITS.test(segs[1]);
  return segs.length === 3 && CHANNEL.test(segs[0]) && segs[1] === "clip" && SLUG.test(segs[2]);
}

/** kick.com/<channel>/videos/<uuid>, kick.com/<channel>/clips/<id>, kick.com/video/<uuid>. */
export function isKickVideoUrl(value: string): boolean {
  const parsed = strictHttpUrl(value);
  if (!parsed || parsed.url.port) return false;
  const { host, url } = parsed;
  if (host !== "kick.com" && host !== "www.kick.com") return false;
  const segs = url.pathname.split("/").filter(Boolean);
  if (segs[0] === "video") return segs.length === 2 && UUID.test(segs[1]);
  if (segs.length !== 3 || !CHANNEL.test(segs[0].replace(/-/g, "_"))) return false;
  if (segs[1] === "videos") return UUID.test(segs[2]);
  return segs[1] === "clips" && SLUG.test(segs[2]);
}

/** One video on a host the engine can cut from. */
export function isSupportedVideoUrl(value: string): boolean {
  return isYouTubeVideoUrl(value) || isTwitchVideoUrl(value) || isKickVideoUrl(value);
}

/** YouTube-only machinery (sign-in, player clients, Referer) applies to these links and no others. */
export function isYouTubeLink(value: string): boolean {
  return isYouTubeUrl(value);
}
