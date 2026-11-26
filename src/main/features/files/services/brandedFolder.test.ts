import assert from "node:assert/strict";
import test from "node:test";
import { resolveBrandedDir } from "./brandedFolder";

test("reuses the Clipr folder already inside the picked folder", () => {
  assert.equal(resolveBrandedDir("/v", "location", "B-roll", () => ["clipr b-roll", "x"]), "/v/clipr b-roll");
});

test("an unreadable folder still gives the branded path", () => {
  assert.equal(
    resolveBrandedDir("/gone", "campaign", "Acme", () => {
      throw new Error("ENOENT");
    }),
    "/gone/Clipr clips/Acme",
  );
});
