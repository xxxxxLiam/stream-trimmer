import assert from "node:assert/strict";
import test from "node:test";
import { brandedDir, isBrandedName, safeFolderName } from "./brandedFolder";

test("a campaign pick is exactly the folder picked: nothing is added inside it (Liam, v20.0.1)", () => {
  assert.equal(brandedDir("/Users/me/Videos/Acme", "campaign", "Acme"), "/Users/me/Videos/Acme");
  assert.equal(brandedDir("/Users/me/Acme/Clipr Clips", "campaign", "Acme"), "/Users/me/Acme/Clipr Clips", "no Clipr Clips/<Campaign> nesting");
  assert.equal(brandedDir("C:\\Users\\me\\Acme\\", "campaign", "Acme"), "C:\\Users\\me\\Acme");
  assert.equal(brandedDir("/", "campaign", "Acme"), "/");
});

test("a location pick is exactly the folder picked too: no Clipr <Name> folder is added (Liam, 26 Nov, Same rule)", () => {
  assert.equal(brandedDir("/Users/me/Videos/B-roll", "location", "B-roll"), "/Users/me/Videos/B-roll");
  assert.equal(brandedDir("D:\\Media\\Sounds\\", "location", "Sound effects"), "D:\\Media\\Sounds");
  assert.equal(brandedDir("/v/Clipr B-roll/", "location", "B-roll"), "/v/Clipr B-roll");
});

test("existing folders and names never change the answer", () => {
  assert.equal(brandedDir("/v", "location", "B-roll", ["Other", "clipr b-roll"]), "/v");
  assert.equal(brandedDir("/v", "campaign", "Acme", ["CLIPR CLIPS"]), "/v");
  assert.equal(brandedDir("/Users/me/Downloads/Clipr", "campaign", "Acme"), "/Users/me/Downloads/Clipr");
  assert.equal(isBrandedName("Clipperton"), false);
});

test("names are made safe for Mac and Windows", () => {
  assert.equal(safeFolderName("A/B: C"), "A-B- C");
  assert.equal(safeFolderName("Dr. Pepper Inc."), "Dr. Pepper Inc");
  assert.equal(safeFolderName("Acme\u200b"), "Acme");
  assert.equal(safeFolderName("..."), "Campaign");
  assert.equal(safeFolderName("é".normalize("NFD")), "é".normalize("NFC"));
});

test("nothing picked gives no folder", () => {
  assert.equal(brandedDir("  ", "campaign", "Acme"), "");
});
