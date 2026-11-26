import assert from "node:assert/strict";
import test from "node:test";
import { brandedDir, isBrandedName, safeFolderName } from "./brandedFolder";

test("a campaign pick makes Clipr clips/<Campaign>", () => {
  assert.equal(brandedDir("/Users/me/Videos", "campaign", "Acme"), "/Users/me/Videos/Clipr clips/Acme");
  assert.equal(brandedDir("C:\\Users\\me\\Videos\\", "campaign", "Acme"), "C:\\Users\\me\\Videos\\Clipr clips\\Acme");
});

test("a location pick makes Clipr <Name>", () => {
  assert.equal(brandedDir("/Users/me/Videos", "location", "B-roll"), "/Users/me/Videos/Clipr B-roll");
  assert.equal(brandedDir("D:\\Media", "location", "Sound effects"), "D:\\Media\\Clipr Sound effects");
});

test("an existing branded folder is reused, whatever its letter case", () => {
  assert.equal(brandedDir("/v", "location", "B-roll", ["Other", "clipr b-roll"]), "/v/clipr b-roll");
  assert.equal(brandedDir("/v", "campaign", "Acme", ["CLIPR CLIPS"]), "/v/CLIPR CLIPS/Acme");
});

test("never a double Clipr", () => {
  // Picking a folder that is already a Clipr folder is used, not nested into.
  assert.equal(brandedDir("/v/Clipr B-roll", "location", "B-roll"), "/v/Clipr B-roll");
  assert.equal(brandedDir("/v/Clipr B-roll/", "location", "B-roll"), "/v/Clipr B-roll");
  assert.equal(brandedDir("/v/Clipr clips", "campaign", "Acme"), "/v/Clipr clips/Acme");
  assert.equal(brandedDir("/Users/me/Downloads/Clipr", "campaign", "Acme"), "/Users/me/Downloads/Clipr/Acme");
  // A name that already starts with Clipr is not prefixed again.
  assert.equal(brandedDir("/v", "location", "Clipr Sounds"), "/v/Clipr Sounds");
  assert.equal(isBrandedName("Clipperton"), false);
});

test("names are made safe for Mac and Windows", () => {
  assert.equal(safeFolderName("A/B: C"), "A-B- C");
  assert.equal(safeFolderName("Dr. Pepper Inc."), "Dr. Pepper Inc");
  assert.equal(safeFolderName("Acme\u200b"), "Acme");
  assert.equal(safeFolderName("..."), "Campaign");
  assert.equal(safeFolderName("é".normalize("NFD")), "é".normalize("NFC"));
  assert.equal(brandedDir("/v", "location", 'Q?"x*'), "/v/Clipr Q-x-");
  assert.equal(brandedDir("/v", "location", "  "), "/v/Clipr Location");
});

test("nothing picked gives no folder", () => {
  assert.equal(brandedDir("  ", "campaign", "Acme"), "");
});
