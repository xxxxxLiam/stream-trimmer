/**
 * My own planted secrets for run 2 (none reused from run 1 / T8 / T2).
 * `needle` is what must NOT survive redaction; `shape` is the only thing a
 * report may print.
 */
const MARKERS = [
  { id: "cookieRow", needle: "R2MKcookierow7f3a1",
    line: ".youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tR2MKcookierow7f3a1" },
  { id: "cookieHeader", needle: "R2MKcookiehdr9b22",
    line: "[debug] Cookie: SID=R2MKcookiehdr9b22; __Secure-3PSID=R2MKsecure3psid4c81" },
  { id: "secure3psidStandalone", needle: "R2MKstandalone6d17",
    line: "[debug] jar entry __Secure-3PAPISID=R2MKstandalone6d17 for .youtube.com" },
  { id: "bearerHeader", needle: "R2MKbearer2e55",
    line: "[debug] Authorization: Bearer ya29.R2MKbearer2e55QQQQQQQQQQQQ" },
  { id: "bearerBare", needle: "R2MKbarebearer8812",
    line: "retrying with Bearer ya29.R2MKbarebearer8812ZZZZ" },
  { id: "accessToken", needle: "R2MKaccesstok5a90",
    line: "[debug] access_token=R2MKaccesstok5a90 expires_in=3599" },
  { id: "accessTokenJson", needle: "R2MKjsontok3f44",
    line: '[debug] oauth response {"access_token": "R2MKjsontok3f44", "scope": "youtube"}' },
  { id: "poToken", needle: "R2MKpotoken1c08",
    line: "[debug] po_token=R2MKpotoken1c08 visitor_data=R2MKvisitor2277" },
  { id: "signedUrlQuery", needle: "R2MKstreamid5522",
    line: "[debug] https://rr5---sn-9x9k.googlevideo.com/videoplayback?expire=1&ei=R2MKei7711&id=o-R2MKstreamid5522&sig=R2MKsig9090&pot=R2MKpot4411" },
  { id: "signedUrlPath", needle: "R2MKpathsig7788",
    line: "[debug] https://rr5---sn-9x9k.googlevideo.com/videoplayback/expire/1/id/o-R2MKpathid3366/sig/R2MKpathsig7788/file/video.mp4" },
  { id: "email", needle: "r2.marker+clipper@example.org",
    line: "[debug] signed in as r2.marker+clipper@example.org" },
  { id: "homeRoot", needle: "/root/", line: "unable to write to /root/Videos/R2MKFOLDER/out.mp4" },
  { id: "homeUser", needle: "/home/user", line: "ERROR: ffmpeg could not open /home/user/Videos/R2MKUSERFOLDER/out.mp4" },
  { id: "cookiesFlag", needle: "R2MKjarname", line: "[debug] command-line: --cookies /root/.config/clipper/R2MKjarname.txt" },
  { id: "cookiesPathPlain", needle: "R2MKcookiefile",
    line: "[debug] reading cookies from /home/user/.config/clipper/R2MKcookiefile.txt" },
];

/** The engine stderr the stub will emit. */
function corpus() {
  return [
    "[debug] yt-dlp version 2099.12.31",
    ...MARKERS.map((m) => m.line),
    "ERROR: Postprocessing: ffmpeg exited with code 234",
  ].join("\n");
}

/** Which markers survived `text`. Returns ids plus a SHAPE, never the value. */
function leaks(text) {
  const out = [];
  for (const m of MARKERS) {
    const i = text.indexOf(m.needle);
    if (i >= 0) {
      const before = text.slice(Math.max(0, i - 14), i).replace(/\n/g, "\\n");
      out.push({
        id: m.id,
        shape: `…${before}${m.needle.slice(0, 4)}…REDACTED(${m.needle.length} chars)`,
      });
    }
  }
  return out;
}

module.exports = { MARKERS, corpus, leaks };
