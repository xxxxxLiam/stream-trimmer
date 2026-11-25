import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(join(root, "README.md"), "utf8");

test("README says 1080p needs a sign-in and never the opposite", () => {
  assert.doesNotMatch(readme, /1080p does not itself require a sign-in/);
  assert.match(readme, /1080p needs a YouTube sign-in/);
  assert.match(readme, /Without one, clips come down at 360p/);
});

test("README names the public clipr repo for updates", () => {
  assert.doesNotMatch(readme, /reading from this repo's/);
  assert.match(readme, /reading from the public\s+\[xxxxxLiam\/clipr\]/);
});

test("README Node version matches .nvmrc", () => {
  const major = readFileSync(join(root, ".nvmrc"), "utf8").trim().replace(/^v/, "").split(".")[0];
  assert.match(readme, new RegExp(`\\*\\*Node\\.js ${major}\\*\\*`));
});
