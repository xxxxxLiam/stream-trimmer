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

test("undo moves the file to the Trash, gives the ranges back, puts the moment back to waiting, and drops the History row", async () => {
  const calls: string[] = [];
  const res = await undoClip({
    entry: entry(),
    trashFile: async (p) => {
      calls.push(`trash ${p}`);
      return { ok: true };
    },
    forgetUse: (v, c, camp) => calls.push(`forget ${camp}/${v}/${c}`),
    backToWaiting: (camp, v, c) => calls.push(`waiting ${camp}/${v}/${c}`),
    removeDownload: (id) => calls.push(`remove ${id}`),
  });
  assert.equal(res.ok, true);
  assert.deepEqual(calls, ["trash /c/Honest Version.mp4", "forget acme/vid/B01", "waiting acme/vid/B01", "remove e1"]);
});

test("an entry without its source only leaves History", async () => {
  const calls: string[] = [];
  await undoClip({
    entry: entry({ path: "", videoId: undefined, clipId: undefined, campaignId: undefined }),
    forgetUse: () => calls.push("forget"),
    backToWaiting: () => calls.push("waiting"),
    removeDownload: (id) => calls.push(`remove ${id}`),
  });
  assert.deepEqual(calls, ["remove e1"]);
});

test("when the file cannot be moved, nothing else is undone and the reason comes back", async () => {
  const calls: string[] = [];
  const res = await undoClip({
    entry: entry(),
    trashFile: async () => ({ ok: false, error: "That file is outside your clips folder." }),
    forgetUse: () => calls.push("forget"),
    backToWaiting: () => calls.push("waiting"),
    removeDownload: () => calls.push("remove"),
  });
  assert.deepEqual(res, { ok: false, error: "That file is outside your clips folder." });
  assert.deepEqual(calls, []);
});
