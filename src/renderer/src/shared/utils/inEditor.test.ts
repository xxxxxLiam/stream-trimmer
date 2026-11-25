import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_EDITOR_SETTINGS } from "./fcpxml";
import { planInEditor, type InEditorHost } from "./inEditor";
import type { DownloadEntry } from "./downloads";

const host: InEditorHost = {
  settings: { ...DEFAULT_EDITOR_SETTINGS, afterCutting: "nothing" },
  campaignId: "acme",
  campaignName: "Acme",
  sourceTitle: "Podcast",
  clipsDir: "/c",
};
const entry = { id: "h1", kind: "clip", label: "Hook.mp4", path: "/c/Hook.mp4", dir: "/c", savedAt: 1, clipId: "A-01" } as DownloadEntry;

test("D-7: In editor sends to the Clip-menu editor even though the stored setting says nothing", () => {
  const fc = planInEditor(entry, host, "finalcut");
  assert.equal(fc?.settings.afterCutting, "finalcut");
  assert.deepEqual(fc?.ctx.clips.map((c) => c.id), ["A-01"]);
  const pr = planInEditor(entry, host, "premiere");
  assert.equal(pr?.settings.openIn, "premiere");
  assert.equal(pr?.settings.afterCutting, "nothing");
});

test("D-7: with Save to folder chosen, or no file, there is nothing to send: the file is shown instead", () => {
  assert.equal(planInEditor(entry, host, "folder"), null);
  assert.equal(planInEditor({ ...entry, path: undefined } as unknown as DownloadEntry, host, "finalcut"), null);
});
