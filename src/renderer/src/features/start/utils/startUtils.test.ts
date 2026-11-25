/**
 * File: startUtils.test.ts
 * Description: Paste label per platform, YouTube link detection from clipboard text, and chip labels.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { pasteKeyLabel, shortLink, toolsStatusFrom, youtubeLinkFromText } from "./startUtils";

test("paste key is Command V on a Mac and Ctrl V elsewhere", () => {
  assert.equal(pasteKeyLabel("MacIntel"), "⌘V");
  assert.equal(pasteKeyLabel("Win32"), "Ctrl V");
  assert.equal(pasteKeyLabel("Linux x86_64"), "Ctrl V");
});

test("only a lone YouTube video link counts as a link", () => {
  assert.equal(youtubeLinkFromText("  https://www.youtube.com/watch?v=abc123  "), "https://www.youtube.com/watch?v=abc123");
  assert.equal(youtubeLinkFromText("youtu.be/abc123"), "youtu.be/abc123");
  assert.equal(youtubeLinkFromText("https://www.youtube.com/@somechannel"), null);
  assert.equal(youtubeLinkFromText("look at https://youtu.be/abc123 now"), null);
  assert.equal(youtubeLinkFromText("hello"), null);
  assert.equal(youtubeLinkFromText(""), null);
  assert.equal(youtubeLinkFromText(null), null);
});

test("link and folder read short on the chips", () => {
  assert.equal(shortLink("https://www.youtube.com/watch?v=abc"), "youtube.com/watch?v=abc");
  assert.match(shortLink("https://www.youtube.com/watch?v=" + "x".repeat(60)), /…$/);
});

test("the engine's tool report becomes the cold start state", () => {
  assert.equal(toolsStatusFrom({ overall: "checking", tools: {} }), "checking");
  assert.equal(toolsStatusFrom({ overall: "broken" }), "broken");
  assert.equal(toolsStatusFrom({ overall: "ready" }), "ready");
  assert.equal(toolsStatusFrom(null), "ready");
  assert.equal(toolsStatusFrom({ overall: 3 }), "ready");
});

test("B-4: a failed open never shows tool output, only a plain sentence", async () => {
  const { plainOpenError, OPEN_FAILED } = await import("./startUtils");
  assert.equal(plainOpenError("This video is private. Sign in to open it."), "This video is private. Sign in to open it.");
  assert.equal(plainOpenError("ERROR: [youtube] abc: Private video. yt-dlp exitCode=1"), OPEN_FAILED);
  assert.equal(plainOpenError("Command failed: /usr/local/bin/yt-dlp --dump-json"), OPEN_FAILED);
  assert.equal(plainOpenError("something broke\n    at run (/app/x.js:1:2)"), OPEN_FAILED);
  assert.equal(plainOpenError(""), OPEN_FAILED);
  assert.doesNotMatch(OPEN_FAILED, /exitCode/);
});
