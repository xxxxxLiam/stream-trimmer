/**
 * File: cookieFile.test.ts
 * Path: server/cookieFile.test.ts
 * Description: Verifies the imported-cookies check and the detection of
 * Google's embedded-browser sign-in rejection.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  isSignInRejected,
  validateCookieText,
}: {
  isSignInRejected: (url: unknown) => boolean;
  validateCookieText: (
    text: unknown,
  ) => { ok: boolean; reason?: string; count?: number };
} = require("../electron/cookieFile.cjs");

const row = (domain: string, name: string, value: string) =>
  [domain, "TRUE", "/", "TRUE", "1999999999", name, value].join("\t");

const FILE = ["# Netscape HTTP Cookie File", "", row(".youtube.com", "__Secure-3PSID", "abc123")].join("\n");

test("a real exported cookies.txt is accepted", () => {
  const result = validateCookieText(FILE);
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  // google.com carries SAPISID and friends, so it counts too.
  assert.equal(validateCookieText(row(".google.com", "SID", "x")).ok, true);
});

test("a file with cookies but no sign-in is rejected", () => {
  const text = [row(".youtube.com", "VISITOR_INFO1_LIVE", "x"), row(".youtube.com", "PREF", "y")].join("\n");
  const result = validateCookieText(text);
  assert.equal(result.ok, false);
  assert.match(result.reason!, /no sign-in/i);
});

test("an auth cookie with an empty value is not a sign-in", () => {
  assert.equal(validateCookieText(row(".youtube.com", "SID", "")).ok, false);
});

test("the wrong site, the wrong format and an empty file are all rejected", () => {
  assert.match(
    validateCookieText(row(".example.com", "SID", "x")).reason!,
    /No YouTube or Google cookies/i,
  );
  assert.match(
    validateCookieText("just,a,csv\nof,other,stuff").reason!,
    /Netscape format/i,
  );
  assert.match(validateCookieText("").reason!, /empty/i);
  assert.match(validateCookieText("   \n\n# only a comment").reason!, /Netscape format/i);
  assert.equal(validateCookieText(null).ok, false);
});

test("a domain that merely ends in the right letters is not accepted", () => {
  // notyoutube.com must not pass as youtube.com.
  assert.equal(validateCookieText(row("notyoutube.com", "SID", "x")).ok, false);
  assert.equal(validateCookieText(row("evilgoogle.com", "SID", "x")).ok, false);
});

test("Google's embedded-browser rejection is recognised", () => {
  assert.equal(
    isSignInRejected("https://accounts.google.com/v3/signin/rejected?rrk=48"),
    true,
  );
  assert.equal(
    isSignInRejected("https://accounts.google.com/signin/rejected"),
    true,
  );
  assert.equal(
    isSignInRejected("https://accounts.google.com/x?reason=deniedsigninrejected"),
    true,
  );
});

test("ordinary sign-in pages are not treated as a rejection", () => {
  assert.equal(
    isSignInRejected("https://accounts.google.com/v3/signin/identifier"),
    false,
  );
  assert.equal(
    isSignInRejected("https://accounts.google.com/v3/signin/challenge/pwd"),
    false,
  );
  assert.equal(isSignInRejected("https://www.youtube.com/"), false);
  assert.equal(isSignInRejected(""), false);
  assert.equal(isSignInRejected(undefined), false);
});
