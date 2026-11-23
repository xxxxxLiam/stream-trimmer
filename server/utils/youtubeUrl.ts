/**
 * File: youtubeUrl.ts
 * Path: server/utils/youtubeUrl.ts
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
export function isYouTubeUrl(value: string): boolean {
  if (typeof value !== "string" || value.length > 4096) return false;
  // Control characters, DEL, whitespace, backslash, anything non-ASCII-printable.
  if (/[^\x21-\x7e]/.test(value) || value.includes("\\")) return false;
  // Percent-encoded control characters (%00-%1f, %7f) and an encoded backslash.
  if (/%(?:[01][0-9a-f]|7f|5c)/i.test(value)) return false;
  // The scheme must be followed by exactly `//`, as RFC 3986 requires.
  const m = /^(https?):\/\/([^/?#]*)/i.exec(value);
  if (!m) return false;
  const authority = m[2];
  // Plain `host` or `host:port`: no `@` (userinfo), `[` (IP literal), `%`, ...
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.?(?::\d{1,5})?$/.test(authority)) {
    return false;
  }
  const rawHost = authority.replace(/:\d+$/, "").toLowerCase().replace(/\.$/, "");
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  // Both readings of the host must be the same string, and that string YouTube.
  if (host !== rawHost) return false;
  return (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be"
  );
}
