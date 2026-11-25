/**
 * File: crashFallback.test.ts
 * Path: src/main/modules/windows/crashFallback.test.ts
 * Description: E2-2. A second page crash within a minute shows a static fallback page with a way out, never a
 *   blank window; the page has no script, and its links only do the three things they name.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { crashFallbackHtml, crashFallbackUrl, fallbackAction, isFallbackUrl } from "./crashFallback";
import { createFallbackController } from "./crashFallbackActions";
import { createCrashRecovery, RELOAD_WINDOW_MS } from "./crashRecovery";

test("E2-2: the first crash reloads on the crash screen, a second inside 60 s shows the fallback, a later one reloads again", () => {
  let t = 1_000_000;
  const r = createCrashRecovery(() => t);
  assert.equal(r.onGone("crashed"), "reload");
  t += 5_000;
  assert.equal(r.onGone("oom"), "fallback");
  t += 5_000;
  assert.equal(r.onGone("crashed"), "fallback", "still inside the minute of the last reload");
  t += RELOAD_WINDOW_MS;
  assert.equal(r.onGone("crashed"), "reload");
  assert.equal(r.onGone("clean-exit"), "leave", "a deliberate close is left alone");
});

test("E2-2: the fallback page has the way out, no script, and a locked-down policy", () => {
  const html = crashFallbackHtml();
  assert.match(html, /Clipr hit a problem/);
  for (const a of ["reopen", "send", "copy"]) assert.match(html, new RegExp(`href="clipr-action:${a}"`));
  assert.doesNotMatch(html, /<script|onclick|javascript:/i);
  assert.match(html, /Content-Security-Policy[^>]*default-src 'none'/);
  assert.doesNotMatch(html, /Error:|at .*\(.*:\d+/, "no error text on screen");
  assert.ok(isFallbackUrl(crashFallbackUrl()));
  assert.equal(decodeURIComponent(crashFallbackUrl().split(",").slice(1).join(",")), html);
});

test("E2-2: after Send the page says so and offers Send once; Copy shows Copied", () => {
  assert.match(crashFallbackHtml({ sent: "sent" }), /Sent\. Thank you\./);
  assert.match(crashFallbackHtml({ sent: "kept" }), /Saved\. Clipr will send it when it can\./);
  assert.doesNotMatch(crashFallbackHtml({ sent: "kept" }), /clipr-action:send/);
  assert.match(crashFallbackHtml({ copied: true }), /Copied/);
});

test("E2-2: only the three named actions are obeyed", () => {
  assert.equal(fallbackAction("clipr-action:reopen"), "reopen");
  assert.equal(fallbackAction("clipr-action://send"), "send");
  assert.equal(fallbackAction("clipr-action:copy"), "copy");
  for (const bad of ["clipr-action:quit", "clipr-action:", "clipr-action:reopen2", "https://evil.example/clipr-action:reopen", "file:///etc/passwd", ""]) {
    assert.equal(fallbackAction(bad), null, bad);
  }
});

test("E2-2: Reopen loads the app, Send queues one report and redraws the page, Copy puts the details on the clipboard", async () => {
  const loaded: string[] = [];
  let sends = 0;
  let copies = 0;
  const c = createFallbackController({
    appUrl: "http://127.0.0.1:5174/",
    load: (u) => loaded.push(u),
    send: async () => (++sends, "kept"),
    copy: () => void (++copies),
  });
  await c.run("send");
  await c.run("send");
  assert.equal(sends, 1, "pressing Send twice sends once");
  assert.match(decodeURIComponent(loaded[0]), /Saved\. Clipr will send it/);
  await c.run("copy");
  assert.equal(copies, 1);
  assert.match(decodeURIComponent(loaded[loaded.length - 1]), /Copied/);
  await c.run("reopen");
  assert.equal(loaded[loaded.length - 1], "http://127.0.0.1:5174/");
  const failing = createFallbackController({ appUrl: "x", load: () => undefined, send: async () => { throw new Error("relay"); }, copy: () => { throw new Error("clip"); } });
  await failing.run("send");
  await failing.run("copy");
  assert.equal(failing.state().sent, "kept", "a failing send is kept, never thrown");
});

test("E2-2: the window wiring answers the fallback's links only from the fallback page", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./windows.ts", import.meta.url), "utf8");
  assert.match(src, /isFallbackUrl\(mainWindow\.webContents\.getURL\(\)\)/);
  assert.match(src, /pageAfterDeath\(recovery,/);
  assert.match(src, /fallback\.reset\(\);\s*return crashFallbackUrl\(\)/);
});
