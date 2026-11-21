import test from "node:test";
import assert from "node:assert/strict";
import {
  SETUP_FIRST_LINE,
  buildSetupItems,
  setupProgress,
  type SetupCampaign,
  type SetupInput,
  type SetupItem,
  type SetupItemId,
} from "./setupTasks";

const camp = (over: Partial<SetupCampaign> = {}): SetupCampaign => ({
  id: "a",
  name: "Client A",
  clipsDir: "/c/a/clips",
  dataDir: "/c/a/data",
  targetMinSec: 30,
  targetMaxSec: 60,
  hardMaxSec: 90,
  clipIdPattern: "{prefix}-{videoId}-{nn}",
  ...over,
});

const base = (over: Partial<SetupInput> = {}): SetupInput => ({
  signIn: "signed_in",
  campaigns: [{ id: "a" }],
  campaign: camp(),
  dataDirConfirmed: true,
  exporter: false,
  videoLoaded: true,
  afterCutting: "reveal",
  finalCut: { fcpLibrary: "", mediaEvent: "", projectEvent: "", timelineFormat: { width: 1080, height: 1920, fps: "30" } },
  bankedClips: 1,
  ...over,
});

const empty = (over: Partial<SetupInput> = {}): SetupInput =>
  base({ signIn: "not_signed_in", campaigns: [], campaign: null, afterCutting: null, videoLoaded: false, bankedClips: 0, ...over });

const find = (items: SetupItem[], id: SetupItemId) => items.find((i) => i.id === id);
const get = (items: SetupItem[], id: SetupItemId) => {
  const it = find(items, id);
  assert.ok(it, `missing ${id}`);
  return it;
};
const ids = (items: SetupItem[]) => items.map((i) => i.id);

test("first line says setup never blocks first use", () => {
  assert.match(SETUP_FIRST_LINE, /optional/i);
  assert.match(SETUP_FIRST_LINE, /paste a link/i);
  assert.ok(!SETUP_FIRST_LINE.includes("—"));
});

test("nothing configured: only sign-in and campaign are unblocked", () => {
  const items = buildSetupItems(empty());
  assert.equal(get(items, "sign-in").blocked, false);
  assert.equal(get(items, "campaign").blocked, false);
  for (const id of ["clips-folder", "length-band", "id-pattern", "after-cutting", "clip-bank"] as const) {
    const it = get(items, id);
    assert.equal(it.blocked, true, id);
    assert.equal(it.done, false, id);
    assert.ok(it.blockedBy.length > 0, id);
  }
  assert.ok(items.every((i) => !i.done));
});

test("items 3 to 5 are blocked by the campaign, by name", () => {
  const items = buildSetupItems(empty());
  for (const id of ["clips-folder", "length-band", "id-pattern"] as const) {
    assert.deepEqual(get(items, id).blockedBy, ["Create a campaign"]);
  }
});

test("after cutting needs the campaign AND the clips folder", () => {
  let items = buildSetupItems(empty());
  assert.deepEqual(get(items, "after-cutting").blockedBy, ["Create a campaign", "Choose the clips folder"]);
  items = buildSetupItems(base({ campaign: camp({ clipsDir: "" }), afterCutting: "reveal" }));
  const it = get(items, "after-cutting");
  assert.deepEqual(it.blockedBy, ["Choose the clips folder"]);
  assert.equal(it.blocked, true);
  assert.equal(it.done, false, "a blocked item is never ticked");
  items = buildSetupItems(base());
  assert.equal(get(items, "after-cutting").blocked, false);
  assert.equal(get(items, "after-cutting").done, true);
});

test("after cutting: 'Nothing' chosen counts as done, never chosen does not", () => {
  assert.equal(get(buildSetupItems(base({ afterCutting: "nothing" })), "after-cutting").done, true);
  assert.equal(get(buildSetupItems(base({ afterCutting: null })), "after-cutting").done, false);
});

test("clearing a setting un-ticks its item", () => {
  const ok = buildSetupItems(base());
  assert.equal(get(ok, "clips-folder").done, true);
  assert.equal(get(buildSetupItems(base({ campaign: camp({ clipsDir: "  " }) })), "clips-folder").done, false);
  assert.equal(get(buildSetupItems(base({ campaign: camp({ clipIdPattern: "" }) })), "id-pattern").done, false);
  assert.equal(get(buildSetupItems(base({ campaign: camp({ clipIdPattern: "{prefix}-{videoId}" }) })), "id-pattern").done, false);
  assert.equal(get(buildSetupItems(base({ campaign: camp({ targetMinSec: 0, targetMaxSec: 0, hardMaxSec: 0 }) })), "length-band").done, false);
  assert.equal(get(buildSetupItems(base({ campaign: camp({ targetMinSec: 70 }) })), "length-band").done, false);
  assert.equal(get(buildSetupItems(base({ signIn: "not_signed_in" })), "sign-in").done, false);
  assert.equal(get(buildSetupItems(base({ signIn: "expired" })), "sign-in").done, false);
  assert.equal(get(buildSetupItems(base({ bankedClips: 0 })), "clip-bank").done, false);
});

test("sign-in states: expiring soon is signed in with a note; checking is not done", () => {
  const soon = get(buildSetupItems(base({ signIn: "expiring_soon" })), "sign-in");
  assert.equal(soon.done, true);
  assert.ok(soon.note);
  assert.equal(get(buildSetupItems(base({ signIn: "checking" })), "sign-in").done, false);
  assert.equal(get(buildSetupItems(base({ signIn: "expired" })), "sign-in").note, "Sign-in expired");
});

test("sign-in and campaign are independent of each other", () => {
  const a = buildSetupItems(base({ signIn: "not_signed_in" }));
  assert.equal(get(a, "campaign").done, true);
  assert.equal(get(a, "clips-folder").blocked, false);
});

test("campaigns exist but none selected: still blocked, with a pointer", () => {
  const items = buildSetupItems(base({ campaign: null, campaigns: [{ id: "a" }] }));
  assert.equal(get(items, "campaign").done, false);
  assert.match(get(items, "campaign").note ?? "", /Campaign chip/);
  assert.equal(get(items, "clips-folder").blocked, true);
});

test("Final Cut sub-items appear only when after cutting is Final Cut", () => {
  for (const v of [null, "nothing", "reveal"] as const) {
    const items = buildSetupItems(base({ afterCutting: v }));
    assert.ok(!ids(items).some((i) => i.startsWith("fcp-")), String(v));
  }
  const items = buildSetupItems(base({ afterCutting: "finalcut" }));
  assert.deepEqual(
    ids(items).filter((i) => i.startsWith("fcp-")),
    ["fcp-library", "fcp-media-event", "fcp-project-event", "fcp-timeline"],
  );
  for (const i of items.filter((x) => x.id.startsWith("fcp-"))) assert.equal(i.parentId, "after-cutting");
});

test("Final Cut sub-items each tick on their own field", () => {
  const fc = { fcpLibrary: "/L/Client.fcpbundle", mediaEvent: "Raw", projectEvent: "", timelineFormat: { width: 1080, height: 1920, fps: "30" } };
  const items = buildSetupItems(base({ afterCutting: "finalcut", finalCut: fc }));
  assert.equal(get(items, "fcp-library").done, true);
  assert.equal(get(items, "fcp-media-event").done, true);
  assert.equal(get(items, "fcp-project-event").done, false);
  assert.equal(get(items, "fcp-timeline").done, true);
  const cleared = buildSetupItems(base({ afterCutting: "finalcut", finalCut: { ...fc, fcpLibrary: " " } }));
  assert.equal(get(cleared, "fcp-library").done, false);
  const bad = buildSetupItems(base({ afterCutting: "finalcut", finalCut: { ...fc, timelineFormat: { width: 0, height: 0, fps: "30" } } }));
  assert.equal(get(bad, "fcp-timeline").done, false);
});

test("Final Cut sub-items sit directly after item 6", () => {
  const order = ids(buildSetupItems(base({ afterCutting: "finalcut", exporter: true })));
  const i = order.indexOf("after-cutting");
  assert.equal(order[i + 1], "fcp-library");
  assert.equal(order[i + 4], "fcp-timeline");
  assert.equal(order[i + 5], "data-folder");
});

test("channel data item is hidden when the build lacks the exporter", () => {
  assert.ok(!ids(buildSetupItems(base({ exporter: false }))).includes("data-folder"));
  assert.ok(ids(buildSetupItems(base({ exporter: true }))).includes("data-folder"));
});

test("channel data item: blocked by campaign, unticks when cleared, needs confirmation, must differ from clips", () => {
  const noCamp = get(buildSetupItems(empty({ exporter: true })), "data-folder");
  assert.deepEqual(noCamp.blockedBy, ["Create a campaign"]);
  assert.equal(get(buildSetupItems(base({ exporter: true })), "data-folder").done, true);
  assert.equal(get(buildSetupItems(base({ exporter: true, campaign: camp({ dataDir: "" }) })), "data-folder").done, false);
  const unconfirmed = get(buildSetupItems(base({ exporter: true, dataDirConfirmed: false })), "data-folder");
  assert.equal(unconfirmed.done, false);
  assert.equal(unconfirmed.action, "confirm-data-folder");
  const same = get(buildSetupItems(base({ exporter: true, campaign: camp({ dataDir: "/C/A/clips/" }) })), "data-folder");
  assert.equal(same.done, false);
  assert.ok(same.note);
  assert.equal(get(buildSetupItems(base({ exporter: true, campaign: camp({ dataDir: "" }) })), "data-folder").action, "pick-data-folder");
});

test("clip bank is optional, and only it", () => {
  const items = buildSetupItems(base({ afterCutting: "finalcut", exporter: true }));
  assert.deepEqual(items.filter((i) => i.optional).map((i) => i.id), ["clip-bank"]);
});

test("clip bank needs a campaign and a loaded video", () => {
  assert.deepEqual(get(buildSetupItems(empty()), "clip-bank").blockedBy, ["Create a campaign", "Load a video"]);
  assert.deepEqual(get(buildSetupItems(base({ videoLoaded: false })), "clip-bank").blockedBy, ["Load a video"]);
  const ready = get(buildSetupItems(base({ videoLoaded: true, bankedClips: 0 })), "clip-bank");
  assert.equal(ready.blocked, false);
  assert.equal(ready.done, false);
  assert.equal(get(buildSetupItems(base({ videoLoaded: false, bankedClips: 5 })), "clip-bank").done, false);
});

test("per campaign scoping: A configured, B not", () => {
  const a = buildSetupItems(base({ campaign: camp(), afterCutting: "finalcut", exporter: true,
    finalCut: { fcpLibrary: "/L/A.fcpbundle", mediaEvent: "A", projectEvent: "AP", timelineFormat: { width: 1080, height: 1920, fps: "30" } } }));
  const b = buildSetupItems(base({
    campaign: camp({ id: "b", name: "Client B", clipsDir: "", dataDir: "", clipIdPattern: "" }),
    campaigns: [{ id: "a" }, { id: "b" }],
    afterCutting: null, exporter: true, bankedClips: 0,
    finalCut: { fcpLibrary: "", mediaEvent: "", projectEvent: "", timelineFormat: null },
  }));
  for (const id of ["clips-folder", "id-pattern", "after-cutting", "data-folder"] as const) {
    assert.equal(get(a, id).done, true, `A ${id}`);
    assert.equal(get(b, id).done, false, `B ${id}`);
  }
  assert.equal(get(b, "campaign").done, true);
  assert.equal(get(b, "sign-in").done, true, "sign-in is app-wide, not per campaign");
  assert.ok(!ids(b).some((i) => i.startsWith("fcp-")));
});

test("ordering is stable regardless of state", () => {
  const canonical: SetupItemId[] = ["sign-in", "campaign", "clips-folder", "length-band", "id-pattern", "after-cutting", "data-folder", "clip-bank"];
  const states = [empty(), base(), base({ exporter: true }), empty({ exporter: true }),
    base({ exporter: true, signIn: "expired", bankedClips: 0 })];
  for (const s of states) assert.deepEqual(ids(buildSetupItems(s)), [...canonical].filter((i) => ids(buildSetupItems(s)).includes(i)));
  assert.deepEqual(ids(buildSetupItems(base({ exporter: true }))), canonical);
  const fc = ids(buildSetupItems(base({ exporter: true, afterCutting: "finalcut" })));
  assert.deepEqual(fc, ["sign-in", "campaign", "clips-folder", "length-band", "id-pattern", "after-cutting",
    "fcp-library", "fcp-media-event", "fcp-project-event", "fcp-timeline", "data-folder", "clip-bank"]);
  assert.equal(new Set(fc).size, fc.length);
});

test("blocked implies not done and not blocked implies empty blockedBy, across states", () => {
  const states = [empty(), base(), base({ campaign: camp({ clipsDir: "" }) }), empty({ exporter: true }),
    base({ afterCutting: "finalcut", exporter: true, videoLoaded: false })];
  for (const s of states) {
    for (const i of buildSetupItems(s)) {
      if (i.blocked) { assert.equal(i.done, false, i.id); assert.ok(i.blockedBy.length > 0, i.id); }
      else assert.deepEqual(i.blockedBy, [], i.id);
    }
  }
});

test("every item has one-line what and why, an action, and no em dash", () => {
  const all = buildSetupItems(base({ afterCutting: "finalcut", exporter: true }));
  for (const i of all) {
    for (const t of [i.title, i.what, i.why, i.actionLabel, ...(i.note ? [i.note] : [])]) {
      assert.ok(t.trim(), i.id);
      assert.ok(!/\n/.test(t) && !t.includes("—"), `${i.id}: ${t}`);
    }
  }
});

test("progress counts required items only", () => {
  const p = setupProgress(buildSetupItems(base({ bankedClips: 0 })));
  assert.equal(p.total, 6);
  assert.equal(p.done, 6);
  const q = setupProgress(buildSetupItems(empty()));
  assert.deepEqual(q, { done: 0, total: 6 });
});
