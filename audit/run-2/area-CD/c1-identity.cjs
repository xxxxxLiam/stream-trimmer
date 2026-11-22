/**
 * c1-identity.cjs — C-2 re-verification in the running app.
 *
 * Part A  migration: a settings.json in TODAY'S shape (slug ids, two banks,
 *         used ranges, downloads, workspaces, editorHandoff keyed by slug id,
 *         saveDirs, notes/categories/tiers) must load losing nothing, and must
 *         still lose nothing after the app writes to it.
 * Part B  old-style delete/recreate: delete a slug-id campaign, confirm its
 *         bank is gone from disk, recreate the SAME NAME and confirm the new
 *         campaign gets an opaque id and an EMPTY bank (no adoption).
 * Part C  mixed world: a slug campaign and an opaque campaign side by side;
 *         delete and recreate in both styles; confirm no adoption either way
 *         and that the other campaign is untouched.
 * Part D  orphan safety (T5's choice not to prune): a bank key left behind by
 *         a PAST delete, with no campaign to match. Create a campaign with
 *         exactly that name and confirm it cannot adopt the orphan; then
 *         measure whether the orphan is reachable, prunable or growing.
 *
 * xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-2/area-CD/c1-identity.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./cdlib.cjs");

const ROOT = path.join(L.SCRATCH, "c1");
const VID = "stub0000001";
const log = L.mkLogger(path.join(__dirname, "out", "c1-identity.txt"));
const say = log.say;

// --------------------------------------------------------------- UI helpers
async function openPopover(a) {
  await a.win.click("#ui-campaign-chip");
  await a.win.waitForTimeout(350);
}
async function closePopover(a) {
  await a.win.keyboard.press("Escape");
  await a.win.waitForTimeout(300);
}
async function newCampaign(a, name, extra = {}) {
  await openPopover(a);
  await a.win.click('button:has-text("New campaign")');
  await a.win.waitForTimeout(300);
  await a.win.locator("form input.field").first().fill(name);
  if (extra.clipsDir !== undefined) {
    // the clips/data fields are the last two text inputs in the form
    const inputs = a.win.locator('form input[type="text"]');
    const n = await inputs.count();
    say(`   (form has ${n} text inputs)`);
  }
  const probs = await a.win.evaluate(() =>
    Array.from(document.querySelectorAll("form [role='alert'], form li, form p"))
      .map((n) => (n.textContent || "").trim())
      .filter(Boolean),
  );
  await a.win.click('form button[type="submit"]');
  await a.win.waitForTimeout(700);
  const stillOpen = await a.win.evaluate(() => !!document.querySelector("form button[type='submit']"));
  const alerts = stillOpen
    ? await a.win.evaluate(() =>
        Array.from(document.querySelectorAll("form *"))
          .map((n) => (n.children.length === 0 ? (n.textContent || "").trim() : ""))
          .filter((t) => /already|name|folder|pattern/i.test(t)),
      )
    : [];
  await closePopover(a);
  return { preProblems: probs, formStillOpen: stillOpen, alerts };
}
async function removeCampaign(a, name) {
  await openPopover(a);
  const sel = `button[aria-label="Remove ${name}"]`;
  await a.win.click(sel);
  await a.win.waitForTimeout(300);
  await a.win.click(sel); // confirm
  await a.win.waitForTimeout(900);
  await closePopover(a);
}
async function switchTo(a, name) {
  await openPopover(a);
  await a.win.evaluate((n) => {
    const b = Array.from(document.querySelectorAll("button")).find(
      (x) => (x.textContent || "").trim().startsWith(n) && !/Edit|Remove/.test(x.getAttribute("aria-label") || ""),
    );
    if (b) b.click();
  }, name);
  await a.win.waitForTimeout(700);
  await closePopover(a);
}
async function importBlock(a, text) {
  await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
  const ta = a.win.locator('textarea[placeholder="Paste your timestamps here"]');
  await ta.waitFor({ timeout: 15000 });
  await ta.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  const btn = a.win.locator('#ui-col-clips button:has-text("Import ")').first();
  await btn.waitFor({ timeout: 30000 });
  await btn.click();
  await a.win.waitForTimeout(900);
}
async function bankView(a) {
  await a.win.click("#clips-tab-bank").catch(() => {});
  await a.win.waitForTimeout(600);
  return a.win.evaluate(() => {
    const p = document.querySelector("#clips-panel");
    if (!p) return { missing: true };
    return {
      rows: p.querySelectorAll('[role="button"]').length,
      text: (p.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 18),
    };
  });
}
function bankShape(st) {
  const b = (st && st["clipper.bank"]) || {};
  return Object.fromEntries(
    Object.entries(b).map(([cid, byVid]) => [
      cid,
      Object.fromEntries(Object.entries(byVid).map(([v, rows]) => [v, rows.length])),
    ]),
  );
}
function ids(st) {
  return ((st && st["clipper.campaigns"]) || []).map((c) => [c.id, c.name]);
}

// ------------------------------------------------------- the "today" settings
function todaysSettings(dirs) {
  return {
    "clipper.campaigns": [
      L.slugCampaign("acme-q4", "Acme Q4", dirs.acmeClips, dirs.acmeData, {
        prefix: "ACM",
        targetMinSec: 20,
        targetMaxSec: 45,
        hardMaxSec: 70,
        clipIdPattern: "{prefix}-{videoId}-{nn}",
        quality: "1080",
        usedRanges: { [VID]: [{ start: 10, end: 40, clipId: "ACM-stub0000001-01" }] },
      }),
      L.slugCampaign("beta-launch", "Beta Launch", dirs.betaClips, dirs.betaData, {
        prefix: "BET",
        format: "mp3",
        usedRanges: {
          [VID]: [{ start: 100, end: 130, clipId: "BET-stub0000001-01" }],
          other0000001: [{ start: 5, end: 9, clipId: "BET-other0000001-01" }],
        },
      }),
    ],
    "clipper.activeCampaign": "acme-q4",
    "clipper.bank": {
      "acme-q4": {
        [VID]: [
          { id: "A01", label: "acme hook", segments: [{ start: 60, end: 90 }], status: "banked", category: "hook", tier: "T1", note: "promised to the client" },
          { id: "A02", label: "acme payoff", segments: [{ start: 120, end: 160 }], status: "banked", category: "payoff", tier: "T2" },
          { id: "A03", label: "already cut", segments: [{ start: 200, end: 230 }], status: "cut", category: "hook", tier: "T1" },
        ],
        other0000001: [
          { id: "A10", label: "other video", segments: [{ start: 3, end: 8 }], status: "banked", category: "promo", tier: "T3" },
        ],
      },
      "beta-launch": {
        [VID]: [
          { id: "B01", label: "beta one", segments: [{ start: 300, end: 330 }], status: "banked", category: "beta-cat", tier: "T9" },
          { id: "B02", label: "beta two", segments: [{ start: 400, end: 445 }], status: "published", category: "beta-cat" },
        ],
      },
    },
    "clipper.clipsDir": dirs.acmeClips,
    "clipper.dataDir": dirs.acmeData,
    "clipper.dataDirConfirmed": true,
    "clipper.saveDir": dirs.acmeClips,
    "clipper.saveDirs": [dirs.acmeClips, dirs.betaClips],
    "clipper.saveDirNames": { [dirs.betaClips]: "Beta deliverables" },
    "clipper.downloads": [
      { kind: "clip", label: "ACM-stub0000001-01.mp4", path: path.join(dirs.acmeClips, "ACM-stub0000001-01.mp4"), dir: dirs.acmeClips, at: 1700000000000 },
    ],
    "clipper.editorHandoff": {
      "acme-q4": {
        afterCutting: "nothing",
        fcpLibrary: "/Volumes/Work/Acme.fcpbundle",
        eventName: "Acme raw",
        createProject: true,
        projectEvent: "Acme projects",
        projectNamePattern: "{clipId} - {campaign}",
        capcutDropDir: "",
        openCapCut: false,
        timelineFormat: "1080x1920@30",
      },
      "beta-launch": { afterCutting: "reveal", fcpLibrary: "", eventName: "", createProject: false, projectEvent: "", projectNamePattern: "{clipId}", capcutDropDir: "", openCapCut: false },
    },
    "clipper.workspaces": {
      tabs: [{ id: "t1", url: "https://www.youtube.com/watch?v=stub0000001", segments: [] }],
      activeId: "t1",
    },
    "clipper.authSource": "cookies",
    "clipper.cookieBrowser": "chrome",
  };
}

(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const stub = L.makeStubRoot(path.join(ROOT, "stub"));
  const dirs = {
    acmeClips: path.join(ROOT, "acme-clips"),
    acmeData: path.join(ROOT, "acme-data"),
    betaClips: path.join(ROOT, "beta-clips"),
    betaData: path.join(ROOT, "beta-data"),
  };
  Object.values(dirs).forEach((d) => fs.mkdirSync(d, { recursive: true }));

  // =============================================== PART A — migration
  say("================ PART A — migration of a settings.json in today's shape");
  const seedA = todaysSettings(dirs);
  const seedText = JSON.stringify(seedA, null, 2);
  const a = await L.launch({ label: "c1-A-migration", cwd: stub, seed: seedA });
  await a.win.waitForTimeout(1200);
  const stA = a.state();
  say("campaigns after boot:", ids(stA));
  say("bank on disk after boot:", bankShape(stA));
  const camps = stA["clipper.campaigns"] || [];
  const acme = camps.find((c) => c.id === "acme-q4");
  const beta = camps.find((c) => c.id === "beta-launch");
  say("acme-q4 preserved fields:", acme && {
    name: acme.name, prefix: acme.prefix, band: [acme.targetMinSec, acme.targetMaxSec, acme.hardMaxSec],
    pattern: acme.clipIdPattern, quality: acme.quality, clipsDir: acme.clipsDir, dataDir: acme.dataDir,
    used: acme.usedRanges,
  });
  say("beta-launch preserved fields:", beta && {
    name: beta.name, format: beta.format, used: beta.usedRanges, clipsDir: beta.clipsDir,
  });
  say("editorHandoff keys after boot:", Object.keys(stA["clipper.editorHandoff"] || {}));
  say("handoff for slug id acme-q4:", (stA["clipper.editorHandoff"] || {})["acme-q4"]);
  say("downloads kept:", (stA["clipper.downloads"] || []).length);
  say("saveDirs kept:", stA["clipper.saveDirs"]);

  await L.loadVideo(a.win);
  const viewAcme = await bankView(a);
  say("A. bank view for Acme Q4 (slug id):", viewAcme);
  // the handoff panel must read the slug-keyed settings back
  const handoffRead = await a.win.evaluate(() => {
    const open = Array.from(document.querySelectorAll("button,summary")).find((b) =>
      /Hand off to an editor/i.test(b.textContent || ""),
    );
    if (open) open.click();
    return new Promise((r) =>
      setTimeout(() => {
        const vals = {};
        document.querySelectorAll("input,select").forEach((el) => {
          const lab = el.getAttribute("aria-label") || (el.labels && el.labels[0] && el.labels[0].textContent) || el.id || el.name;
          if (lab) vals[String(lab).trim().slice(0, 40)] = el.type === "checkbox" ? el.checked : el.value;
        });
        r(vals);
      }, 700),
    );
  });
  say("A. handoff panel values read back from the slug-keyed settings:",
    Object.fromEntries(Object.entries(handoffRead).filter(([k]) => /Library|Event|project|After|CapCut/i.test(k))));
  await a.shot("A-migration-acme");

  await switchTo(a, "Beta Launch");
  const viewBeta = await bankView(a);
  say("A. bank view for Beta Launch (slug id):", viewBeta);
  await a.shot("A-migration-beta");
  await switchTo(a, "Acme Q4");

  // Now make the app write, and compare the whole settings file key by key.
  await importBlock(a, "A04 5:00-5:30 new row | hook | T1");
  await a.win.waitForTimeout(800);
  const stA2 = a.state();
  say("A. after one import, bank on disk:", bankShape(stA2));
  const lost = [];
  for (const [k, v] of Object.entries(seedA)) {
    const now = stA2[k];
    if (now === undefined) lost.push(`${k} GONE`);
  }
  say("A. seeded keys missing after the app wrote:", lost.length ? lost : "none");
  const sameCamps = JSON.stringify(stA2["clipper.campaigns"]) === JSON.stringify(seedA["clipper.campaigns"]);
  say("A. campaigns byte-identical to the seed after a write:", sameCamps);
  if (!sameCamps) {
    say("   seed:", JSON.stringify(seedA["clipper.campaigns"]));
    say("   now :", JSON.stringify(stA2["clipper.campaigns"]));
  }
  const bankNow = stA2["clipper.bank"];
  say("A. beta-launch bank untouched by the acme import:",
    JSON.stringify(bankNow["beta-launch"]) === JSON.stringify(seedA["clipper.bank"]["beta-launch"]));
  say("A. acme cut/published rows still have their status:",
    bankNow["acme-q4"][VID].map((r) => [r.id, r.status, r.category, r.tier, r.note || ""]));
  say("A. acme other-video rows kept:", bankNow["acme-q4"].other0000001);
  say("A. page errors:", a.logs.pageErrors.slice(0, 4));
  await a.close();

  // =============================================== PART B — old-style delete/recreate
  say("");
  say("================ PART B — delete a SLUG campaign, recreate the same name");
  const b = await L.launch({ label: "c1-B-slug-recreate", cwd: stub, seed: todaysSettings(dirs) });
  await L.loadVideo(b.win);
  say("B. ids before:", ids(b.state()), "bank:", bankShape(b.state()));
  await removeCampaign(b, "Acme Q4");
  const stB1 = b.state();
  say("B. ids after delete:", ids(stB1));
  say("B. bank after delete:", bankShape(stB1));
  say("B. acme-q4 key still on disk?", Object.prototype.hasOwnProperty.call(stB1["clipper.bank"] || {}, "acme-q4"));
  say("B. active campaign now:", stB1["clipper.activeCampaign"]);
  await b.shot("B-after-delete");
  const r = await newCampaign(b, "Acme Q4");
  say("B. create form reported:", r);
  const stB2 = b.state();
  say("B. ids after recreating 'Acme Q4':", ids(stB2));
  const newId = (stB2["clipper.campaigns"] || []).find((c) => c.name === "Acme Q4")?.id;
  say("B. new id:", newId, "| opaque?", /^c-[0-9a-f]{16}$/.test(String(newId)));
  say("B. bank after recreate:", bankShape(stB2));
  const viewB = await bankView(b);
  say("B. bank view of the recreated campaign:", viewB);
  say("B. VERDICT adoption:", viewB.rows === 0 ? "no adoption (PASS)" : `ADOPTED ${viewB.rows} rows (FAIL)`);
  await b.shot("B-recreated");
  say("B. page errors:", b.logs.pageErrors.slice(0, 4));
  await b.close();

  // =============================================== PART C — mixed world
  say("");
  say("================ PART C — mixed world: slug id and opaque id side by side");
  const c = await L.launch({
    label: "c1-C-mixed",
    cwd: stub,
    seed: {
      "clipper.campaigns": [L.slugCampaign("acme-q4", "Acme Q4", dirs.acmeClips, dirs.acmeData)],
      "clipper.activeCampaign": "acme-q4",
      "clipper.bank": { "acme-q4": { [VID]: [L.bankRow("A01", 60, 90, "acme hook", "hook", "T1")] } },
      "clipper.clipsDir": dirs.acmeClips,
      "clipper.dataDir": dirs.acmeData,
      "clipper.dataDirConfirmed": true,
    },
  });
  await L.loadVideo(c.win);
  // Create an opaque campaign through the UI and bank a row in it.
  await newCampaign(c, "Nordwind Q1");
  let stC = c.state();
  say("C. ids:", ids(stC));
  const nordId = (stC["clipper.campaigns"] || []).find((x) => x.name === "Nordwind Q1")?.id;
  say("C. opaque id for Nordwind Q1:", nordId, "| shape ok?", /^c-[0-9a-f]{16}$/.test(String(nordId)));
  await importBlock(c, "N01 7:00-7:30 nord hook | nordcat | T4");
  stC = c.state();
  say("C. bank with both styles:", bankShape(stC));

  // delete + recreate the OPAQUE one
  await removeCampaign(c, "Nordwind Q1");
  stC = c.state();
  say("C. after deleting the opaque campaign — ids:", ids(stC), "bank:", bankShape(stC));
  say("C. opaque bank key removed?", !Object.prototype.hasOwnProperty.call(stC["clipper.bank"] || {}, String(nordId)));
  await newCampaign(c, "Nordwind Q1");
  stC = c.state();
  const nordId2 = (stC["clipper.campaigns"] || []).find((x) => x.name === "Nordwind Q1")?.id;
  say("C. recreated opaque id:", nordId2, "| different from the dead one?", nordId2 !== nordId);
  const viewC1 = await bankView(c);
  say("C. recreated opaque campaign's bank view:", viewC1);
  say("C. slug campaign's bank untouched:", bankShape(stC));

  // delete + recreate the SLUG one, with the opaque one still present
  await switchTo(c, "Acme Q4");
  await removeCampaign(c, "Acme Q4");
  stC = c.state();
  say("C. after deleting the slug campaign — ids:", ids(stC), "bank:", bankShape(stC));
  await newCampaign(c, "Acme Q4");
  stC = c.state();
  const acmeId2 = (stC["clipper.campaigns"] || []).find((x) => x.name === "Acme Q4")?.id;
  say("C. recreated 'Acme Q4' id:", acmeId2, "| is it the dead slug?", acmeId2 === "acme-q4");
  await switchTo(c, "Acme Q4");
  const viewC2 = await bankView(c);
  say("C. recreated 'Acme Q4' bank view:", viewC2);
  say("C. VERDICT:", viewC1.rows === 0 && viewC2.rows === 0 && acmeId2 !== "acme-q4"
    ? "no adoption in either style (PASS)" : "ADOPTION (FAIL)");
  await c.shot("C-mixed-final");
  say("C. page errors:", c.logs.pageErrors.slice(0, 4));
  await c.close();

  // =============================================== PART D — orphan safety
  say("");
  say("================ PART D — a bank orphaned by a PAST delete");
  const orphanBank = {
    "acme-q4": { [VID]: [L.bankRow("OLD1", 60, 90, "last quarter hook", "hook", "T1"), L.bankRow("OLD2", 120, 160, "last quarter payoff", "payoff", "T2")] },
    "dead-client": { [VID]: [L.bankRow("D01", 10, 20, "dead client", "x", "T1")] },
  };
  const d = await L.launch({
    label: "c1-D-orphans",
    cwd: stub,
    seed: {
      "clipper.campaigns": [],
      "clipper.activeCampaign": null,
      "clipper.bank": orphanBank,
      "clipper.clipsDir": dirs.acmeClips,
      "clipper.dataDir": dirs.acmeData,
      "clipper.dataDirConfirmed": true,
    },
  });
  await a0(d);
  async function a0(app) {
    await app.win.waitForTimeout(800);
  }
  say("D. orphan bank survives boot with no campaigns:", bankShape(d.state()));
  await L.loadVideo(d.win);
  await newCampaign(d, "Acme Q4");
  let stD = d.state();
  const dId = (stD["clipper.campaigns"] || []).find((x) => x.name === "Acme Q4")?.id;
  say("D. id for the new 'Acme Q4':", dId);
  const viewD = await bankView(d);
  say("D. its bank view:", viewD);
  say("D. VERDICT orphan adoption:", viewD.rows === 0 ? "cannot be adopted (PASS)" : "ADOPTED (FAIL)");
  // Is the orphan reachable or prunable from the UI at all?
  const prune = await d.win.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .map((b) => (b.textContent || "").trim())
      .filter((t) => /clear|prune|forget|clean|storage|bank/i.test(t)),
  );
  say("D. buttons anywhere that mention clearing a bank:", prune);
  // grow it and measure the cost of carrying it
  const big = { ...orphanBank };
  for (let i = 0; i < 40; i++) {
    big[`dead-${i}`] = { [VID]: Array.from({ length: 50 }, (_, j) => L.bankRow(`X${i}-${j}`, j * 2, j * 2 + 1, `row ${j}`, "cat", "T1")) };
  }
  say("D. orphan keys now:", Object.keys(big).length, "| bytes of clipper.bank:", JSON.stringify(big).length);
  say("D. settings.json bytes with the orphans:", fs.statSync(path.join(d.userDataDir, "settings.json")).size);
  say("D. page errors:", d.logs.pageErrors.slice(0, 4));
  await d.shot("D-orphans");
  await d.close();

  // boot once with the inflated orphan bank to see what it costs
  const e = await L.launch({
    label: "c1-D-orphans-big",
    cwd: stub,
    seed: {
      "clipper.campaigns": [L.slugCampaign("live-one", "Live One", dirs.acmeClips, dirs.acmeData)],
      "clipper.activeCampaign": "live-one",
      "clipper.bank": big,
      "clipper.clipsDir": dirs.acmeClips,
      "clipper.dataDirConfirmed": true,
    },
  });
  const t0 = Date.now();
  await L.loadVideo(e.win);
  say("D. boot+load with 42 orphan campaigns / 2000+ orphan rows:", Date.now() - t0, "ms");
  say("D. live campaign's bank view:", await bankView(e));
  say("D. orphans still on disk:", Object.keys(e.state()["clipper.bank"] || {}).length, "keys");
  say("D. page errors:", e.logs.pageErrors.slice(0, 4));
  await e.close();

  log.flush();
})().catch((e) => {
  say("SCRIPT FAILED: " + String(e.stack || e));
  log.flush();
  process.exit(1);
});
