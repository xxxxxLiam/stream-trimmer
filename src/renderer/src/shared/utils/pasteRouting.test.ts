/**
 * File: pasteRouting.test.ts
 * Description: Paste decides by content: video link, rows with times, channel link, or nothing.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { classifyPaste } from "./pasteRouting";

const channel = (s: string) => /youtube\.com\/@/.test(s);

test("a video link opens the video", () => {
  assert.equal(classifyPaste("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "video");
  assert.equal(classifyPaste("  https://youtu.be/dQw4w9WgXcQ\n"), "video");
});

test("rows with times open Import moments", () => {
  assert.equal(classifyPaste("Honest Version 1:12:04-1:12:46\nBig Deal 0:41:10-0:41:51"), "moments");
});

test("a channel link opens Channel data only where channels are known", () => {
  assert.equal(classifyPaste("https://www.youtube.com/@somebody", { isChannelUrl: channel }), "channel");
  assert.equal(classifyPaste("https://www.youtube.com/@somebody"), "none", "public build: no channel meaning");
});

test("ordinary text and empty pastes are left alone", () => {
  assert.equal(classifyPaste("hello there"), "none");
  assert.equal(classifyPaste("   "), "none");
});
