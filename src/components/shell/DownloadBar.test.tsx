/**
 * File: DownloadBar.test.tsx
 * Description: F-7 (the on-screen failure is redacted) and F-8 (Copy diagnostics only beside a
 *   code-level failure), rendered to markup. Secrets are synthetic and are never printed in full.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FailureAlert, displayError } from "./DownloadBar";
import { offersDeveloperDiagnostics } from "../../lib/diagnostics";

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
const failure = (over: Record<string, unknown> = {}) => ({ message: STDERR, code: "unknown", attempt: {}, ...over });

test("F-7: the planted fixture really contains all nine markers raw", () => {
  assert.equal(leaked(STDERR).length, 9);
});

test("F-7: the failure alert shows none of the nine markers, with and without engine diagnostics", () => {
  for (const f of [failure(), failure({ diagnostics: { homeDir: "/root" } })]) {
    const html = renderToStaticMarkup(createElement(FailureAlert, { error: STDERR, failure: f }));
    assert.deepEqual(leaked(html), [], "leaked into the alert");
    assert.match(html, /role="alert"/);
    assert.match(html, /ffmpeg exited with code 234/, "the useful part of the message is kept");
  }
});

test("F-7: displayError is what the status line uses and is redacted too", () => {
  assert.deepEqual(leaked(displayError(STDERR, null)), []);
  assert.equal(displayError("Paste a YouTube link", null), "Paste a YouTube link");
});

test("F-8: Copy diagnostics follows the code, not the mere absence of one", () => {
  const cookie = "Your in-app YouTube sign-in is no longer valid. Sign in again from the YouTube button.";
  const html = (f: ReturnType<typeof failure>) => renderToStaticMarkup(createElement(FailureAlert, { error: f.message, failure: f }));

  // No code, self-explaining message: the user's to fix.
  assert.doesNotMatch(html(failure({ message: cookie, code: undefined })), /Copy diagnostics/);
  // A user-fixable code: the user's to fix.
  assert.doesNotMatch(html(failure({ message: "Disk full", code: "disk_full" })), /Copy diagnostics/);
  // Code-level: unknown, join_failed, and a code from a newer build.
  for (const code of ["unknown", "join_failed", "some_future_code"]) {
    assert.match(html(failure({ message: "It broke", code })), /Copy diagnostics/, code);
  }
  // The renderer's own transfer failure has no engine code and tells the user to copy diagnostics.
  const transfer = "The clip was built, but the transfer from the local engine broke before it finished. Copy the diagnostics for the reason.";
  assert.match(html(failure({ message: transfer, code: undefined })), /Copy diagnostics/);
});

test("F-8: the decision function on its own", () => {
  assert.equal(offersDeveloperDiagnostics(undefined, "Your in-app YouTube sign-in is no longer valid."), false);
  assert.equal(offersDeveloperDiagnostics("", "x"), false);
  assert.equal(offersDeveloperDiagnostics(null, "x"), false);
  assert.equal(offersDeveloperDiagnostics("stale_session"), false);
  assert.equal(offersDeveloperDiagnostics("unknown"), true);
});
