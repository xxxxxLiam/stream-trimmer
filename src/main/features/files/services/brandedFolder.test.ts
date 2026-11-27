import assert from "node:assert/strict";
import test from "node:test";
import { resolveBrandedDir } from "./brandedFolder";

test("a Clipr folder already inside the picked folder does not change where clips go: the picked folder itself", () => {
  assert.equal(resolveBrandedDir("/v", "location", "B-roll", () => ["clipr b-roll", "x"]), "/v");
});

test("an unreadable folder still gives the picked folder", () => {
  assert.equal(
    resolveBrandedDir("/gone", "campaign", "Acme", () => {
      throw new Error("ENOENT");
    }),
    "/gone",
  );
});
