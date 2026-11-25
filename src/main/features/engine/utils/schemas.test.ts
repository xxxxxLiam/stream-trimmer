/**
 * File: schemas.test.ts
 * Path: src/main/features/engine/utils/schemas.test.ts
 * Description: E-12. The engine takes only the values the app sends: a video link, "best" or a number for quality,
 *   and a range long enough to be a clip.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { downloadSchema, infoSchema } from "./schemas";

const V = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

test("a link to one video is accepted in the forms the app sends", () => {
  for (const url of [V, "https://youtu.be/dQw4w9WgXcQ", "https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx", "https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/live/dQw4w9WgXcQ"])
    assert.equal(infoSchema.safeParse({ url }).success, true, url);
});

test("a channel, playlist, search, bare host or odd port is refused before yt-dlp sees it", () => {
  for (const url of ["https://www.youtube.com/@somechannel", "https://www.youtube.com/channel/UCabc", "https://www.youtube.com/playlist?list=PLx", "https://www.youtube.com/results?search_query=x", "https://www.youtube.com/", "https://www.youtube.com:8080/watch?v=dQw4w9WgXcQ"])
    assert.equal(infoSchema.safeParse({ url }).success, false, url);
});

test("quality is best or digits; anything else never reaches the format selector", () => {
  for (const quality of ["best", "1080", "720", "192"]) assert.equal(downloadSchema.safeParse({ url: V, quality }).success, true, quality);
  for (const quality of ["1080]/best[", "", "high", "-1", "1080p"]) assert.equal(downloadSchema.safeParse({ url: V, quality }).success, false, quality);
});

test("a one-millisecond range is refused; a short real clip is not", () => {
  assert.equal(downloadSchema.safeParse({ url: V, start: 10, end: 10.001 }).success, false);
  assert.equal(downloadSchema.safeParse({ url: V, segments: [{ start: 1, end: 1.001 }] }).success, false);
  assert.equal(downloadSchema.safeParse({ url: V, start: 10, end: 12 }).success, true);
  assert.equal(downloadSchema.safeParse({ url: V, segments: [{ start: 0, end: 3 }, { start: 8, end: 9 }] }).success, true);
});
