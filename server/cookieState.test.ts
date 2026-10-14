/**
 * File: cookieState.test.ts
 * Path: server/cookieState.test.ts
 * Description: Verifies what a cookies.txt is read to mean — signed in or
 * not, and until when — and that an imported file counts as connected even
 * though the app's own session partition is empty, which is the case that had
 * the app reporting "not signed in" while yt-dlp downloaded 1080p from that
 * very file.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);

type CookieFileState = {
  signedIn: boolean;
  expiresAt: number | null;
  expired: boolean;
  count: number;
  reason?: string;
};

type AuthState = {
  connected: boolean;
  source: string;
  expiresAt: number | null;
  expired: boolean;
  reason?: string;
};

const {
  parseCookieRows,
  readCookieFileState,
  resolveAuthState,
}: {
  parseCookieRows: (text: unknown) => Array<Record<string, unknown>>;
  readCookieFileState: (text: unknown, now?: number) => CookieFileState;
  resolveAuthState: (input?: {
    partitionSignedIn?: boolean;
    fileText?: string | null;
    now?: number;
  }) => AuthState;
} = require("../electron/cookieState.cjs");

const NOW = 1_700_000_000_000;
const SOON = Math.floor(NOW / 1000) + 60 * 60 * 24 * 30;
const LONG = Math.floor(NOW / 1000) + 60 * 60 * 24 * 180;
const PAST = Math.floor(NOW / 1000) - 60 * 60 * 24;

const row = (name: string, value: string, expiry: number, domain = ".youtube.com") =>
  [domain, "TRUE", "/", "TRUE", String(expiry), name, value].join("\t");

const file = (...rows: string[]) =>
  ["# Netscape HTTP Cookie File", "", ...rows].join("\n");

test("an imported file with a future expiry reads as signed in", () => {
  const state = readCookieFileState(
    file(row("VISITOR_INFO1_LIVE", "v", SOON), row("__Secure-3PSID", "abc123", SOON)),
    NOW,
  );
  assert.equal(state.signedIn, true);
  assert.equal(state.expired, false);
  assert.equal(state.expiresAt, SOON * 1000);
  assert.equal(state.count, 2);
});

test("an expired file reads as expired and not signed in", () => {
  const state = readCookieFileState(file(row("__Secure-3PSID", "abc123", PAST)), NOW);
  assert.equal(state.signedIn, false);
  assert.equal(state.expired, true);
  assert.equal(state.expiresAt, PAST * 1000);
  assert.match(state.reason!, /expired/i);
});

test("a session cookie is not treated as expired", () => {
  // Expiry 0 means "goes away when the browser closes", not 1 Jan 1970. Read
  // as a date it would retire a sign-in that works perfectly well.
  const state = readCookieFileState(file(row("SID", "abc123", 0)), NOW);
  assert.equal(state.signedIn, true);
  assert.equal(state.expired, false);
  assert.equal(state.expiresAt, null);
});

test("the expiry reported is the longest-lived auth cookie", () => {
  const state = readCookieFileState(
    file(
      row("SID", "a", SOON),
      row("__Secure-1PSID", "b", LONG),
      row("__Secure-3PSID", "c", 0),
      // A non-auth cookie outliving the sign-in must not extend it.
      row("PREF", "d", LONG + 99999),
    ),
    NOW,
  );
  assert.equal(state.expiresAt, LONG * 1000);
  assert.equal(state.signedIn, true);
});

test("a file with no auth cookie is not signed in", () => {
  const state = readCookieFileState(
    file(row("VISITOR_INFO1_LIVE", "v", SOON), row("PREF", "p", SOON)),
    NOW,
  );
  assert.equal(state.signedIn, false);
  assert.equal(state.expired, false);
  assert.equal(state.expiresAt, null);
  assert.equal(state.count, 2);
  // An auth cookie whose value was stripped is no sign-in either.
  assert.equal(readCookieFileState(file(row("SID", "", SOON)), NOW).signedIn, false);
  // Nor is one on a domain that merely ends in the right letters.
  assert.equal(
    readCookieFileState(file(row("SID", "x", SOON, "notyoutube.com")), NOW).signedIn,
    false,
  );
});

test("junk input is reported, never thrown", () => {
  for (const junk of ["", "   \n\n", "# only a comment", "just,a,csv\nof,stuff", null, undefined, 42]) {
    const state = readCookieFileState(junk, NOW);
    assert.equal(state.signedIn, false);
    assert.equal(state.expired, false);
    assert.equal(state.count, 0);
    assert.ok(state.reason);
  }
  assert.deepEqual(parseCookieRows(null), []);
  // A row with a garbled expiry column is still a cookie, just an undated one.
  assert.equal(readCookieFileState(file(row("SID", "x", NaN as unknown as number)), NOW).signedIn, true);
});

test("an imported file counts as connected with an empty partition", () => {
  // The bug: the partition is empty for everyone who imported a cookies.txt,
  // and judging connectedness from the partition alone reported "not signed
  // in" on every launch, focus and hourly refresh while that same file was
  // downloading 1080p.
  const state = resolveAuthState({
    partitionSignedIn: false,
    fileText: file(row("__Secure-3PSID", "abc123", SOON)),
    now: NOW,
  });
  assert.equal(state.connected, true);
  assert.equal(state.source, "imported");
  assert.equal(state.expiresAt, SOON * 1000);
  assert.equal(state.expired, false);
});

test("an empty partition with no usable file is not connected", () => {
  const expired = resolveAuthState({
    partitionSignedIn: false,
    fileText: file(row("SID", "abc123", PAST)),
    now: NOW,
  });
  assert.equal(expired.connected, false);
  assert.equal(expired.expired, true);
  assert.match(expired.reason!, /expired/i);

  const missing = resolveAuthState({ partitionSignedIn: false, fileText: null, now: NOW });
  assert.equal(missing.connected, false);
  assert.equal(missing.expired, false);
  assert.equal(missing.source, "none");

  assert.equal(resolveAuthState().connected, false);
});

test("probe() sees an imported file, and leaves it alone", async () => {
  // The end of the same wire: youtubeSession.probe() is what the launch,
  // focus and hourly refreshes call, and it is what kept logging
  // connected=false. Electron is stubbed with an EMPTY partition, exactly
  // the state an importing user is in.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-probe-"));
  const expiry = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const text = file(row("__Secure-3PSID", "abc123", expiry));
  const load = (Module as unknown as { _load: Function })._load;
  (Module as unknown as { _load: Function })._load = function (
    request: string,
    ...rest: unknown[]
  ) {
    if (request === "electron") {
      return {
        app: { getPath: () => dir },
        BrowserWindow: class {},
        session: { fromPartition: () => ({ cookies: { get: async () => [] } }) },
      };
    }
    return load.call(this, request, ...rest);
  };
  try {
    const cookieFile = path.join(dir, "yt-cookies.txt");
    fs.writeFileSync(cookieFile, text);
    const { probe } = require("../electron/youtubeSession.cjs");
    const result = await probe();
    assert.equal(result.connected, true);
    assert.equal(result.source, "imported");
    assert.equal(result.path, cookieFile);
    assert.equal(result.expiresAt, expiry * 1000);
    // The refresh must not write over the only sign-in the user has.
    assert.equal(fs.readFileSync(cookieFile, "utf8"), text);
  } finally {
    (Module as unknown as { _load: Function })._load = load;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the app's own session wins over whatever is on disk", () => {
  // The partition is the one that can be refreshed, so a signed-in partition
  // is connected even when the file it is about to be exported to is stale.
  const state = resolveAuthState({
    partitionSignedIn: true,
    fileText: file(row("SID", "abc123", PAST)),
    now: NOW,
  });
  assert.equal(state.connected, true);
  assert.equal(state.source, "signed-in");
  assert.equal(state.expired, false);
});
