/**
 * File: cookieFile.test.ts
 * Path: src/main/features/youtube/services/cookieFile.test.ts
 * Description: One sample file per approved reason a cookies.txt is refused. Sample files only,
 * no real cookies.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { checkCookiesFile } from "./cookieFile";

const NOW = Date.parse("2026-11-24T12:00:00Z");
const FUTURE = String(Math.floor(NOW / 1000) + 86400 * 100);
const PAST = String(Math.floor(NOW / 1000) - 86400);
const row = (domain: string, name: string, value: string, expiry = FUTURE) =>
  [domain, "TRUE", "/", "TRUE", expiry, name, value].join("\t");
const HEADER = "# Netscape HTTP Cookie File";

test("a real youtube.com export is accepted", () => {
  const res = checkCookiesFile([HEADER, row(".youtube.com", "__Secure-3PSID", "a"), row(".google.com", "SID", "b")].join("\n"), NOW);
  assert.deepEqual(res, { ok: true, count: 2 });
});

test("HttpOnly-prefixed rows and session cookies (no date) count", () => {
  const text = ["#HttpOnly_.youtube.com", "TRUE", "/", "TRUE", "0", "__Secure-1PSID", "v"].join("\t");
  assert.equal(checkCookiesFile(text, NOW).ok, true);
});

test("not a cookies file: empty, JSON, CSV, comment-only, null", () => {
  for (const text of ["", "   \n# only a comment", '[{"name":"SID"}]', "just,a,csv\nof,other,stuff", null]) {
    const res = checkCookiesFile(text, NOW);
    assert.equal(res.ok, false);
    assert.equal(!res.ok && res.reason, "not-a-cookies-file", String(text));
  }
});

test("made on google.com, not youtube.com", () => {
  const res = checkCookiesFile(row(".google.com", "SID", "x"), NOW);
  assert.equal(!res.ok && res.reason, "wrong-site");
  // Some other site entirely, and look-alike domains, are the same reason.
  assert.equal(!checkCookiesFile(row(".example.com", "SID", "x"), NOW).ok, true);
  assert.equal(!checkCookiesFile(row("notyoutube.com", "SID", "x"), NOW).ok, true);
});

test("signed out when exported: youtube cookies, no sign-in (or an empty one)", () => {
  const visitor = [row(".youtube.com", "VISITOR_INFO1_LIVE", "x"), row(".youtube.com", "PREF", "y")].join("\n");
  assert.equal((checkCookiesFile(visitor, NOW) as any).reason, "signed-out");
  // An auth cookie with no value (the tab is trimmed away with the line) is no sign-in either.
  const emptied = [row(".youtube.com", "PREF", "y"), row(".youtube.com", "SID", "")].join("\n");
  assert.equal((checkCookiesFile(emptied, NOW) as any).reason, "signed-out");
});

test("session ended: the sign-in cookies are all past their date", () => {
  const res = checkCookiesFile([row(".youtube.com", "SID", "x", PAST), row(".youtube.com", "__Secure-1PSID", "y", PAST)].join("\n"), NOW);
  assert.equal(!res.ok && res.reason, "session-ended");
  // One live sign-in cookie among dead ones is still a session.
  assert.equal(checkCookiesFile([row(".youtube.com", "SID", "x", PAST), row(".youtube.com", "__Secure-1PSID", "y")].join("\n"), NOW).ok, true);
});

test("every refusal carries one message and one fix sentence", () => {
  const res = checkCookiesFile(row(".google.com", "SID", "x"), NOW);
  assert.ok(!res.ok && res.message.endsWith(".") && res.fix.endsWith("."));
});

// ---- A-13: the picker path and the refusal that names the real site -----------------------------

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MAX_COOKIE_BYTES, readCookieFile } from "./cookieFile";

test("a wrong-site refusal names the file's real site, not google.com", () => {
  const facebook = checkCookiesFile([row(".facebook.com", "c_user", "1"), row(".facebook.com", "xs", "2"), row(".example.org", "a", "b")].join("\n"), NOW);
  assert.equal(facebook.ok, false);
  assert.equal(facebook.ok === false && facebook.reason, "wrong-site");
  assert.equal(facebook.ok === false && facebook.message, "That file was made on facebook.com, not youtube.com.");
  const lookalike = checkCookiesFile(row(".notyoutube.com", "SID", "x"), NOW);
  assert.equal(lookalike.ok === false && lookalike.message, "That file was made on notyoutube.com, not youtube.com.");
  const strange = checkCookiesFile(row("<script>x</script>", "SID", "x"), NOW);
  assert.equal(strange.ok === false && strange.message, "That file was made on another site, not youtube.com.");
});

test("the picker path: a folder, a missing file and a file over the cap each get a plain sentence, with no system text", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ck-"));
  const logged: string[] = [];
  const refusal = async (p: unknown) => {
    const r = await readCookieFile(p, (m) => logged.push(m));
    assert.equal(r.ok, false);
    return r.ok ? "" : r.refusal.message;
  };
  assert.equal(await refusal(dir), "That is a folder, not a cookies file.");
  assert.equal(await refusal(path.join(dir, "gone.txt")), "That file is gone.");
  assert.equal(await refusal(undefined), "No file was chosen.");
  const big = path.join(dir, "big.txt");
  fs.writeFileSync(big, Buffer.alloc(MAX_COOKIE_BYTES + 1, 97));
  assert.equal(await refusal(big), "That file is too big to be a cookies file.");
  for (const m of [await refusal(dir), await refusal(path.join(dir, "gone.txt"))]) assert.doesNotMatch(m, /ENOENT|EISDIR|\/tmp|illegal operation/);
  assert.ok(logged.some((l) => /ENOENT/.test(l)), "the system's own error is in the log");
  const fine = path.join(dir, "ok.txt");
  fs.writeFileSync(fine, "hello");
  assert.deepEqual(await readCookieFile(fine), { ok: true, text: "hello" });
});
