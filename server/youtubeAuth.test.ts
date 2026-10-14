/**
 * File: youtubeAuth.test.ts
 * Path: server/youtubeAuth.test.ts
 * Description: Verifies safe classification of yt-dlp authentication diagnostics.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_PROBE_URLS,
  classifyYouTubeAuthOutput,
  isProbeTargetUnusable,
  isRateLimited,
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
  // Nothing here says anything about the session either way, and guessing
  // "broken" blocks a download that would have worked.
  assert.equal(
    classifyYouTubeAuthOutput("[youtube] Downloading webpage"),
    "inconclusive",
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

// Throttling arrives wearing the words of a sign-out. A macOS session with a
// valid imported cookies.txt hit both "HTTP Error 429" and "Sign in to confirm
// you're not a bot" while downloads were provably working, so routing either
// one to signed_out tells the user to re-authenticate their way out of a wait.
test("throttling is not an expired session", () => {
  assert.equal(
    classifyYouTubeAuthOutput(
      "ERROR: [youtube] dQw4w9WgXcQ: HTTP Error 429: Too Many Requests",
    ),
    "rate_limited",
  );
  assert.equal(
    classifyYouTubeAuthOutput(
      "ERROR: [youtube] jNQXAC9IVRw: Sign in to confirm you're not a bot. Use --cookies-from-browser",
    ),
    "rate_limited",
  );
  assert.equal(isRateLimited("HTTP Error 429: Too Many Requests"), true);
  assert.equal(isRateLimited("Extracted 143 cookies from chrome"), false);
});

// A throttled fetch reports the video as unplayable too. Calling that a dead
// probe target makes the caller walk the rest of the list, spending more of
// the quota that just ran out.
test("throttling outranks the unplayable video it causes", () => {
  const output = [
    "[debug] [youtube] jNQXAC9IVRw: web player response playability status: ERROR",
    "ERROR: [youtube] jNQXAC9IVRw: Sign in to confirm you're not a bot.",
  ].join("\n");
  assert.equal(classifyYouTubeAuthOutput(output), "rate_limited");
});

// Found account cookies settle the question; the throttling is a separate,
// temporary problem and does not make the session invalid.
test("confirmed cookies outrank throttling", () => {
  assert.equal(
    classifyYouTubeAuthOutput(
      "[debug] [youtube] Found YouTube account cookies\nERROR: HTTP Error 429: Too Many Requests",
    ),
    "signed_in",
  );
});

// The exact output that blocked downloads on a macOS machine whose cookies
// were valid: yt-dlp printed its verbose preamble and nothing the classifier
// recognizes. Note "error utf-8" in that preamble — matching the bare word
// "error" is why this looked like a failure. It is not one.
test("an unrecognized probe result is not a hard error", () => {
  const output = [
    "[debug] Encodings: locale utf-8, fs utf-8, pref utf-8, out utf-8 (No ANSI), error utf-8 (No ANSI), screen utf-8 (No ANSI)",
    "[debug] yt-dlp version stable@2025.09.26 from yt-dlp/yt-dlp",
    "[youtube] Extracting URL: https://www.youtube.com/watch?v=jNQXAC9IVRw",
  ].join("\n");
  const status = classifyYouTubeAuthOutput(output);
  assert.equal(status, "inconclusive");
  assert.notEqual(status, "extractor_error");
  assert.notEqual(status, "signed_out");
});

// "Inconclusive" must not swallow the real thing — a line yt-dlp itself
// prefixed ERROR: is still a failure worth reporting.
test("a genuine extractor failure is still an extractor error", () => {
  assert.equal(
    classifyYouTubeAuthOutput(
      "[debug] Encodings: locale utf-8, error utf-8 (No ANSI)\nERROR: Unable to extract yt initial data",
    ),
    "extractor_error",
  );
  assert.equal(
    classifyYouTubeAuthOutput("ERROR: Unsupported URL: https://example.com/x"),
    "extractor_error",
  );
});

// BaW_jenozKc was yt-dlp's own test video and is permanently gone. Leaving it
// in cost ~10s and a guaranteed retry on every download before the probe ever
// reached a video that plays.
test("probe targets exclude the dead yt-dlp test video", () => {
  assert.equal(
    AUTH_PROBE_URLS.some((url) => url.includes("BaW_jenozKc")),
    false,
  );
  assert.ok(
    AUTH_PROBE_URLS.length > 1,
    "one target means one takedown breaks every sign-in check",
  );
  for (const url of AUTH_PROBE_URLS) {
    assert.match(url, /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/);
  }
  assert.equal(new Set(AUTH_PROBE_URLS).size, AUTH_PROBE_URLS.length);
});
