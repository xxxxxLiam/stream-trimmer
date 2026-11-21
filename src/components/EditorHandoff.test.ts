/**
 * File: EditorHandoff.test.ts
 * Path: src/components/EditorHandoff.test.ts
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
const ctx = (ids: string[]) => ({ campaignName: "Acme", clipsDir: "/c", clips: ids.map(mk) });

test("D-4: a failed automatic send is published with the same message as the panel's button", async () => {
  const H = await import("./EditorHandoff");
  const { DEFAULT_EDITOR_SETTINGS } = await import("../lib/fcpxml");
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

test("D-5: cutting another clip sends every clip of the session, not just the new one", async () => {
  const H = await import("./EditorHandoff");
  const { DEFAULT_EDITOR_SETTINGS } = await import("../lib/fcpxml");
  H.resetSessionHandoff();
  writes.length = 0;
  const off = { ...DEFAULT_EDITOR_SETTINGS };
  const on = { ...DEFAULT_EDITOR_SETTINGS, afterCutting: "finalcut" as const };
  await H.runAfterCutting(off, ctx(["A-01"]));
  await H.runAfterCutting(off, ctx(["A-02"]));
  const out = await H.runAfterCutting(on, ctx(["A-03"]));
  assert.equal(out?.ok, true);
  assert.equal(writes.length, 1);
  assert.equal((writes[0].contents.match(/<asset-clip /g) ?? []).length, 3, "all three clips are in the document");
  // And a fourth keeps accumulating, with a re-cut id replaced rather than duplicated.
  await H.runAfterCutting(on, ctx(["A-02"]));
  assert.equal((writes[1].contents.match(/<asset id=/g) ?? []).length, 3);
  await H.runAfterCutting(on, ctx(["A-04"]));
  assert.equal((writes[2].contents.match(/<asset id=/g) ?? []).length, 4);
});
