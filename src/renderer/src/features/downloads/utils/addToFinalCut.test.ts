import assert from "node:assert/strict";
import test from "node:test";
import type { DownloadEntry } from "../../../shared/utils/downloads";
import { finalCutState, IN_FINAL_CUT_MS } from "../../../shared/utils/inFinalCutStore";
import { addToFinalCut, type FinalCutBridge } from "./addToFinalCut";

const entry = (n: number): DownloadEntry =>
  ({ id: `e${n}`, kind: "clip", label: `Rooftop ${n}.mp4`, path: `/Clips/Clipr B-roll/Rooftop ${n}.mp4`, dir: "/Clips/Clipr B-roll", savedAt: 1, videoId: "abcdefghijk" }) as DownloadEntry;

function fake(opts: { library?: string | null; known?: string[]; calls?: string[] } = {}) {
  const calls = opts.calls ?? [];
  const known = new Set(opts.known ?? []);
  const api: FinalCutBridge = {
    pickAssetsLibrary: async () => (calls.push("pick"), opts.library === undefined ? "/Lib/Assets.fcpbundle" : opts.library),
    editor: {
      probe: async () => ({ ok: true as const, kind: "ffprobe" as const, json: { streams: [{ codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30/1" }], format: { duration: "5" } } }),
      writeFcpxml: async (p) => (calls.push(`write:${p.dirPath}`), (globalThis as { __xml?: string }).__xml = p.contents, { ok: true, path: `${p.dirPath}/${p.filename}` }),
      openWith: async () => (calls.push("open"), { ok: true }),
      pathExists: async () => ({ ok: true, exists: true, isDirectory: true }),
      assetsLibraryAdded: async ({ files }) => ({ ok: true, newFiles: files.filter((f) => !known.has(f)) }),
      recordAssetsLibraryAdded: async ({ files }) => (calls.push(`record:${files.length}`), { ok: true }),
    },
  };
  return api;
}

test("clips are added to an Assets event with a keyword per location, then recorded", async () => {
  const calls: string[] = [];
  const r = await addToFinalCut([1, 2].map((n) => ({ entry: entry(n), location: "B-roll" })), fake({ calls }));
  assert.equal(r.state, "done");
  if (r.state !== "done") return;
  assert.deepEqual(r.added, ["e1", "e2"]);
  assert.deepEqual(calls, ["pick", "write:/Clips/Clipr B-roll", "open", "record:2"]);
  const xml = (globalThis as { __xml?: string }).__xml ?? "";
  assert.match(xml, /<event name="Assets"/);
  assert.match(xml, /keyword-collection name="B-roll"/);
});

test("a cancelled picker does nothing, and a clip the library already has is skipped", async () => {
  const calls: string[] = [];
  const none = await addToFinalCut([{ entry: entry(1), location: "B-roll" }], fake({ library: null, calls }));
  assert.equal(none.state, "cancelled");
  assert.deepEqual(calls, ["pick"]);
  const again = await addToFinalCut([{ entry: entry(1), location: "B-roll" }], fake({ known: [entry(1).path as string] }));
  assert.equal(again.state === "done" && again.added.length, 0);
  assert.deepEqual(again.state === "done" && again.already, ["e1"]);
});

test("a failed Final Cut open is said, and nothing is recorded as added", async () => {
  const calls: string[] = [];
  const api = fake({ calls });
  api.editor!.openWith = async () => ({ ok: false, error: "Final Cut would not open." });
  const r = await addToFinalCut([{ entry: entry(1), location: "B-roll" }], api);
  assert.deepEqual(r, { state: "failed", message: "Final Cut would not open." });
  assert.ok(!calls.some((c) => c.startsWith("record")));
});

test("a row says In Final Cut for 2 seconds, then goes quiet but stays added", () => {
  const added = new Map([["e1", 1000]]);
  assert.deepEqual(finalCutState(added, "e1", 1000 + IN_FINAL_CUT_MS - 1), { added: true, showing: true });
  assert.deepEqual(finalCutState(added, "e1", 1000 + IN_FINAL_CUT_MS), { added: true, showing: false });
  assert.deepEqual(finalCutState(added, "other", 1000), { added: false, showing: false });
});
