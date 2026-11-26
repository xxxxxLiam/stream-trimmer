/**
 * File: mineVersion.test.ts
 * Path: scripts/mineVersion.test.ts
 * Description: The private build must never be stamped older than the latest public release,
 * or it opens saying it is out of date and offers an update that replaces it.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  pickVersion,
  compareVersions,
  latestReleaseVersion,
}: {
  pickVersion: (local: string, latest: string) => string;
  compareVersions: (a: string, b: string) => number;
  latestReleaseVersion: (f?: unknown) => Promise<string>;
} = require("./mineVersion.cjs");

test("a clone older than the public release is stamped with the release", () => {
  // Liam's case: 19.3.1 installed, private build made from a clone that still said less.
  assert.equal(pickVersion("19.3.0", "19.3.1"), "19.3.1");
  assert.equal(pickVersion("19.2.10", "v19.3.1"), "19.3.1");
});

test("a clone that is ahead keeps its own version", () => {
  assert.equal(pickVersion("19.4.0", "19.3.1"), "19.4.0");
  assert.equal(pickVersion("19.3.1", "19.3.1"), "19.3.1");
});

test("versions compare numerically, so 19.3.10-style numbers do not sort as text", () => {
  assert.equal(compareVersions("19.3.9", "19.3.10"), -1);
  assert.equal(compareVersions("19.10.0", "19.9.0"), 1);
});

test("when the release cannot be read the local version is used", async () => {
  assert.equal(pickVersion("19.3.1", ""), "19.3.1");
  assert.equal(await latestReleaseVersion(async () => { throw new Error("offline"); }), "");
  assert.equal(await latestReleaseVersion(async () => ({ ok: false })), "");
  assert.equal(
    await latestReleaseVersion(async () => ({ ok: true, json: async () => ({ tag_name: "v19.3.1" }) })),
    "19.3.1",
  );
});
