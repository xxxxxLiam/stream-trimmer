/**
 * File: youtubeAuth.test.ts
 * Path: server/youtubeAuth.test.ts
 * Description: Verifies safe classification of yt-dlp authentication diagnostics.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { classifyYouTubeAuthOutput } from "./youtubeAuth";

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