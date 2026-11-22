/**
 * File: ChannelExportPanel.test.tsx
 * Description: Item 8 (same omission as F-7) — the export's failure line is redacted. Nine planted
 *   marker secrets; none may reach the rendered markup. Secrets are synthetic.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExportErrorAlert } from "./ChannelExportPanel";

// Nine markers, in the shapes the audit planted. `needle` is the part that must never appear.
const MARKERS: Record<string, { line: string; needle: string }> = {
  cookieHeader: { line: "Cookie: SID=SECRETsid123; HSID=SECREThsid456", needle: "SECRETsid123" },
  cookieRow: { line: ".youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tSECRETsidrowvalue999", needle: "SECRETsidrowvalue999" },
  bearer: { line: "Authorization: Bearer SECRETbearertoken_abcdefghijklmnop", needle: "SECRETbearertoken" },
  accessToken: { line: "access_token=SECRETaccesstoken_qrstuvwx", needle: "SECRETaccesstoken" },
  poToken: { line: "po_token=SECRETpotoken_0123456789", needle: "SECRETpotoken" },
  streamId: {
    line: "https://rr3---sn-abc.googlevideo.com/videoplayback?expire=1&ip=203.0.113.9&id=o-SECRETSTREAMID&sig=SECRETSIGVALUE&n=SECRETNPARAM",
    needle: "SECRETSTREAMID",
  },
  email: { line: "user sam.clipper@example.com", needle: "sam.clipper@example.com" },
  homePath: { line: "writing /root/Videos/clips/out.mp4", needle: "/root" },
  cookiePath: { line: "--cookies /root/.config/youtube-clipper/yt-cookies.txt", needle: "yt-cookies.txt" },
};
const STDERR = [
  "YouTube refused the media request for this video:",
  ...Object.values(MARKERS).map((m) => m.line),
  "ERROR: Postprocessing: ffmpeg exited with code 234",
].join("\n");

const leaked = (text: string) => Object.entries(MARKERS).filter(([, m]) => text.includes(m.needle)).map(([k]) => k);

test("the planted fixture really contains all nine markers raw", () => {
  assert.equal(leaked(STDERR).length, 9);
});

test("the export failure alert shows 0 of 9 markers and keeps the useful part", () => {
  const html = renderToStaticMarkup(createElement(ExportErrorAlert, { error: STDERR }));
  assert.deepEqual(leaked(html), [], "leaked into the alert");
  assert.match(html, /role="alert"/);
  assert.match(html, /ffmpeg exited with code 234/);
});

test("a plain message passes through unchanged", () => {
  const html = renderToStaticMarkup(createElement(ExportErrorAlert, { error: "That channel has no public videos." }));
  assert.match(html, /That channel has no public videos\./);
});

test("the panel renders its error only through that alert, never raw", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./ChannelExportPanel.tsx", import.meta.url), "utf8");
  assert.match(src, /<ExportErrorAlert error=\{error\} \/>/);
  assert.doesNotMatch(src, /\{error\}\s*<\/div>/);
});
