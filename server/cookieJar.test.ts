/**
 * File: cookieJar.test.ts
 * Path: server/cookieJar.test.ts
 * Description: Concurrency tests for the cookie jar. yt-dlp rewrites its
 * --cookies file on every run; these prove that many simultaneous runs cannot
 * corrupt or overwrite the canonical jar, and that one refresher can update it.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import {
  __setBeforeRenameHook,
  __TMP_PREFIX,
  acquireCookiePath,
  jarHasSignIn,
} from "./cookieJar";

const require = createRequire(import.meta.url);

const GOOD = [
  "# Netscape HTTP Cookie File",
  [".youtube.com", "TRUE", "/", "TRUE", "2000000000", "__Secure-3PSID", "good-session-value"].join("\t"),
  ["#HttpOnly_.youtube.com", "TRUE", "/", "TRUE", "2000000000", "SID", "good-sid"].join("\t"),
  "",
].join("\n");

const ROTATED = GOOD.replace("good-session-value", "rotated-session-value");
const SIGNED_OUT = [
  "# Netscape HTTP Cookie File",
  [".youtube.com", "TRUE", "/", "TRUE", "2000000000", "VISITOR_INFO1_LIVE", "abc"].join("\t"),
  "",
].join("\n");

let root: string;
let canonical: string;
let tmpRoot: string;

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), "cookiejar-test-"));
  canonical = path.join(root, "yt-cookies.txt");
  tmpRoot = path.join(root, "tmp");
  await fsp.mkdir(tmpRoot);
  await fsp.writeFile(canonical, GOOD);
  __setBeforeRenameHook(null);
});

afterEach(async () => {
  __setBeforeRenameHook(null);
  await fsp.rm(root, { recursive: true, force: true });
});

const opts = (refresher: boolean, extra: object = {}) => ({
  refresher,
  canonicalPath: canonical,
  tmpRoot,
  ...extra,
});

const read = () => fsp.readFile(canonical, "utf8");
const leftovers = async () => [
  ...(await fsp.readdir(tmpRoot)),
  ...(await fsp.readdir(root)).filter((n) => n.includes(".tmp-")),
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Stands in for yt-dlp: reads the jar, waits, and writes it back to the path it was given. */
async function fakeYtDlp(cookiePath: string, writeBack: string | "same", delay: number) {
  const before = await fsp.readFile(cookiePath, "utf8");
  await sleep(delay);
  // Non-atomic truncate-then-write, the way a real save can be caught half done.
  const fh = await fsp.open(cookiePath, "w");
  await fh.write("");
  await sleep(1);
  await fh.write(writeBack === "same" ? before : writeBack);
  await fh.close();
}

test("many concurrent non-refreshers (and a writer that mangles its copy) leave the canonical byte-identical", async () => {
  const before = await fsp.readFile(canonical);
  await Promise.all(
    Array.from({ length: 40 }, async (_, i) => {
      const lease = await acquireCookiePath(opts(false));
      assert.notEqual(lease.path, canonical, "yt-dlp must never be handed the canonical path");
      // Half the runs truncate to garbage, as a racing writer would.
      await fakeYtDlp(lease.path, i % 2 ? "garbage" : "same", i % 5);
      await lease.release(true); // even ok=true must not promote a non-refresher
      assert.equal(lease.outcome, "discarded");
    }),
  );
  assert.deepEqual(await fsp.readFile(canonical), before);
  assert.deepEqual(await leftovers(), []);
});

test("one refresher among many readers updates the canonical, readers still never do", async () => {
  const results = await Promise.all([
    ...Array.from({ length: 25 }, async () => {
      const lease = await acquireCookiePath(opts(false));
      await fakeYtDlp(lease.path, "garbage", 3);
      await lease.release(true);
    }),
    (async () => {
      const lease = await acquireCookiePath(opts(true));
      assert.equal(lease.refresher, true);
      await fakeYtDlp(lease.path, ROTATED, 10);
      await lease.release(true);
      return lease.outcome;
    })(),
  ]);
  assert.equal(results[results.length - 1], "committed");
  assert.equal(await read(), ROTATED);
  assert.deepEqual(await leftovers(), []);
});

test("a failed refresher run does not clobber a good jar", async () => {
  const lease = await acquireCookiePath(opts(true));
  await fakeYtDlp(lease.path, SIGNED_OUT, 1);
  await lease.release(false);
  assert.equal(lease.outcome, "discarded");
  assert.equal(await read(), GOOD);
  assert.deepEqual(await leftovers(), []);
});

test("an ok refresher whose jar lost the sign-in is not committed", async () => {
  const lease = await acquireCookiePath(opts(true));
  await fakeYtDlp(lease.path, SIGNED_OUT, 1);
  await lease.release(true);
  assert.equal(lease.outcome, "skipped-invalid");
  assert.equal(await read(), GOOD);
});

test("a crash between writing the temp file and the rename leaves the canonical intact", async () => {
  __setBeforeRenameHook(() => {
    throw new Error("simulated crash mid-commit");
  });
  const lease = await acquireCookiePath(opts(true));
  await fakeYtDlp(lease.path, ROTATED, 1);
  await lease.release(true);
  assert.equal(lease.outcome, "error");
  assert.equal(await read(), GOOD);
  assert.deepEqual(await leftovers(), [], "temp files are cleaned up after a failed commit");
  // And the mutex was released: the next refresher can still run.
  __setBeforeRenameHook(null);
  const next = await acquireCookiePath(opts(true, { maxWaitMs: 200 }));
  assert.equal(next.refresher, true);
  await next.release(false);
});

test("a fresh import made while a refresher runs wins over the stale refresh", async () => {
  const lease = await acquireCookiePath(opts(true));
  await fakeYtDlp(lease.path, ROTATED, 1);
  const imported = GOOD.replace("good-session-value", "user-just-imported");
  await fsp.writeFile(canonical, imported);
  await lease.release(true);
  assert.equal(lease.outcome, "skipped-changed");
  assert.equal(await read(), imported);
});

test("the mutex serialises refreshers", async () => {
  let active = 0;
  let maxActive = 0;
  const order: number[] = [];
  await Promise.all(
    Array.from({ length: 6 }, async (_, i) => {
      const lease = await acquireCookiePath(opts(true, { maxWaitMs: 10_000 }));
      assert.equal(lease.refresher, true);
      active++;
      maxActive = Math.max(maxActive, active);
      order.push(i);
      await sleep(5);
      active--;
      await lease.release(false);
    }),
  );
  assert.equal(maxActive, 1);
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5], "FIFO");
});

test("a refresher that waits too long degrades to a private copy instead of blocking", async () => {
  const first = await acquireCookiePath(opts(true));
  const second = await acquireCookiePath(opts(true, { maxWaitMs: 20 }));
  assert.equal(second.refresher, false);
  await fakeYtDlp(second.path, ROTATED, 1);
  await second.release(true);
  assert.equal(second.outcome, "discarded");
  assert.equal(await read(), GOOD);
  await first.release(false);
});

test("release is idempotent and always removes the private copy", async () => {
  const lease = await acquireCookiePath(opts(false));
  await lease.release(false);
  await lease.release(true);
  await assert.rejects(fsp.stat(lease.path));
  assert.ok(__TMP_PREFIX.length > 0);
});

test("a missing canonical file is reported, and does not leak the mutex", async () => {
  await fsp.rm(canonical);
  await assert.rejects(acquireCookiePath(opts(true)), /No cookie file/);
  await fsp.writeFile(canonical, GOOD);
  const lease = await acquireCookiePath(opts(true, { maxWaitMs: 100 }));
  assert.equal(lease.refresher, true);
  await lease.release(false);
});

test("HttpOnly-prefixed cookies count as a sign-in, in the jar check and in the app's own reader", () => {
  const httpOnlyOnly = [
    ["#HttpOnly_.youtube.com", "TRUE", "/", "TRUE", "2000000000", "__Secure-1PSID", "v"].join("\t"),
  ].join("\n");
  assert.equal(jarHasSignIn(httpOnlyOnly), true);
  assert.equal(jarHasSignIn(SIGNED_OUT), false);
  const { validateCookieText } = require("../electron/cookieFile.cjs");
  assert.equal(validateCookieText(httpOnlyOnly).ok, true);
});
