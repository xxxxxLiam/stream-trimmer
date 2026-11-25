/**
 * File: transcriptFetch.test.ts
 * Path: src/main/features/engine/utils/transcriptFetch.test.ts
 * Description: Language choice, file choice, and telling a failed fetch from a video with no captions.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  describeMissingTranscript,
  pickTranscriptFile,
  TRANSCRIPT_SUB_LANGS,
} from "./transcriptFetch";

test("asks for English variants and the original language, not just plain en", () => {
  const patterns = TRANSCRIPT_SUB_LANGS.split(",").map((p) => new RegExp(`^${p}$`));
  for (const lang of ["en", "en-US", "en-GB", "en-orig", "es-orig", "pt-orig"]) {
    assert.ok(patterns.some((r) => r.test(lang)), lang);
  }
  assert.ok(!patterns.some((r) => r.test("fr")));
});

test("prefers plain English, then English variants, then the original language", () => {
  assert.equal(pickTranscriptFile(["sub.en-US.vtt", "sub.en.vtt", "sub.es-orig.vtt"]), "sub.en.vtt");
  assert.equal(pickTranscriptFile(["sub.es-orig.vtt", "sub.en-GB.vtt"]), "sub.en-GB.vtt");
  assert.equal(pickTranscriptFile(["sub.de.vtt", "sub.es-orig.vtt"]), "sub.es-orig.vtt");
  assert.equal(pickTranscriptFile(["sub.de.vtt"]), "sub.de.vtt");
  assert.equal(pickTranscriptFile(["sub.info.json"]), null);
});

test("a refused subtitle download is a failure, not 'no transcript'", () => {
  const failure = describeMissingTranscript(
    "WARNING: Unable to download video subtitles for 'en': HTTP Error 429: Too Many Requests",
  );
  assert.ok(failure);
  assert.match(failure.error, /Couldn't load the transcript/);
  assert.equal(failure.kind, "refused");
});

test("an offline fetch says so", () => {
  const failure = describeMissingTranscript("ERROR: unable to download webpage: getaddrinfo ENOTFOUND");
  assert.equal(failure?.kind, "offline");
});

test("a video with no captions is not a failure", () => {
  assert.equal(describeMissingTranscript("[info] There are no subtitles for the requested languages"), null);
  assert.equal(describeMissingTranscript(""), null);
});
