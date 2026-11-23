/**
 * File: updateCheck.test.ts
 * Path: electron/updateCheck.test.ts
 * Description: F-9 — a check that never ran must not read as "Up to date".
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
import { interpretCheckResult } from "./updateCheck";

test("null result (check never ran) is an error, not 'none'", () => {
  assert.equal(interpretCheckResult(null, "1.2.3").kind, "error");
  assert.equal(interpretCheckResult(undefined, "1.2.3").kind, "error");
  assert.equal(interpretCheckResult({}, "1.2.3").kind, "error");
  assert.equal(interpretCheckResult({ updateInfo: {} }, "1.2.3").kind, "error");
});

test("a real answer that matches the running version is 'none'", () => {
  assert.equal(interpretCheckResult({ updateInfo: { version: "1.2.3" }, isUpdateAvailable: false }, "1.2.3").kind, "none");
});

test("a newer version is pending (the updater's own events report it)", () => {
  const r = interpretCheckResult({ updateInfo: { version: "1.3.0" }, isUpdateAvailable: true }, "1.2.3");
  assert.deepEqual(r, { kind: "pending", version: "1.3.0" });
});
