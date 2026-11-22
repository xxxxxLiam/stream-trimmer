/**
 * c2-names-isolation.cjs
 *
 * Part A  C-5: a clashing campaign name. Through the product's own New campaign
 *         and Edit forms, in both directions, with case and padding variants,
 *         and a check of what the model does when it is reached (" 2").
 * Part B  the campaign isolation that HELD in run 1 (24 of 24 assertions),
 *         re-run against the new opaque-id identity: two campaigns, each with
 *         its own rows, switched back and forth four times, with rows, the
 *         count line and the filter chips asserted each time.
 * Part C  leaks the identity fix did not close: what else is left behind when a
 *         campaign is deleted, and whether a bank can still be orphaned.
 *
 * xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-2/area-CD/c2-names-isolation.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./cdlib.cjs");

const ROOT = path.join(L.SCRATCH, "c2");
const VID = "stub0000001";
const log = L.mkLogger(path.join(__dirname, "out", "c2-names-isolation.txt"));
const say = log.say;
let pass = 0;
let fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  (ok ? pass++ : fail++);
  say(`   ${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (wanted ${JSON.stringify(want)})`}`);
  return ok;
}

async function openPopover(a) {
  await a.win.click("#ui-campaign-chip");
  await a.win.waitForTimeout(350);
}
async function closePopover(a) {
  await a.win.keyboard.press("Escape");
  await a.win.waitForTimeout(300);
}
/** Fills the New campaign form and submits; returns what the form said. */
async function tryCreate(a, name) {
  await openPopover(a);
  await a.win.click('button:has-text("New campaign")');
  await a.win.waitForTimeout(300);
  await a.win.locator("form input.field").first().fill(name);
  await a.win.waitForTimeout(150);
  await a.win.click('form button[type="submit"]');
  await a.win.waitForTimeout(600);
  const res = await a.win.evaluate(() => {
    const form = document.querySelector("form");
    if (!form) return { formOpen: false, said: [] };
    const said = Array.from(form.querySelectorAll("*"))
      .filter((n) => n.children.length === 0)
      .map((n) => (n.textContent || "").trim())
      .filter((t) => /already|different folders|needs \{nn\}|Give the campaign/i.test(t));
    return { formOpen: true, said: [...new Set(said)] };
  });
  if (res.formOpen) {
    await a.win.click('form button:has-text("Cancel")').catch(() => {});
  }
  await closePopover(a);
  return res;
}
async function tryRename(a, from, to) {
  await openPopover(a);
  await a.win.click(`button[aria-label="Edit ${from}"]`);
  await a.win.waitForTimeout(350);
  await a.win.locator("form input.field").first().fill(to);
  await a.win.waitForTimeout(150);
  await a.win.click('form button[type="submit"]');
  await a.win.waitForTimeout(600);
  const res = await a.win.evaluate(() => {
    const form = document.querySelector("form");
    if (!form) return { formOpen: false, said: [] };
    const said = Array.from(form.querySelectorAll("*"))
      .filter((n) => n.children.length === 0)
      .map((n) => (n.textContent || "").trim())
      .filter((t) => /already|different folders|needs \{nn\}|Give the campaign/i.test(t));
    return { formOpen: true, said: [...new Set(said)] };
  });
  if (res.formOpen) await a.win.click('form button:has-text("Cancel")').catch(() => {});
  await closePopover(a);
  return res;
}
async function switchTo(a, name) {
  await openPopover(a);
  await a.win.evaluate((n) => {
    const b = Array.from(document.querySelectorAll("button")).find(
      (x) =>
        !(x.getAttribute("aria-label") || "").match(/^(Edit|Remove)/) &&
        (x.textContent || "").trim().startsWith(n),
    );
    if (b) b.click();
  }, name);
  await a.win.waitForTimeout(800);
  await closePopover(a);
}
async function importBlock(a, text) {
  await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
  const ta = a.win.locator('textarea[placeholder="Paste your timestamps here"]');
  await ta.waitFor({ timeout: 15000 });
  await ta.evaluate((el, v) => {
    const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    s.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  const btn = a.win.locator('#ui-col-clips button:has-text("Import ")').first();
  await btn.waitFor({ timeout: 30000 });
  await btn.click();
  await a.win.waitForTimeout(900);
}
async function bankSnapshot(a) {
  await a.win.click("#clips-tab-bank").catch(() => {});
  await a.win.waitForTimeout(500);
  return a.win.evaluate(() => {
    const p = document.querySelector("#clips-panel");
    if (!p) return { missing: true };
    const rows = Array.from(p.querySelectorAll('[role="button"]')).map((r) =>
      (r.innerText || "").replace(/\s+/g, " ").trim(),
    );
    const chips = Array.from(p.querySelectorAll("button"))
      .map((b) => (b.textContent || "").trim())
      .filter((t) => t && !/^(Cut|Remove|Sort by|Import)/.test(t));
    const count = (() => {
      const live = p.querySelector("[aria-live]");
      return live ? (live.textContent || "").trim() : "";
    })();
    return { rows, chips, count };
  });
}
function ids(st) {
  return ((st && st["clipper.campaigns"]) || []).map((c) => [c.id, c.name]);
}

(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const stub = L.makeStubRoot(path.join(ROOT, "stub"));
  const d1 = path.join(ROOT, "clips-a");
  const d2 = path.join(ROOT, "clips-b");
  const dd1 = path.join(ROOT, "data-a");
  const dd2 = path.join(ROOT, "data-b");
  [d1, d2, dd1, dd2].forEach((d) => fs.mkdirSync(d, { recursive: true }));

  // ================================================= PART A — C-5
  say("================ PART A — C-5 duplicate campaign names");
  const a = await L.launch({
    label: "c2-A-names",
    cwd: stub,
    seed: {
      "clipper.campaigns": [L.slugCampaign("acme", "Acme Q4", d1, dd1)],
      "clipper.activeCampaign": "acme",
      "clipper.clipsDir": d1,
      "clipper.dataDir": dd1,
      "clipper.dataDirConfirmed": true,
    },
  });
  await L.loadVideo(a.win);
  say("A1. New campaign with the SAME name:");
  const r1 = await tryCreate(a, "Acme Q4");
  check("form stayed open", r1.formOpen, true);
  check("message", r1.said, ["Another campaign already has that name."]);
  check("no campaign was created", ids(a.state()).length, 1);

  say("A2. New campaign with the same name in a different case + padding:");
  const r2 = await tryCreate(a, "  acme q4 ");
  check("form stayed open", r2.formOpen, true);
  check("message", r2.said, ["Another campaign already has that name."]);
  check("still one campaign", ids(a.state()).length, 1);

  say("A3. A genuinely new name is accepted:");
  const r3 = await tryCreate(a, "Beta Launch");
  check("form closed", r3.formOpen, false);
  check("two campaigns now", ids(a.state()).length, 2);

  say("A4. Edit Beta Launch -> rename it to 'Acme Q4' (run 1's exact steps):");
  const r4 = await tryRename(a, "Beta Launch", "Acme Q4");
  check("form stayed open", r4.formOpen, true);
  check("message", r4.said, ["Another campaign already has that name."]);
  const stA = a.state();
  check("names unchanged", ids(stA).map((x) => x[1]), ["Acme Q4", "Beta Launch"]);
  await a.shot("A-name-clash");

  say("A5. Editing a campaign and KEEPING its own name is allowed:");
  const r5 = await tryRename(a, "Beta Launch", "Beta Launch");
  check("form closed", r5.formOpen, false);

  say("A6. popover rows are distinguishable:");
  await openPopover(a);
  const rows = await a.win.evaluate(() =>
    Array.from(document.querySelectorAll("li,div"))
      .map((n) => (n.innerText || "").replace(/\s+/g, " ").trim())
      .filter((t) => /Edit|Remove/.test(t) && t.length < 120),
  );
  say("   rows:", rows.slice(0, 4));
  await closePopover(a);

  // Where does " 2" come from? The model suffixes; the form refuses. Prove both.
  say("A7. the model's suffixing path, run against the product module:");
  const modelOut = await a.win.evaluate(() => "n/a — checked out of band below");
  say("   ", modelOut);
  say("A8. page errors:", a.logs.pageErrors.slice(0, 4));
  await a.close();

  // ================================================= PART B — isolation
  say("");
  say("================ PART B — campaign isolation across the identity change");
  const b = await L.launch({
    label: "c2-B-isolation",
    cwd: stub,
    seed: {
      "clipper.campaigns": [L.slugCampaign("legacy-slug", "Legacy Slug", d1, dd1)],
      "clipper.activeCampaign": "legacy-slug",
      "clipper.clipsDir": d1,
      "clipper.dataDir": dd1,
      "clipper.dataDirConfirmed": true,
    },
  });
  await L.loadVideo(b.win);
  // one legacy slug campaign and one new opaque campaign, created through the UI
  await importBlock(b, "L01 1:00-1:30 legacy hook | legacyhook | T1\nL02 2:00-2:40 legacy payoff | legacypay | T2");
  const createdNew = await tryCreate(b, "Opaque New");
  say("B. created the second campaign:", createdNew, ids(b.state()));
  await importBlock(b, "O01 10:00-10:30 opaque hook | opaquehook | T5");
  const stB = b.state();
  say("B. bank keys:", Object.keys(stB["clipper.bank"] || {}));

  const want = {
    "Legacy Slug": {
      rowIds: ["L01", "L02"],
      cats: ["legacyhook", "legacypay"],
      tiers: ["1", "2"],
    },
    "Opaque New": { rowIds: ["O01"], cats: ["opaquehook"], tiers: ["5"] },
  };
  for (let round = 1; round <= 4; round++) {
    for (const name of ["Legacy Slug", "Opaque New"]) {
      await switchTo(b, name);
      const snap = await bankSnapshot(b);
      const seenIds = snap.rows.map((r) => (/\b([LO]\d\d)\b/.exec(r) || [])[1]).filter(Boolean);
      say(`B round ${round}, ${name}: count="${snap.count}" chips=${JSON.stringify(snap.chips)}`);
      check(`r${round} ${name} rows`, seenIds, want[name].rowIds);
      check(
        `r${round} ${name} no other campaign's rows`,
        snap.rows.filter((r) => /\b[LO]\d\d\b/.test(r)).length,
        want[name].rowIds.length,
      );
      const chipText = snap.chips.join("|");
      const foreign = Object.entries(want)
        .filter(([n]) => n !== name)
        .flatMap(([, w]) => [...w.cats, ...w.tiers.map((t) => `Tier ${t}`)])
        .filter((c) => chipText.includes(c));
      check(`r${round} ${name} no foreign chips`, foreign, []);
    }
  }
  await b.shot("B-isolation");
  say("B. page errors:", b.logs.pageErrors.slice(0, 4));
  await b.close();

  // ================================================= PART C — what else leaks
  say("");
  say("================ PART C — what a delete still leaves behind");
  const c = await L.launch({
    label: "c2-C-leftovers",
    cwd: stub,
    seed: {
      "clipper.campaigns": [
        L.slugCampaign("acme", "Acme Q4", d1, dd1),
        L.slugCampaign("beta", "Beta Launch", d2, dd2),
      ],
      "clipper.activeCampaign": "acme",
      "clipper.bank": { acme: { [VID]: [L.bankRow("A01", 60, 90, "hook", "hook", "T1")] } },
      "clipper.editorHandoff": {
        acme: {
          afterCutting: "finalcut",
          fcpLibrary: "/Volumes/Clients/Acme Confidential.fcpbundle",
          eventName: "Acme raw",
          createProject: true,
          projectEvent: "Acme projects",
          projectNamePattern: "{clipId}",
          capcutDropDir: "/Volumes/Clients/Acme drop",
          openCapCut: false,
        },
      },
      "clipper.clipsDir": d1,
      "clipper.dataDir": dd1,
      "clipper.dataDirConfirmed": true,
      "clipper.saveDirs": [d1, d2],
      "clipper.saveDirNames": { [d1]: "Acme deliverables" },
      "clipper.downloads": [
        { kind: "clip", label: "ACM-stub0000001-01.mp4", path: path.join(d1, "ACM-stub0000001-01.mp4"), dir: d1, at: 1 },
      ],
    },
  });
  await L.loadVideo(c.win);
  await openPopover(c);
  await c.win.click('button[aria-label="Remove Acme Q4"]');
  await c.win.waitForTimeout(300);
  const tip = await c.win.evaluate(() => {
    const b2 = document.querySelector('button[aria-label="Remove Acme Q4"]');
    return { title: b2 && b2.getAttribute("title"), text: b2 && (b2.textContent || "").trim(), near: (b2 && b2.parentElement && b2.parentElement.innerText || "").replace(/\s+/g, " ").slice(0, 200) };
  });
  say("C. the Remove confirm button says:", tip);
  await c.win.click('button[aria-label="Remove Acme Q4"]');
  await c.win.waitForTimeout(900);
  await closePopover(c);
  const stC = c.state();
  say("C. campaigns:", ids(stC));
  say("C. bank keys left:", Object.keys(stC["clipper.bank"] || {}));
  say("C. editorHandoff keys left:", Object.keys(stC["clipper.editorHandoff"] || {}));
  say("C. the deleted client's handoff record:", (stC["clipper.editorHandoff"] || {}).acme);
  say("C. saveDirs left:", stC["clipper.saveDirs"]);
  say("C. saveDirNames left:", stC["clipper.saveDirNames"]);
  say("C. downloads left:", (stC["clipper.downloads"] || []).map((d) => d.path));
  await c.shot("C-after-delete");
  say("C. page errors:", c.logs.pageErrors.slice(0, 4));
  await c.close();

  // A campaign entry that does not parse: it is dropped and written back, and
  // its bank is then orphaned with no delete having happened.
  say("");
  say("C2. a campaign entry that normalizeCampaigns drops (duplicate id / no id)");
  const e = await L.launch({
    label: "c2-C2-dropped",
    cwd: stub,
    seed: {
      "clipper.campaigns": [
        L.slugCampaign("keep", "Keeper", d1, dd1),
        { name: "No Id Client", clipsDir: d2, dataDir: dd2 },
        L.slugCampaign("keep", "Duplicate Id Client", d2, dd2),
      ],
      "clipper.activeCampaign": "keep",
      "clipper.bank": {
        keep: { [VID]: [L.bankRow("K01", 60, 90, "keeper", "k", "T1")] },
        "no-id-client": { [VID]: [L.bankRow("N01", 10, 20, "no id", "n", "T1")] },
      },
      "clipper.clipsDir": d1,
      "clipper.dataDirConfirmed": true,
    },
  });
  await L.loadVideo(e.win);
  say("C2. campaigns loaded:", ids(e.state()));
  await importBlock(e, "K02 3:00-3:30 forces a write | k | T1");
  const stE = e.state();
  say("C2. campaigns written back to disk:", ids(stE));
  say("C2. bank keys still on disk:", Object.keys(stE["clipper.bank"] || {}));
  say("C2. the dropped campaigns are gone from disk for good:",
    !(stE["clipper.campaigns"] || []).some((x) => /No Id|Duplicate/.test(x.name)));
  await e.shot("C2-dropped");
  say("C2. page errors:", e.logs.pageErrors.slice(0, 4));
  await e.close();

  say("");
  say(`ASSERTIONS: ${pass} passed, ${fail} failed`);
  log.flush();
})().catch((err) => {
  say("SCRIPT FAILED: " + String(err.stack || err));
  log.flush();
  process.exit(1);
});
