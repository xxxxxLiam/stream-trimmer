/**
 * File: cookieImportKind.test.ts
 * Path: src/main/features/youtube/services/cookieImportKind.test.ts
 * Description: Pins the stable `kind` keys a refused cookies.txt import returns, which the Help and
 *   start screens map to their own sentences: not_cookies, wrong_site, signed_out and too_old.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { checkCookieImport } from "./cookieFile";

const NOW = Date.UTC(2026, 10, 24) ;
const future = String(Math.floor(NOW / 1000) + 86400 * 30);
const past = String(Math.floor(NOW / 1000) - 86400);
const row = (domain: string, name: string, value: string, expiry = future) =>
  [domain, "TRUE", "/", "TRUE", expiry, name, value].join("\t");
const kind = (text: string) => checkCookieImport(text, NOW)?.kind ?? null;

test("a good export is not refused", () => {
  assert.equal(kind(row(".youtube.com", "__Secure-3PSID", "abc")), null);
  assert.equal(kind(row(".youtube.com", "SID", "abc", "0")), null, "a session cookie has no date and is not old");
});

test("not a cookies file: empty, JSON, or no cookie rows", () => {
  assert.equal(kind(""), "not_cookies");
  assert.equal(kind('[{"name":"SID"}]'), "not_cookies");
  assert.equal(kind("hello world\nthis is not cookies"), "not_cookies");
});

test("wrong site: cookie rows, but none for YouTube or Google", () => {
  assert.equal(kind(row(".example.com", "SID", "abc")), "wrong_site");
  assert.equal(kind(row("notyoutube.com", "SID", "abc")), "wrong_site");
});

test("signed out: YouTube cookies with no sign-in among them", () => {
  assert.equal(kind(row(".youtube.com", "PREF", "abc")), "signed_out");
});

test("too old: every sign-in cookie has already expired", () => {
  assert.equal(kind(row(".youtube.com", "SID", "abc", past)), "too_old");
  // One live sign-in cookie among expired ones is still a working sign-in.
  assert.equal(kind([row(".youtube.com", "SID", "abc", past), row(".youtube.com", "__Secure-3PSID", "abc")].join("\n")), null);
});
