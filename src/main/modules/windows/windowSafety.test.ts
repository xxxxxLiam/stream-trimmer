/**
 * File: windowSafety.test.ts
 * Path: src/main/modules/windows/windowSafety.test.ts
 * Description: E-5, E-6 and the main half of E-2. The window stays on the app's own address, only https (and mailto)
 *   links go to the browser, a dead page is reloaded once with the crashed flag, and the page's content policy
 *   allows what the app uses and nothing wider.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { isAppUrl, isSafeExternalUrl } from "./navigationGuard";
import { createCrashRecovery, crashedUrl } from "./crashRecovery";

const origins = ["http://127.0.0.1:5174"];

test("navigation: the app's own address stays, every foreign address is refused", () => {
  assert.equal(isAppUrl("http://127.0.0.1:5174/", origins), true);
  assert.equal(isAppUrl("http://127.0.0.1:5174/?crashed=1", origins), true);
  for (const bad of [
    "https://evil.example/",
    "http://127.0.0.1:9999/",
    "http://127.0.0.1.evil.example:5174/",
    "http://127.0.0.1:5174@evil.example/",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "not a url",
    "",
  ])
    assert.equal(isAppUrl(bad, origins), false, bad);
});

test("external links: https and mailto go to the browser; smb, file, ms-msdt, http and junk do not", () => {
  assert.equal(isSafeExternalUrl("https://www.youtube.com/watch?v=x"), true);
  assert.equal(isSafeExternalUrl("mailto:help@example.com"), true);
  for (const bad of ["smb://host/share", "ms-msdt:/id", "file:///C:/Windows/System32/calc.exe", "http://example.com", "javascript:1", "vscode://x", "", 5, null, "https://" + "a".repeat(5000)])
    assert.equal(isSafeExternalUrl(bad), false, String(bad).slice(0, 40));
});

test("a dead page is reloaded once, then left alone for a minute; a clean exit is not a crash", () => {
  let t = 1_000_000;
  const r = createCrashRecovery(() => t);
  assert.equal(r.onGone("clean-exit"), "leave");
  assert.equal(r.onGone("crashed"), "reload");
  t += 5_000;
  assert.equal(r.onGone("crashed"), "leave");
  t += 61_000;
  assert.equal(r.onGone("oom"), "reload");
});

test("the reloaded address carries the crashed flag and stays on the app's origin", () => {
  const u = crashedUrl("http://127.0.0.1:5174/");
  assert.equal(u, "http://127.0.0.1:5174/?crashed=1");
  assert.equal(isAppUrl(u, origins), true);
});

test("the page's content policy names the YouTube player and image hosts, and nothing that runs foreign code", () => {
  const html = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../renderer/index.html"), "utf8");
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? "";
  assert.ok(csp, "index.html carries a Content-Security-Policy");
  const dir = (name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";
  assert.match(dir("default-src"), /'self'/);
  assert.match(dir("frame-src"), /https:\/\/www\.youtube\.com/);
  assert.match(dir("script-src"), /https:\/\/www\.youtube\.com/);
  assert.match(dir("img-src"), /https:\/\/img\.youtube\.com/);
  assert.match(dir("img-src"), /ytimg\.com/);
  assert.doesNotMatch(dir("script-src"), /unsafe-inline|unsafe-eval|\*\s|https:\s|http:\s/);
  assert.match(dir("object-src"), /'none'/);
  assert.doesNotMatch(csp, /default-src[^;]*\*/);
});
