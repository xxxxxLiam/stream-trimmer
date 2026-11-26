/**
 * File: youtubeUrl.ts
 * Path: src/main/features/engine/utils/youtubeUrl.ts
 * Description: The strict check that a string is a real YouTube address.
 */


/**
 * True only for a real YouTube address: http(s), no embedded credentials, and a
 * host that IS youtube.com (or a subdomain of it) or youtu.be.
 *
 * The check and its consumer must agree about where the host ends. Node's WHATWG
 * `new URL` and Python's `urlsplit` (yt-dlp's own parser) do not: WHATWG treats
 * `\` like `/`, strips tab/newline, accepts `https:host` with no slashes and
 * IDNA-maps non-ASCII, so `https://www.youtube.com\@evil.example/` is
 * `www.youtube.com` to one and `evil.example` to the other. Rather than
 * normalise, anything the two could read differently is refused: a backslash, a
 * raw or percent-encoded control character, whitespace, a scheme not followed by
 * `//`, and an authority that is not plain ASCII `host[:port]` (which rules out
 * userinfo, brackets, `%`-escapes, non-ASCII and IP-literal tricks in one rule).
 * What is left is then read by BOTH parsers and must give the same host.
 */
export function strictHttpUrl(value: string): { url: URL; host: string } | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  // Control characters, DEL, whitespace, backslash, anything non-ASCII-printable.
  if (/[^\x21-\x7e]/.test(value) || value.includes("\\")) return null;
  // Percent-encoded control characters (%00-%1f, %7f) and an encoded backslash.
  if (/%(?:[01][0-9a-f]|7f|5c)/i.test(value)) return null;
  // The scheme must be followed by exactly `//`, as RFC 3986 requires.
  const m = /^(https?):\/\/([^/?#]*)/i.exec(value);
  if (!m) return null;
  const authority = m[2];
  // Plain `host` or `host:port`: no `@` (userinfo), `[` (IP literal), `%`, ...
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.?(?::\d{1,5})?$/.test(authority)) {
    return null;
  }
  const rawHost = authority.replace(/:\d+$/, "").toLowerCase().replace(/\.$/, "");
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  // Both readings of the host must be the same string, and that string YouTube.
  if (host !== rawHost) return null;
  return { url: u, host };
}

export function isYouTubeUrl(value: string): boolean {
  const parsed = strictHttpUrl(value);
  if (!parsed) return false;
  const { host } = parsed;
  return host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be";
}

// Real ids are 11 characters; only the shape is checked, since what matters is that it names one video.
const VIDEO_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** No port, or the two ordinary web ports stated outright (http's 80, https' 443, either one with either scheme: a
 * real mobile link is sometimes written exactly that mismatched way). Anything else is an odd port nobody serves
 * YouTube from. */
export function isOrdinaryPort(u: URL): boolean {
  return u.port === "" || u.port === "80" || u.port === "443";
}

/**
 * True for the address of one video: a watch link, youtu.be/<id>, or a shorts, live, embed or /v/ link, on
 * no port or one of the two ordinary web ports. A channel, a playlist page, a search, a bare host or an odd
 * port is a YouTube address but not a video, and yt-dlp would go and enumerate it.
 */
export function isYouTubeVideoUrl(value: string): boolean {
  if (!isYouTubeUrl(value)) return false;
  const u = new URL(value);
  if (!isOrdinaryPort(u)) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  const segs = u.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") return segs.length >= 1 && VIDEO_ID.test(segs[0]);
  if (u.pathname === "/watch") return VIDEO_ID.test(u.searchParams.get("v") ?? "");
  return segs.length >= 2 && ["shorts", "live", "embed", "v", "e"].includes(segs[0]) && VIDEO_ID.test(segs[1]);
}
