/**
 * File: updater.test.ts
 * Path: server/updater.test.ts
 * Description: Verifies the auto-update policy — which platforms can restart
 * into an update, and that the download links handed to everyone else point
 * at assets the build actually produces.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  ASSETS,
  assetName,
  canInstallInPlace,
  downloadUrl,
  releaseTag,
  releasesUrl,
}: {
  ASSETS: Record<string, string>;
  assetName: (platform: string) => string | null;
  canInstallInPlace: (platform: string) => boolean;
  downloadUrl: (platform: string, version: unknown) => string;
  releaseTag: (version: unknown) => string | null;
  releasesUrl: () => string;
} = require("../electron/updater.cjs");

test("macOS cannot restart into an update, the others can", () => {
  // Squirrel.Mac validates code signatures and this app ships unsigned, so a
  // mac build offers a download instead of pretending it can install.
  assert.equal(canInstallInPlace("darwin"), false);
  assert.equal(canInstallInPlace("win32"), true);
  assert.equal(canInstallInPlace("linux"), true);
});

test("the download links point at the artifacts the build produces", () => {
  // The names are duplicated in updater.cjs because it must not import the
  // build config at runtime. If an artifactName is renamed, this fails rather
  // than a user's download 404ing.
  const root = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
  );
  const build = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ).build;

  const expand = (template: string, ext: string) =>
    template.replace("${ext}", ext);

  assert.equal(
    ASSETS.darwin,
    expand(build.mac.artifactName, "dmg"),
    "mac artifactName changed",
  );
  assert.equal(
    ASSETS.win32,
    expand(build.win.artifactName, "exe"),
    "windows artifactName changed",
  );
  assert.equal(
    ASSETS.linux,
    expand(build.linux.artifactName, "AppImage"),
    "linux artifactName changed",
  );

  // And the repo the links point at is the one being published to.
  assert.equal(build.publish.owner, "xxxxxLiam");
  assert.equal(build.publish.repo, "stream-trimmer");
});

test("a version becomes the tag the release workflow creates", () => {
  // The workflow tags `v<version>`; electron-updater reports the bare number.
  assert.equal(releaseTag("3.2.0"), "v3.2.0");
  assert.equal(releaseTag("v3.2.0"), "v3.2.0");
  assert.equal(releaseTag("3.2.0-beta.1"), "v3.2.0-beta.1");
  assert.equal(releaseTag(""), null);
  assert.equal(releaseTag(undefined), null);
  assert.equal(releaseTag("latest"), null);
});

test("each platform gets a direct link to its own installer", () => {
  assert.equal(
    downloadUrl("darwin", "3.2.0"),
    "https://github.com/xxxxxLiam/stream-trimmer/releases/download/v3.2.0/YouTube-Clipper-macOS-AppleSilicon.dmg",
  );
  assert.equal(
    downloadUrl("win32", "3.2.0"),
    "https://github.com/xxxxxLiam/stream-trimmer/releases/download/v3.2.0/YouTube-Clipper-Windows-x64-Setup.exe",
  );
  assert.equal(
    downloadUrl("linux", "3.2.0"),
    "https://github.com/xxxxxLiam/stream-trimmer/releases/download/v3.2.0/YouTube-Clipper-Linux-x64.AppImage",
  );
});

test("an unusable version or platform falls back to the releases page", () => {
  // Better a page that always exists than a link that 404s.
  assert.equal(downloadUrl("darwin", undefined), releasesUrl());
  assert.equal(downloadUrl("darwin", "not-a-version"), releasesUrl());
  assert.equal(downloadUrl("freebsd", "3.2.0"), releasesUrl());
  assert.equal(assetName("freebsd"), null);
  assert.match(releasesUrl(), /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases/);
});
