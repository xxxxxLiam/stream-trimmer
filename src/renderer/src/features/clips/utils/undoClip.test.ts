import assert from "node:assert/strict";
import test from "node:test";
import type { DownloadEntry } from "../../../shared/utils/downloads";
import { undoClip } from "./undoClip";

const entry = (over: Partial<DownloadEntry> = {}): DownloadEntry => ({
  id: "e1",
  kind: "clip",
  label: "Honest Version.mp4",
  path: "/c/Honest Version.mp4",
  dir: "/c",
  savedAt: 1,
  campaignId: "acme",
  videoId: "vid",
  clipId: "B01",
  ...over,
});

test("undo gives the ranges back, puts the moment back to waiting, and drops the History row", () => {
  const calls: string[] = [];
  undoClip({
    entry: entry(),
    forgetUse: (v, c, camp) => calls.push(`forget ${camp}/${v}/${c}`),
    backToWaiting: (camp, v, c) => calls.push(`waiting ${camp}/${v}/${c}`),
    removeDownload: (id) => calls.push(`remove ${id}`),
  });
  assert.deepEqual(calls, ["forget acme/vid/B01", "waiting acme/vid/B01", "remove e1"]);
});

test("an entry without its source only leaves History", () => {
  const calls: string[] = [];
  undoClip({
    entry: entry({ videoId: undefined, clipId: undefined, campaignId: undefined }),
    forgetUse: () => calls.push("forget"),
    backToWaiting: () => calls.push("waiting"),
    removeDownload: (id) => calls.push(`remove ${id}`),
  });
  assert.deepEqual(calls, ["remove e1"]);
});
