import assert from "node:assert/strict";
import test from "node:test";
import type { DownloadEntry } from "../../../shared/utils/downloads";
import { clipGroup, undoClip } from "./undoClip";

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
    entries: [entry()],
    trashFile: async (p) => {
      calls.push(`trash ${p}`);
      return { ok: true };
    },
    forgetUse: (v, c, camp) => calls.push(`forget ${camp}/${v}/${c}`),
    backToWaiting: (camp, v, c) => calls.push(`waiting ${camp}/${v}/${c}`),
    removeDownload: (id) => calls.push(`remove ${id}`),
  });
  assert.equal(res.ok, true);
  assert.deepEqual(calls, ["trash /c/Honest Version.mp4", "remove e1", "forget acme/vid/B01", "waiting acme/vid/B01"]);
});

test("an entry without its source only leaves History", async () => {
  const calls: string[] = [];
  await undoClip({
    entries: [entry({ path: "", videoId: undefined, clipId: undefined, campaignId: undefined })],
    forgetUse: () => calls.push("forget"),
    backToWaiting: () => calls.push("waiting"),
    removeDownload: (id) => calls.push(`remove ${id}`),
  });
  assert.deepEqual(calls, ["remove e1"]);
});

test("C-5: a clip made in two languages is one entry: both files go to the Trash and the moment goes back once", async () => {
  const en = entry({ id: "e1", label: "Honest Version.mp4", path: "/c/Honest Version.mp4", clipId: "b1" });
  const es = entry({ id: "e2", label: "Honest Version ES.mp4", path: "/c/Honest Version ES.mp4", clipId: "b1" });
  const other = entry({ id: "e3", label: "Big Deal.mp4", path: "/c/Big Deal.mp4", clipId: "b2" });
  const group = clipGroup(es, [es, en, other]);
  assert.deepEqual(group.map((g) => g.id).sort(), ["e1", "e2"]);
  const calls: string[] = [];
  const res = await undoClip({
    entries: group,
    trashFile: async (p) => (calls.push(`trash ${p}`), { ok: true }),
    forgetUse: (v, c) => calls.push(`forget ${v}/${c}`),
    backToWaiting: (_k, v, c) => calls.push(`waiting ${v}/${c}`),
    removeDownload: (id) => calls.push(`remove ${id}`),
  });
  assert.equal(res.ok, true);
  assert.equal(calls.filter((c) => c.startsWith("trash")).length, 2);
  assert.deepEqual(calls.filter((c) => c.startsWith("remove")).sort(), ["remove e1", "remove e2"]);
  assert.equal(calls.filter((c) => c.startsWith("forget")).length, 1);
  assert.equal(calls.filter((c) => c.startsWith("waiting")).length, 1);
});

test("C-5: if one language's file cannot be moved, the moment stays cut and the reason comes back", async () => {
  const en = entry({ id: "e1", clipId: "b1" });
  const es = entry({ id: "e2", path: "/c/Honest Version ES.mp4", clipId: "b1" });
  const calls: string[] = [];
  const res = await undoClip({
    entries: [en, es],
    trashFile: async (p) => (p.includes("ES") ? { ok: false, error: "Locked." } : { ok: true }),
    forgetUse: () => calls.push("forget"),
    backToWaiting: () => calls.push("waiting"),
    removeDownload: (id) => calls.push(`remove ${id}`),
  });
  assert.deepEqual(res, { ok: false, error: "Locked." });
  assert.deepEqual(calls, ["remove e1"]);
});

test("when the file cannot be moved, nothing else is undone and the reason comes back", async () => {
  const calls: string[] = [];
  const res = await undoClip({
    entries: [entry()],
    trashFile: async () => ({ ok: false, error: "That file is outside your clips folder." }),
    forgetUse: () => calls.push("forget"),
    backToWaiting: () => calls.push("waiting"),
    removeDownload: () => calls.push("remove"),
  });
  assert.deepEqual(res, { ok: false, error: "That file is outside your clips folder." });
  assert.deepEqual(calls, []);
});
