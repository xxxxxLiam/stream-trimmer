import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { readAppVersion } from "./runDiagnostics";

test("the diagnostics app version is the one the app told the engine", () => {
  const before = process.env.CLIPPER_APP_VERSION;
  process.env.CLIPPER_APP_VERSION = "19.9.9";
  try {
    assert.equal(readAppVersion(), "19.9.9");
  } finally {
    if (before === undefined) delete process.env.CLIPPER_APP_VERSION;
    else process.env.CLIPPER_APP_VERSION = before;
  }
});

test("starting the engine hands it the app version, so a packaged build never reports 'unknown'", () => {
  const host = readFileSync(path.resolve(import.meta.dirname, "../../../modules/engineHost/engineHost.ts"), "utf8");
  assert.match(host, /process\.env\.CLIPPER_APP_VERSION = app\.getVersion\(\)/);
});
