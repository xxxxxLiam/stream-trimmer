/**
 * File: redact.test.ts
 * Path: src/main/shared/utils/redact.test.ts
 * Description: F-6 — the main-process copy of redact() scrubs the log before
 * "Copy log" puts it on the clipboard, and stays in step with the renderer's
 * redact() in src/renderer/src/shared/utils/diagnostics.ts (duplicated because main cannot import TS).
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { redact as rendererRedact } from "../../../renderer/src/shared/utils/diagnostics";

const require = createRequire(import.meta.url);
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

test("identical to the renderer's redact() on the planted log (drift guard)", () => {
  for (const homeDir of ["/root", "", "/Users/sam"]) {
    assert.equal(redact(LOG, { homeDir }), rendererRedact(LOG, { homeDir }));
  }
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

test("the new shapes match the renderer's redact() too", () => {
  for (const homeDir of ["/home/synthuser", "", "/Users/sam"]) {
    assert.equal(redact(MORE, { homeDir }), rendererRedact(MORE, { homeDir }));
  }
});
