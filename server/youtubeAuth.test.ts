/**
 * File: youtubeAuth.test.ts
 * Path: server/youtubeAuth.test.ts
 * Description: Verifies safe classification of yt-dlp authentication diagnostics.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyYouTubeAuthOutput,
  isProbeTargetUnusable,
} from "./youtubeAuth";

test("recognizes confirmed YouTube account cookies", () => {
  assert.equal(
    classifyYouTubeAuthOutput("[debug] [youtube] Found YouTube account cookies"),
    "signed_in",
  );
});

test("distinguishes browser access failures", () => {
  assert.equal(
    classifyYouTubeAuthOutput("ERROR: database is locked"),
    "locked",
  );
  assert.equal(
    classifyYouTubeAuthOutput("WARNING: failed to decrypt cookie"),
    "decrypt_failed",
  );
  assert.equal(
    classifyYouTubeAuthOutput("ERROR: could not find chrome cookies database"),
    "profile_missing",
  );
});

test("does not treat generic extraction success as authenticated", () => {
  assert.equal(
    classifyYouTubeAuthOutput("Extracted 143 cookies from chrome"),
    "signed_out",
  );
  assert.equal(
    classifyYouTubeAuthOutput("[youtube] Downloading webpage"),
    "extractor_error",
  );
});

// The probe proves a sign-in by fetching a video. When that video is the thing
// that failed, calling it "signed out" sends the user to fix a session that
// was never broken — a Windows report showed every browser failing this way
// behind one dead probe video.
test("a dead probe video is not a missing session", () => {
  const output = [
    "[debug] [youtube] BaW_jenozKc: visionos player response playability status: ERROR",
    "[debug] [youtube] BaW_jenozKc: web player response playability status: ERROR",
    "ERROR: [youtube] BaW_jenozKc: This video is unavailable",
  ].join("\n");
  assert.equal(classifyYouTubeAuthOutput(output), "probe_unavailable");

  assert.equal(isProbeTargetUnusable("ERROR: Private video"), true);
  assert.equal(isProbeTargetUnusable("This video has been removed"), true);
  assert.equal(
    isProbeTargetUnusable("Video unavailable. This video is not available in your country"),
    true,
  );
  assert.equal(isProbeTargetUnusable("Extracted 143 cookies from chrome"), false);
});

test("a real verdict still wins over a dead probe video", () => {
  // Account cookies found: signed in, whatever the video did.
  assert.equal(
    classifyYouTubeAuthOutput(
      "[debug] [youtube] Found YouTube account cookies\nERROR: This video is unavailable",
    ),
    "signed_in",
  );
  // A cookie store we could not read is the more specific answer.
  assert.equal(
    classifyYouTubeAuthOutput(
      "ERROR: database is locked\nERROR: This video is unavailable",
    ),
    "locked",
  );
  assert.equal(
    classifyYouTubeAuthOutput(
      "ERROR: Failed to decrypt with DPAPI\nThis video is unavailable",
    ),
    "decrypt_failed",
  );
});
