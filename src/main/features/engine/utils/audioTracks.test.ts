/**
 * File: audioTracks.test.ts
 * Path: src/main/features/engine/utils/audioTracks.test.ts
 * Description: Pins how dubbed audio tracks are read from yt-dlp's info and which language a
 *   download asks for: the original is the default, a chosen dub reaches the filter, and a
 *   language the video doesn't have falls back to the original with a flag. Shapes follow
 *   yt-dlp's extractor; not verified against real YouTube.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { audioSelector, audioTracksOf, hasDubs, resolveAudioLanguage } from "./audioTracks";

const audio = (language: string, format_note: string) => ({
  vcodec: "none",
  acodec: "mp4a.40.2",
  language,
  format_note,
});
const info = {
  formats: [
    audio("es", "Spanish (dubbed-auto)"),
    audio("en", "English (original) (default)"),
    audio("es", "Spanish (dubbed-auto)"),
    audio("pt", "Portuguese (dubbed)"),
    { vcodec: "avc1", acodec: "none", language: "en", format_note: "1080p" },
  ],
};

test("tracks come back once per language, original first, with their tag", () => {
  const t = audioTracksOf(info);
  assert.deepEqual(
    t.map((x) => [x.language, x.kind, x.label]),
    [["en", "original", "English"], ["es", "auto-dubbed", "Spanish"], ["pt", "creator-dub", "Portuguese"]],
  );
  assert.equal(hasDubs(t), true);
});

test("a video with no dubs has no choice to offer", () => {
  const t = audioTracksOf({ formats: [audio("en", "English (original) (default)")] });
  assert.equal(hasDubs(t), false);
  assert.deepEqual(audioTracksOf({}), []);
});

test("the original is the default: no language asks for no filter", () => {
  const t = audioTracksOf(info);
  assert.deepEqual(resolveAudioLanguage(undefined, t), { language: null, fellBack: false });
  assert.deepEqual(resolveAudioLanguage("en", t), { language: null, fellBack: false });
});

test("a chosen dub reaches the filter; a missing one falls back with a flag", () => {
  const t = audioTracksOf(info);
  assert.deepEqual(resolveAudioLanguage("es", t), { language: "es", fellBack: false });
  assert.deepEqual(resolveAudioLanguage("hi", t), { language: null, fellBack: true });
  assert.equal(audioSelector("es", "[ext=m4a]"), "bestaudio[language=es][ext=m4a]");
  assert.equal(audioSelector(null), "bestaudio");
});
