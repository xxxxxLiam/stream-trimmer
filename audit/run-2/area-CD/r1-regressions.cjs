/**
 * r1-regressions.cjs — the regression hunt the brief asks for, around the four
 * things that changed: campaign identity, folder naming, the containment check
 * on four write paths, and the sticky primary-action row.
 *
 * Part A  switching campaign WHILE a download is running: which client's
 *         folder does the finished clip land in, and whose used-ranges record
 *         gets the range?
 * Part B  the bank at scale after the identity change: boot and switch with a
 *         2,000-row bank in the active campaign and 40 orphaned banks beside
 *         it, measured against a control with neither.
 * Part C  the suggested data folder's name after the exporter rename
 *         (DATA_FOLDER_NAME): what a fresh install actually gets.
 * Part D  the sticky primary-action row: is Cut reachable with the clips
 *         column full, the handoff panel open and a toast up?
 *
 * xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-2/area-CD/r1-regressions.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./cdlib.cjs");

const ROOT = path.join(L.SCRATCH, "r1");
const VID = "stub0000001";
const log = L.mkLogger(path.join(__dirname, "out", "r1-regressions.txt"));
const say = log.say;

async function switchTo(a, name) {
  await a.win.click("#ui-campaign-chip");
  await a.win.waitForTimeout(300);
  await a.win.evaluate((n) => {
    const b = Array.from(document.querySelectorAll("button")).find(
      (x) => !/^(Edit|Remove)/.test(x.getAttribute("aria-label") || "") && (x.textContent || "").trim().startsWith(n),
    );
    if (b) b.click();
  }, name);
  await a.win.waitForTimeout(700);
  await a.win.keyboard.press("Escape");
  await a.win.waitForTimeout(300);
}

(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const stub = L.makeStubRoot(path.join(ROOT, "stub"), { delayMs: 7000 });

  // ================================================== PART A
  say("================ PART A — switch campaign while the download is running");
  const aRoot = path.join(ROOT, "A");
  const clipsA = path.join(aRoot, "Client A clips");
  const clipsB = path.join(aRoot, "Client B clips");
  [clipsA, clipsB].forEach((d) => fs.mkdirSync(d, { recursive: true }));
  {
    const a = await L.launch({
      label: "r1-A-switch-midcut",
      cwd: stub,
      seed: {
        "clipper.campaigns": [
          L.slugCampaign("client-a", "Client A", clipsA, path.join(aRoot, "DataA"), { prefix: "AAA" }),
          L.slugCampaign("client-b", "Client B", clipsB, path.join(aRoot, "DataB"), { prefix: "BBB" }),
        ],
        "clipper.activeCampaign": "client-a",
        "clipper.clipsDir": clipsA,
        "clipper.dataDirConfirmed": true,
        "clipper.saveDir": clipsA,
        "clipper.saveDirs": [clipsA, clipsB],
      },
    });
    await L.loadVideo(a.win);
    await L.mark(a.win, "00:00:02", "00:00:08");
    await a.win.click("#ui-add-segment");
    await a.win.click("#ui-cut");
    await a.win.waitForTimeout(2000);
    say("A. download in flight; switching to Client B now");
    await switchTo(a, "Client B");
    say("A. active campaign:", a.state()["clipper.activeCampaign"]);
    await a.win
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('[role="status"],[role="alert"]')).some((n) =>
            /Clip saved|Error|could not|failed/i.test(n.textContent || ""),
          ),
        null,
        { timeout: 150000 },
      )
      .catch(() => {});
    await a.win.waitForTimeout(2000);
    const st = a.state();
    say("A. messages:", await L.messages(a.win));
    say("A. Client A's folder:", fs.readdirSync(clipsA));
    say("A. Client B's folder:", fs.readdirSync(clipsB));
    say("A. used ranges per campaign:",
      (st["clipper.campaigns"] || []).map((c) => [c.name, JSON.stringify(c.usedRanges)]));
    say("A. downloads list:", (st["clipper.downloads"] || []).map((d) => [d.label, d.dir]));
    const inB = fs.readdirSync(clipsB);
    say("A. VERDICT:", inB.length
      ? `Client A's clip landed in CLIENT B's folder: ${inB.join(", ")}`
      : "the clip stayed in Client A's folder");
    say("A. the clip's name carries which campaign's prefix:", [...fs.readdirSync(clipsA), ...inB]);
    await a.shot("A-switch-midcut");
    say("A. page errors:", a.logs.pageErrors.slice(0, 4));
    await a.close();
  }

  // ================================================== PART B
  say("");
  say("================ PART B — the bank at scale after the identity change");
  L.writeCfg(path.join(ROOT, "stub"), {});
  const bRoot = path.join(ROOT, "B");
  const clipsBig = path.join(bRoot, "Clips");
  fs.mkdirSync(clipsBig, { recursive: true });
  const bigRows = (n, p) => Array.from({ length: n }, (_, i) => L.bankRow(`${p}${String(i).padStart(4, "0")}`, i * 3, i * 3 + 2, `row ${i}`, `cat${i % 7}`, `T${(i % 3) + 1}`));
  const orphans = {};
  for (let i = 0; i < 40; i++) orphans[`dead-slug-${i}`] = { [VID]: bigRows(50, `X${i}-`) };

  async function measure(label, seed) {
    const t0 = Date.now();
    const app = await L.launch({ label, cwd: stub, seed });
    const booted = Date.now() - t0;
    const t1 = Date.now();
    await L.loadVideo(app.win);
    const loaded = Date.now() - t1;
    await app.win.click("#clips-tab-bank").catch(() => {});
    const t2 = Date.now();
    await app.win
      .waitForFunction(() => (document.querySelector("#clips-panel")?.querySelectorAll('[role="button"]').length || 0) > 0, null, { timeout: 120000 })
      .catch(() => {});
    const painted = Date.now() - t2;
    const rows = await app.win.evaluate(() => document.querySelector("#clips-panel")?.querySelectorAll('[role="button"]').length || 0);
    // typing one character into the bank search
    const t3 = Date.now();
    await app.win.fill('input[placeholder="Search the bank"]', "r").catch(() => {});
    await app.win.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const keystroke = Date.now() - t3;
    // switching campaign with a big bank present
    let switchMs = null;
    const names = (app.state()["clipper.campaigns"] || []).map((c) => c.name);
    if (names.length > 1) {
      const t4 = Date.now();
      await switchTo(app, names[1]);
      switchMs = Date.now() - t4;
    }
    const bytes = fs.statSync(path.join(app.userDataDir, "settings.json")).size;
    say(`  ${label}: boot ${booted}ms, video ${loaded}ms, bank paint ${painted}ms, rows ${rows}, one keystroke ${keystroke}ms, switch ${switchMs}ms, settings.json ${bytes}B`);
    say(`     page errors: ${JSON.stringify(app.logs.pageErrors.slice(0, 3))}`);
    await app.shot(label);
    await app.close();
  }

  const two = [
    L.slugCampaign("live-one", "Live One", clipsBig, path.join(bRoot, "Data"), { prefix: "LIV" }),
    L.slugCampaign("live-two", "Live Two", clipsBig, path.join(bRoot, "Data2"), { prefix: "LIT" }),
  ];
  await measure("B-control-small", {
    "clipper.campaigns": two,
    "clipper.activeCampaign": "live-one",
    "clipper.bank": { "live-one": { [VID]: bigRows(20, "S") } },
    "clipper.clipsDir": clipsBig,
    "clipper.dataDirConfirmed": true,
  });
  await measure("B-2000-rows-live", {
    "clipper.campaigns": two,
    "clipper.activeCampaign": "live-one",
    "clipper.bank": { "live-one": { [VID]: bigRows(2000, "B") } },
    "clipper.clipsDir": clipsBig,
    "clipper.dataDirConfirmed": true,
  });
  await measure("B-2000-rows-plus-40-orphans", {
    "clipper.campaigns": two,
    "clipper.activeCampaign": "live-one",
    "clipper.bank": { "live-one": { [VID]: bigRows(2000, "B") }, ...orphans },
    "clipper.clipsDir": clipsBig,
    "clipper.dataDirConfirmed": true,
  });

  // ================================================== PART C
  say("");
  say("================ PART C — the suggested data folder on a fresh install");
  const cRoot = path.join(ROOT, "C");
  const cClips = path.join(cRoot, "My Clips");
  fs.mkdirSync(cClips, { recursive: true });
  {
    const c = await L.launch({ label: "r1-C-datafolder", cwd: stub, seed: {} });
    await c.app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
    }, cClips);
    // create a campaign through the UI, then pick the clips folder in the footer
    await c.win.click("#ui-campaign-chip");
    await c.win.waitForTimeout(300);
    await c.win.click('button:has-text("New campaign")');
    await c.win.waitForTimeout(300);
    await c.win.locator("form input.field").first().fill("Fresh Client");
    await c.win.click('form button[type="submit"]');
    await c.win.waitForTimeout(700);
    await c.win.keyboard.press("Escape");
    await c.win.click("#ui-footer-clips");
    await c.win.waitForTimeout(1200);
    const st = c.state();
    say("C. clipsDir:", st["clipper.clipsDir"]);
    say("C. dataDir:", st["clipper.dataDir"]);
    say("C. dataDirConfirmed:", st["clipper.dataDirConfirmed"]);
    say("C. does the suggested data folder exist on disk?", fs.existsSync(String(st["clipper.dataDir"] || "x")));
    say("C. campaign record:", (st["clipper.campaigns"] || []).map((x) => [x.name, x.clipsDir, x.dataDir]));
    const footer = await c.win.evaluate(() => {
      const f = document.querySelector("footer");
      return f ? (f.innerText || "").replace(/\s+/g, " ").trim() : "no footer";
    });
    say("C. footer reads:", footer);
    const chip = await c.win.evaluate(() => {
      const d = document.querySelector("#ui-footer-data");
      return d ? { text: (d.innerText || "").trim(), title: d.getAttribute("title") } : "no data chip";
    });
    say("C. data chip:", chip);
    await c.shot("C-data-folder");
    await c.close();
  }

  // ================================================== PART D
  say("");
  say("================ PART D — the sticky primary-action row, loaded up");
  const dRoot = path.join(ROOT, "D");
  const dClips = path.join(dRoot, "Clips");
  fs.mkdirSync(dClips, { recursive: true });
  {
    const d = await L.launch({
      label: "r1-D-sticky",
      cwd: stub,
      seed: {
        "clipper.campaigns": [L.slugCampaign("acme-q4", "Acme Q4", dClips, path.join(dRoot, "Data"), { prefix: "ACM" })],
        "clipper.activeCampaign": "acme-q4",
        "clipper.bank": { "acme-q4": { [VID]: bigRows(60, "K") } },
        "clipper.clipsDir": dClips,
        "clipper.dataDirConfirmed": true,
        "clipper.saveDir": dClips,
        "clipper.saveDirs": [dClips],
        "clipper.editorHandoff": {
          "acme-q4": { afterCutting: "nothing", fcpLibrary: "", eventName: "campaign", mediaEvent: "", createProject: true, projectEvent: "Projects", projectNamePattern: "{clipId}", capcutDropDir: "", openCapCut: false },
        },
      },
    });
    const probe = async (label) =>
      d.win.evaluate((lbl) => {
        const cut = document.querySelector("#ui-cut");
        const add = document.querySelector("#ui-add-segment");
        const inF = document.querySelector("#ui-mark-in");
        const at = (el) => {
          if (!el) return "missing";
          const r = el.getBoundingClientRect();
          if (r.width === 0) return "hidden";
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          const onScreen = r.top >= 0 && r.bottom <= window.innerHeight;
          return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], onScreen, hit: top === el || el.contains(top) ? "OK" : `COVERED by ${top ? top.tagName + (top.id ? "#" + top.id : "") : "nothing"}` };
        };
        return { label: lbl, viewport: [window.innerWidth, window.innerHeight], cut: at(cut), add: at(add), in: at(inF), docScrollWidth: document.documentElement.scrollWidth };
      }, label);

    for (const [w, h] of [[1100, 760], [1440, 900], [900, 600]]) {
      await d.win.setViewportSize({ width: w, height: h });
      await d.win.waitForTimeout(600);
      await L.loadVideo(d.win);
      say(`D. ${w}x${h} with 0 segments:`, await probe("0seg"));
      await L.mark(d.win, "00:00:02", "00:00:08");
      await d.win.click("#ui-add-segment");
      await L.mark(d.win, "00:00:10", "00:00:16");
      await d.win.click("#ui-add-segment");
      await L.mark(d.win, "00:00:18", "00:00:24");
      await d.win.click("#ui-add-segment");
      say(`D. ${w}x${h} with 3 segments:`, await probe("3seg"));
      // open the handoff panel too
      await d.win.evaluate(() => {
        const b = Array.from(document.querySelectorAll("button")).find((x) => /Hand off to an editor/i.test(x.textContent || ""));
        if (b && b.getAttribute("aria-expanded") === "false") b.click();
      });
      await d.win.waitForTimeout(500);
      say(`D. ${w}x${h} with 3 segments + the handoff panel open:`, await probe("3seg+panel"));
      await d.shot(`D-${w}x${h}`);
      await d.win.evaluate(() => {
        document.querySelectorAll('button[aria-label="Remove segment 1"]').forEach((b) => b.click());
        document.querySelectorAll('button[aria-label="Remove segment 1"]').forEach((b) => b.click());
        document.querySelectorAll('button[aria-label="Remove segment 1"]').forEach((b) => b.click());
      });
      await d.win.waitForTimeout(400);
    }
    say("D. page errors:", d.logs.pageErrors.slice(0, 4));
    await d.close();
  }

  log.flush();
})().catch((e) => {
  say("SCRIPT FAILED: " + String(e.stack || e));
  log.flush();
  process.exit(1);
});
