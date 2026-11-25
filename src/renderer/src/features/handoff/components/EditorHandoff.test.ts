/**
 * File: EditorHandoff.test.ts
 * Path: src/renderer/src/features/handoff/components/EditorHandoff.test.ts
 * Description: The automatic "After cutting" path: its outcome is published (D-4), and the
 *   document it writes holds every clip cut this session rather than only the last (D-5).
 */
import assert from "node:assert/strict";
import test from "node:test";

type Write = { dirPath: string; filename: string; contents: string };
const writes: Write[] = [];
let libraryPresent = true;
(globalThis as any).window = {
  electronAPI: {
    editor: {
      probe: async () => ({ ok: true, kind: "ffprobe", json: { streams: [{ codec_type: "video", width: 1080, height: 1920, avg_frame_rate: "30/1" }], format: { duration: "5" } } }),
      writeFcpxml: async (p: Write) => (writes.push(p), { ok: true, path: `${p.dirPath}/${p.filename}` }),
      openWith: async () => ({ ok: true }),
      pathExists: async () => ({ ok: true, exists: libraryPresent, isDirectory: true }),
      reveal: async () => ({ ok: true }),
      copyFiles: async () => ({ ok: true }),
      installed: async () => ({ ok: true }),
    },
  },
};

const mk = (id: string) => ({ id, path: `/c/${id}.mp4`, segments: [{ start: 0, end: 5 }] });
const ctx = (ids: string[], campaignId: string | null = "acme", campaignName = "Acme") => ({
  campaignId,
  campaignName,
  clipsDir: "/c",
  clips: ids.map(mk),
});

test("D-4: a failed automatic send is published with the same message as the panel's button", async () => {
  const H = await import("./EditorHandoff");
  const { DEFAULT_EDITOR_SETTINGS } = await import("../../../shared/utils/fcpxml");
  H.resetSessionHandoff();
  libraryPresent = false;
  const seen: string[] = [];
  const unsub = H.subscribeAfterCutting(() => seen.push(H.getAfterCuttingOutcome()!.outcome.message));
  const settings = { ...DEFAULT_EDITOR_SETTINGS, afterCutting: "finalcut" as const, fcpLibrary: "/L/Gone.fcpbundle" };
  const out = await H.runAfterCutting(settings, ctx(["A-01"]));
  unsub();
  assert.equal(out?.ok, false);
  assert.match(H.getAfterCuttingOutcome()!.outcome.message, /There is no library at \/L\/Gone\.fcpbundle.*nothing was sent/);
  assert.equal(seen.length, 1, "subscribers are told");
  assert.equal(writes.length, 0, "fails closed");
  // "After cutting: Nothing" publishes nothing.
  H.resetSessionHandoff();
  await H.runAfterCutting({ ...DEFAULT_EDITOR_SETTINGS }, ctx(["A-02"]));
  assert.equal(H.getAfterCuttingOutcome(), null);
  libraryPresent = true;
});

const idsIn = (xml: string) => [...xml.matchAll(/<asset id="[^"]*" name="([^"]*)"/g)].map((m) => m[1]);
const eventsIn = (xml: string) => [...xml.matchAll(/<event name="([^"]*)"/g)].map((m) => m[1]);

test("D-5: each send is one document holding only that clip, never the earlier ones", async () => {
  const H = await import("./EditorHandoff");
  const { DEFAULT_EDITOR_SETTINGS } = await import("../../../shared/utils/fcpxml");
  H.resetSessionHandoff();
  writes.length = 0;
  const on = { ...DEFAULT_EDITOR_SETTINGS, afterCutting: "finalcut" as const };
  await H.runAfterCutting(on, ctx(["A-01"]));
  await H.runAfterCutting(on, ctx(["A-02"]));
  const out = await H.runAfterCutting(on, ctx(["A-03"]));
  assert.equal(out?.ok, true);
  assert.equal(writes.length, 3);
  assert.deepEqual(writes.map((w) => idsIn(w.contents)), [["A-01"], ["A-02"], ["A-03"]]);
  assert.equal(new Set(writes.map((w) => w.filename)).size, 3, "no send overwrites another's file");
});

test("D-5: clips from two videos of one campaign never land in each other's event", async () => {
  const H = await import("./EditorHandoff");
  const { DEFAULT_EDITOR_SETTINGS } = await import("../../../shared/utils/fcpxml");
  H.resetSessionHandoff();
  writes.length = 0;
  const on = { ...DEFAULT_EDITOR_SETTINGS, afterCutting: "finalcut" as const };
  await H.runAfterCutting(on, { ...ctx(["POD-01"]), sourceTitle: "Podcast 214" });
  await H.runAfterCutting(on, { ...ctx(["POD-02"]), sourceTitle: "Podcast 214" });
  await H.runAfterCutting(on, { ...ctx(["FND-01"]), sourceTitle: "Founder story" });
  assert.deepEqual(writes.map((w) => idsIn(w.contents)), [["POD-01"], ["POD-02"], ["FND-01"]]);
  assert.deepEqual(writes.map((w) => eventsIn(w.contents)), [["Export"], ["Export"], ["Export"]], "one campaign, one event");
  assert.match(writes[2].contents, /<keyword-collection name="Founder story"\/>/);
  assert.doesNotMatch(writes[2].contents, /Podcast 214/);
});

test("D-1: the event is the campaign's Event, falling back to Export", async () => {
  const H = await import("./EditorHandoff");
  const { DEFAULT_EDITOR_SETTINGS } = await import("../../../shared/utils/fcpxml");
  H.resetSessionHandoff();
  writes.length = 0;
  const on = { ...DEFAULT_EDITOR_SETTINGS, afterCutting: "finalcut" as const };
  await H.runAfterCutting({ ...on, mediaEvent: "Acme exports" }, { ...ctx(["A-01"]), sourceTitle: "Podcast 214" });
  await H.runAfterCutting(on, { ...ctx(["A-02"]), sourceTitle: "Podcast 214" });
  assert.deepEqual(writes.map((w) => eventsIn(w.contents)), [["Acme exports"], ["Export"]]);
});

test("D-3: a rejected handoff is published with the engine's reason and the clip it was for", async () => {
  const H = await import("./EditorHandoff");
  const { DEFAULT_EDITOR_SETTINGS } = await import("../../../shared/utils/fcpxml");
  H.resetSessionHandoff();
  const w = (globalThis as any).window.electronAPI.editor;
  const open = w.openWith;
  w.openWith = async () => ({ ok: false, error: "Final Cut Pro is not installed." });
  try {
    const out = await H.runAfterCutting({ ...DEFAULT_EDITOR_SETTINGS, afterCutting: "finalcut" as const }, ctx(["A-09"]));
    assert.equal(out?.ok, false);
    const answer = H.getAfterCuttingOutcome()!;
    assert.equal(answer.outcome.message, "Final Cut Pro is not installed.");
    assert.equal(answer.outcome.clipId, "A-09");
    assert.equal(answer.outcome.clipPath, "/c/A-09.mp4");
    assert.deepEqual(answer.ctx.clips.map((c) => c.id), ["A-09"], "kept so it can be sent to another editor");
    H.clearAfterCuttingOutcome();
    assert.equal(H.getAfterCuttingOutcome(), null);
  } finally {
    w.openWith = open;
  }
});

test("CD2-1: an automatic outcome is tagged with the campaign it ran for", async () => {
  const H = await import("./EditorHandoff");
  const { DEFAULT_EDITOR_SETTINGS } = await import("../../../shared/utils/fcpxml");
  H.resetSessionHandoff();
  const on = { ...DEFAULT_EDITOR_SETTINGS, afterCutting: "finalcut" as const };
  await H.runAfterCutting(on, ctx(["AAA-01"], "client-a", "Client A"));
  assert.equal(H.getAfterCuttingOutcome()?.campaignId, "client-a");
});

test("languages: the original and its dubs go out as ONE document and ONE send to Final Cut", async () => {
  const H = await import("./EditorHandoff");
  const { DEFAULT_EDITOR_SETTINGS } = await import("../../../shared/utils/fcpxml");
  H.resetSessionHandoff();
  writes.length = 0;
  const sends: unknown[] = [];
  const w = (globalThis as any).window.electronAPI.editor;
  const open = w.openWith;
  w.openWith = async (a: unknown) => (sends.push(a), { ok: true });
  const settings = { ...DEFAULT_EDITOR_SETTINGS, afterCutting: "finalcut" as const };
  const c = { ...ctx([]), clips: [mk("Hook"), { ...mk("Hook ES"), parentId: "Hook" }] };
  await H.runAfterCutting(settings, c as any);
  w.openWith = open;
  assert.equal(writes.length, 1, "one file written");
  assert.equal(sends.length, 1, "Final Cut is sent to once");
  assert.equal(idsIn(writes[0].contents).length, 2, "both languages are in it");
});

test("Resolve: Clip writes one timeline file with the clip and its languages, opens Resolve with it, and says how to import", async () => {
  const H = await import("./EditorHandoff");
  const { DEFAULT_EDITOR_SETTINGS } = await import("../../../shared/utils/fcpxml");
  H.resetSessionHandoff();
  writes.length = 0;
  const opened: any[] = [];
  const w = (globalThis as any).window.electronAPI.editor;
  const open = w.openWith;
  w.openWith = async (a: unknown) => (opened.push(a), { ok: true, shown: true });
  const settings = { ...DEFAULT_EDITOR_SETTINGS, openIn: "resolve" as const };
  const c = { ...ctx([]), clips: [mk("Hook"), { ...mk("Hook ES"), parentId: "Hook" }] };
  const out = await H.runAfterCutting(settings, c as any);
  w.openWith = open;
  assert.equal(writes.length, 1, "one timeline file");
  assert.equal((writes[0].contents.match(/<project /g) ?? []).length, 1, "one timeline for the clip, its language inside");
  assert.equal(opened.length, 1);
  assert.equal(opened[0].app, "resolve");
  assert.match(opened[0].file, /\.fcpxml$/, "Resolve is given the timeline file, not the mp4");
  assert.match(out!.message, /File > Import > Timeline/);
});
