/**
 * File: clip.test.ts
 * Path: src/renderer/src/shared/utils/clip.test.ts
 * Description: B2-3. The link shapes a clipper actually pastes must give a video id, and the
 *   ones that are not a single video must not.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { applyIn, applyOut, extractVideoId, normalizeYouTubeUrl, overCapMessage } from "./clip";
import { videoUrlProblem } from "../../modules/clipper/hooks/useClipperController";

const ID = "mmmmmmmmmmm";

test("B2-3: /live/<id>, the canonical link for a stream, is a video", () => {
  assert.equal(extractVideoId(`https://www.youtube.com/live/${ID}`), ID);
  assert.equal(extractVideoId(`https://www.youtube.com/live/${ID}?feature=share`), ID);
  assert.equal(extractVideoId(`https://youtube.com/live/${ID}?si=abc&t=120`), ID);
  assert.equal(videoUrlProblem(`https://www.youtube.com/live/${ID}`), null);
  assert.equal(normalizeYouTubeUrl(`https://www.youtube.com/live/${ID}?t=90`), `https://www.youtube.com/watch?v=${ID}&t=90`);
});

test("the other shapes that get pasted all load", () => {
  const same = [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&list=PL1&index=3&t=5s`,
    `https://www.youtube.com/watch?list=PL1&v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=tracking&t=10`,
    `https://youtu.be/${ID}/`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/v/${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `youtu.be/${ID}`,
    `  https://www.youtube.com/live/${ID}\n`,
  ];
  for (const u of same) assert.equal(extractVideoId(u), ID, u);
});

test("B-5 still holds: pages that are not a single video give no id", () => {
  for (const u of [
    "https://www.youtube.com/@somechannel",
    "https://www.youtube.com/@somechannel/live",
    "https://www.youtube.com/@somechannel/streams",
    "https://www.youtube.com/c/Name",
    "https://www.youtube.com/channel/UC123",
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/results?search_query=live",
    "https://www.youtube.com/live",
    "https://www.youtube.com/",
    "https://example.com/",
    "https://example.com/live/abc",
    "https://example.com/watch?v=abc",
    "just a word",
    "",
  ]) {
    assert.equal(extractVideoId(u), null, u);
    if (u.trim()) assert.match(videoUrlProblem(u) ?? "", /not a single video/, u);
  }
});

test("a range over the cap says so in plain words, and a range inside it says nothing", () => {
  assert.equal(overCapMessage(1000), "Clips can be up to 10 minutes. This one is 16:40.");
  assert.equal(overCapMessage(600), "");
});

test("In past Out starts a fresh range at that In; Out before In does the mirror", () => {
  assert.deepEqual(applyIn(4324, 2999), { start: 4324, clearEnd: true });
  assert.deepEqual(applyIn(100, 200), { start: 100, clearEnd: false });
  assert.deepEqual(applyIn(100, null), { start: 100, clearEnd: false });
  assert.deepEqual(applyOut(50, 100), { end: 50, clearStart: true });
  assert.deepEqual(applyOut(150, 100), { end: 150, clearStart: false });
  assert.deepEqual(applyOut(5, null), { end: 5, clearStart: false });
});

test("C-15: a file name that is a Windows device name is made safe on every OS", async () => {
  const { sanitizeFilename } = await import("./clip");
  assert.equal(sanitizeFilename("CON"), "CON clip");
  assert.equal(sanitizeFilename("nul"), "nul clip");
  assert.equal(sanitizeFilename("Com3"), "Com3 clip");
  assert.equal(sanitizeFilename("LPT9"), "LPT9 clip");
  assert.equal(sanitizeFilename("Con Air"), "Con Air", "only the bare device names");
  assert.equal(sanitizeFilename("Console"), "Console");
});
