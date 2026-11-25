/**
 * File: redact.test.ts
 * Path: src/common/utils/redact.test.ts
 * Description: F-6 — redact() scrubs the log before "Copy log" puts it on the
 * clipboard. Main and renderer share this one copy, so no drift guard is needed.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { redact } from "./redact";

const S = "SYNTH";
const LOG = [
  `.youtube.com\tTRUE\t/\tTRUE\t1893456000\tSID\t${S}sidvalue12345`,
  `Authorization: Bearer ${S}bearer12345678`,
  `request access_token=${S}access123456 done`,
  `GET https://rr1.googlevideo.com/videoplayback?id=1&sig=${S}sig123456&expire=1`,
  `user someone.synth@example.com signed in`,
  `wrote /root/clips/campaign-x/out.mp4`,
  `Cookie: SID=${S}cookie123456`,
  `--cookies /root/.config/app/yt-cookies.txt`,
  `po_token=${S}po123456`,
  `plain harmless line: update available 1.2.3`,
].join("\n");

test("none of the nine planted markers survive", () => {
  const out = redact(LOG, { homeDir: "/root" });
  for (const re of [/SYNTHsid/, /SYNTHbearer/, /SYNTHaccess/, /SYNTHsig/, /someone\.synth@/, /\/root\//, /SYNTHcookie/, /yt-cookies\.txt/, /SYNTHpo/]) {
    assert.doesNotMatch(out, re);
  }
  assert.match(out, /plain harmless line: update available 1\.2\.3/);
});

// AF2-11 / AF2-1: shapes both copies used to let through (so the drift guard could not see them).
const MORE = [
  "GET https://rr3.googlevideo.com/videoplayback/expire/1/id/o-SYNTHpathid99/sig/SYNTHpathsig99/file/video.mp4",
  `{"access_token": "SYNTHjsontok99", "refresh_token":'SYNTHjsonref99'}`,
  "yt-dlp sent __Secure-3PAPISID=SYNTHbarecookie99 and SID=SYNTHbaresid99; done",
  "binDir=/home/synthuser/app and write to /root",
].join("\n");

test("path-style signed URLs, JSON-quoted tokens and bare cookie assignments are removed", () => {
  const out = redact(MORE, { homeDir: "/home/synthuser" });
  for (const re of [/SYNTHpathid/, /SYNTHpathsig/, /SYNTHjsontok/, /SYNTHjsonref/, /SYNTHbarecookie/, /SYNTHbaresid/, /synthuser/]) {
    assert.doesNotMatch(out, re);
  }
  assert.match(out, /\/file\/video\.mp4/);
});

// ---- E-10: shapes the first pass missed -------------------------------------------------------

test("E-10: a surname after a space, a JSON-style session cookie, a visitor header, a non-ASCII email and a LAN address are all removed", () => {
  const out = (s: string) => redact(s, { homeDir: null });
  assert.doesNotMatch(out("failed to open C:\\Users\\Jane Doe\\Videos\\clip.mp4"), /Jane|Doe/);
  assert.doesNotMatch(out("ERROR: /Users/Jane Doe/Movies/Clipr/a.mp4 not found"), /Jane|Doe/);
  assert.doesNotMatch(out("cannot write /home/jane doe/clips/a.mp4"), /jane|doe/);
  assert.doesNotMatch(out("C:\\Users\\jane>yt-dlp"), /jane/);
  assert.doesNotMatch(out('{"SAPISID":"abcdef/xyz123","other":1}'), /abcdef/);
  assert.doesNotMatch(out("x-goog-visitor-id: CgtabcDEF123"), /CgtabcDEF123/);
  assert.doesNotMatch(out("contact jáne@exämple.com now"), /jáne|exämple/);
  assert.doesNotMatch(out("proxy 192.168.1.20:8080 and 10.0.0.5"), /192\.168\.1\.20|10\.0\.0\.5/);
  // Ordinary lines stay readable.
  assert.match(out("engine on http://127.0.0.1:5174/ ok, version 2026.11.23"), /127\.0\.0\.1:5174.*2026\.11\.23/);
});
