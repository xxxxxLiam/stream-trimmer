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
  // One name: the saved file's own, so a re-sent clip is "Hook", never "A-01 - Hook.mp4" or "Hook.mp4 Hook.mp4".
  assert.deepEqual(fc?.ctx.clips.map((c) => c.id), ["Hook"]);
  assert.equal(fc?.ctx.clips[0].label, undefined);
  const pr = planInEditor(entry, host, "premiere");
  assert.equal(pr?.settings.openIn, "premiere");
  assert.equal(pr?.settings.afterCutting, "nothing");
});

test("D-7: with Save to folder chosen, or no file, there is nothing to send: the file is shown instead", () => {
  assert.equal(planInEditor(entry, host, "folder"), null);
  assert.equal(planInEditor({ ...entry, path: undefined } as unknown as DownloadEntry, host, "finalcut"), null);
});

test("D2-3: a clip of another campaign goes out with its own campaign's library, event and layout", () => {
  const acme = { ...DEFAULT_EDITOR_SETTINGS, fcpLibrary: "/libs/Acme Library.fcpbundle", mediaEvent: "Acme exports" };
  const nova = { ...DEFAULT_EDITOR_SETTINGS, fcpLibrary: "/libs/Nova Library.fcpbundle", mediaEvent: "Nova event" };
  const novaClip = { ...entry, campaignId: "nova", campaign: "Nova" } as DownloadEntry;
  const withFor: InEditorHost = { ...host, settings: acme, settingsFor: (id) => (id === "nova" ? nova : acme) };
  const plan = planInEditor(novaClip, withFor, "finalcut");
  assert.equal(plan?.ctx.campaignId, "nova");
  assert.equal(plan?.settings.fcpLibrary, "/libs/Nova Library.fcpbundle");
  assert.equal(plan?.settings.mediaEvent, "Nova event");
  // Without a lookup the active campaign's values are never borrowed.
  const bare = planInEditor(novaClip, { ...host, settings: acme }, "finalcut");
  assert.notEqual(bare?.settings.fcpLibrary, "/libs/Acme Library.fcpbundle");
  assert.notEqual(bare?.settings.mediaEvent, "Acme exports");
  // The active campaign's own clip still uses the active settings.
  assert.equal(planInEditor({ ...entry, campaignId: "acme" } as DownloadEntry, withFor, "finalcut")?.settings.mediaEvent, "Acme exports");
});
