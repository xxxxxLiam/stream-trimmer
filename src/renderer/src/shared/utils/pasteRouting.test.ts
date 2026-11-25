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

const SHEET_HEADER = "video\tstart\tend\tname\trating\ttopic\ttier\tcampaign";
const SHEET_ROW = "https://www.youtube.com/watch?v=podcast214\t0:20:00\t0:20:40\tSheet One\t8\tMoney\tT1\tAcme";

test("C-4: the sheet 'Copy format' asks for opens Import, with or without its header row", () => {
  assert.equal(classifyPaste(`${SHEET_HEADER}\n${SHEET_ROW}`), "moments");
  assert.equal(classifyPaste(`${SHEET_ROW}\n${SHEET_ROW.replace("0:20:00", "0:30:00")}`), "moments");
  assert.equal(classifyPaste(SHEET_ROW), "moments", "one tab-separated row is a sheet row, not a video link");
});

test("C-4: a bare video link still opens the video, and ordinary text is left alone", () => {
  assert.equal(classifyPaste("https://www.youtube.com/watch?v=podcast214"), "video");
  assert.equal(classifyPaste("remember to buy milk"), "none");
  assert.equal(classifyPaste(`${SHEET_HEADER}\nnot a link\tnot a time`), "none");
});
