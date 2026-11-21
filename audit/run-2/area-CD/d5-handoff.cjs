/**
 * d5-handoff.cjs — D-4 and D-5 in the running app, and the regressions next to
 * them.
 *
 * Part A  D-4: "After cutting: Send to Final Cut Pro" with a library that is
 *         not there. The failure must now be on screen. Fail-closed is
 *         re-checked (no stray library, no .fcpxml).
 * Part B  D-5: cut two clips, Send all (library + media event + project event),
 *         snapshot the document; then turn the automatic send on and cut a
 *         third. The file at the same path must hold ALL THREE, and must still
 *         validate against Apple's FCPXML 1.10 DTD.
 * Part C  regression: the session batch is keyed by the clips FOLDER, and a new
 *         campaign inherits the previous campaign's folder (C-13). Switch
 *         campaign, cut, and see whose clips end up in the document.
 * Part D  regression: a campaign deleted while its clip is being cut.
 *
 * xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-2/area-CD/d5-handoff.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const L = require("./cdlib.cjs");

const ROOT = path.join(L.SCRATCH, "d5");
const log = L.mkLogger(path.join(__dirname, "out", "d5-handoff.txt"));
const say = log.say;

function dtd(file) {
  try {
    execFileSync("xmllint", ["--noout", "--dtdvalid", L.DTD, file], { stdio: ["ignore", "pipe", "pipe"] });
    return "DTD OK";
  } catch (e) {
    return "DTD FAIL: " + String(e.stderr || e.message).slice(0, 400);
  }
}
function xpathCount(file, expr) {
  try {
    return execFileSync("xmllint", ["--xpath", `count(${expr})`, file], { stdio: ["ignore", "pipe", "pipe"] })
      .toString()
      .trim();
  } catch (e) {
    return "err";
  }
}
function docSummary(file) {
  const xml = fs.readFileSync(file, "utf8");
  return {
    bytes: fs.statSync(file).size,
    ino: fs.statSync(file).ino,
    assets: xpathCount(file, "//asset"),
    assetClips: xpathCount(file, "//asset-clip"),
    events: xpathCount(file, "//event"),
    projects: xpathCount(file, "//project"),
    libraryElements: xpathCount(file, "//library"),
    importOptions: xpathCount(file, '//import-options/option[@key="library location"]'),
    clipIds: [...xml.matchAll(/name="([A-Z]{2,4}-stub0000001-\d\d)"/g)].map((m) => m[1]),
    dtd: dtd(file),
  };
}
async function openHandoff(a) {
  await a.win.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      /Hand off to an editor/i.test(x.textContent || ""),
    );
    if (b && b.getAttribute("aria-expanded") === "false") b.click();
  });
  await a.win.waitForTimeout(600);
}
async function setField(a, labelRe, value) {
  await a.win.evaluate(
    ([re, v]) => {
      const rx = new RegExp(re, "i");
      const lab = Array.from(document.querySelectorAll("label")).find((l) => rx.test(l.textContent || ""));
      const el = lab && lab.querySelector("input,select");
      if (!el) return "no field";
      const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (el.type === "checkbox") {
        if (el.checked !== v) el.click();
        return "checkbox";
      }
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return "set";
    },
    [labelRe, value],
  );
  await a.win.waitForTimeout(400);
}
async function clickBtn(a, re) {
  return a.win.evaluate((r) => {
    const rx = new RegExp(r, "i");
    const b = Array.from(document.querySelectorAll("button")).find((x) => rx.test((x.textContent || "").trim()));
    if (!b) return "not found";
    if (b.disabled) return "disabled";
    b.click();
    return "clicked";
  }, re);
}
async function handoffStatus(a) {
  return a.win.evaluate(() => {
    const sec = Array.from(document.querySelectorAll("section")).find(
      (s) => (s.getAttribute("aria-label") || "") === "Editor handoff",
    );
    if (!sec) return { missing: true };
    return {
      expanded: sec.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded"),
      status: Array.from(sec.querySelectorAll('[role="status"],[role="alert"]')).map((n) =>
        (n.textContent || "").replace(/\s+/g, " ").trim(),
      ),
      sendAllNote: Array.from(sec.querySelectorAll("p"))
        .map((p) => (p.textContent || "").trim())
        .filter((t) => /Send all puts/.test(t)),
    };
  });
}

(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const stub = L.makeStubRoot(path.join(ROOT, "stub"));

  // ================================================== PART A — D-4
  say("================ PART A — D-4: automatic send with a missing library");
  const aRoot = path.join(ROOT, "A");
  const aClips = path.join(aRoot, "Clips");
  fs.mkdirSync(aClips, { recursive: true });
  const badLib = path.join(aRoot, "this-library-does-not-exist.fcpbundle");
  {
    const a = await L.launch({
      label: "d5-A-silent",
      cwd: stub,
      seed: {
        "clipper.campaigns": [L.slugCampaign("acme-q4", "Acme Q4", aClips, path.join(aRoot, "Data"), { prefix: "ACM" })],
        "clipper.activeCampaign": "acme-q4",
        "clipper.clipsDir": aClips,
        "clipper.dataDirConfirmed": true,
        "clipper.saveDir": aClips,
        "clipper.saveDirs": [aClips],
        "clipper.editorHandoff": {
          "acme-q4": {
            afterCutting: "finalcut",
            fcpLibrary: badLib,
            eventName: "campaign",
            mediaEvent: "",
            createProject: false,
            projectEvent: "",
            projectNamePattern: "{clipId}",
            capcutDropDir: "",
            openCapCut: false,
          },
        },
      },
    });
    await L.loadVideo(a.win);
    const ok = await L.cutOne(a.win, "00:00:02", "00:00:08");
    await a.win.waitForTimeout(2500);
    say("cut finished:", ok);
    const msgs = await L.messages(a.win);
    say("EVERY message on screen:", msgs);
    const hs = await handoffStatus(a);
    say("handoff panel:", hs);
    const joined = msgs.join(" ") + " " + (hs.status || []).join(" ");
    say("mentions the library / Final Cut:", /library|Final Cut/i.test(joined) ? "YES" : "NO");
    say("names the bad path:", joined.includes(badLib) ? "YES" : "NO");
    say("panel opened itself:", hs.expanded);
    say("stray library created at the bad path:", fs.existsSync(badLib));
    say("clips folder:", fs.readdirSync(aClips));
    say(".fcpxml written:", fs.readdirSync(aClips).filter((f) => f.endsWith(".fcpxml")));
    await a.shot("A-missing-library");
    say("page errors:", a.logs.pageErrors.slice(0, 4));
    await a.close();
  }

  // ================================================== PART B — D-5
  say("");
  say("================ PART B — D-5: a later cut must not shrink the document");
  const bRoot = path.join(ROOT, "B");
  const bClips = path.join(bRoot, "Clips");
  const lib = path.join(bRoot, "Client Library تجربة.fcpbundle");
  fs.mkdirSync(bClips, { recursive: true });
  fs.mkdirSync(lib, { recursive: true });
  const docPath = path.join(bClips, "Raw clips تجربة.fcpxml");
  {
    const b = await L.launch({
      label: "d5-B-batch",
      cwd: stub,
      seed: {
        "clipper.campaigns": [L.slugCampaign("acme-q4", "Acme Q4", bClips, path.join(bRoot, "Data"), { prefix: "ACM" })],
        "clipper.activeCampaign": "acme-q4",
        "clipper.clipsDir": bClips,
        "clipper.dataDirConfirmed": true,
        "clipper.saveDir": bClips,
        "clipper.saveDirs": [bClips],
      },
    });
    await L.loadVideo(b.win);
    say("cut 1:", await L.cutOne(b.win, "00:00:02", "00:00:08"));
    await L.dismissToast(b.win);
    say("cut 2:", await L.cutOne(b.win, "00:00:12", "00:00:18"));
    await L.dismissToast(b.win);
    say("clips folder:", fs.readdirSync(bClips));

    await openHandoff(b);
    await setField(b, "^Library", lib);
    await setField(b, "Event for the raw clip", "Raw clips تجربة");
    await setField(b, "Also create a project", true);
    await setField(b, "Event for the projects", "Acme projects");
    await b.win.waitForTimeout(400);
    say("Send all:", await clickBtn(b, "^Send all to Final Cut Pro$"));
    await b.win.waitForTimeout(4000);
    say("status after Send all:", await handoffStatus(b));
    say("files:", fs.readdirSync(bClips).filter((f) => f.endsWith(".fcpxml")));
    const before = fs.existsSync(docPath) ? docSummary(docPath) : { missing: true };
    say("document after Send all:", before);
    fs.copyFileSync(docPath, path.join(b.outDir, "B-before.fcpxml"));
    await b.shot("B-send-all");

    // now turn the automatic send on and cut a third clip
    await setField(b, "^After cutting$", "finalcut");
    await b.win.waitForTimeout(600);
    say("afterCutting persisted:", JSON.stringify((b.state()["clipper.editorHandoff"] || {})["acme-q4"] || {}).slice(0, 220));
    say("cut 3:", await L.cutOne(b.win, "00:00:20", "00:00:26"));
    await b.win.waitForTimeout(4000);
    say("messages after cut 3:", await L.messages(b.win));
    say("handoff status after cut 3:", await handoffStatus(b));
    const after = fs.existsSync(docPath) ? docSummary(docPath) : { missing: true };
    say("document after the third cut:", after);
    fs.copyFileSync(docPath, path.join(b.outDir, "B-after.fcpxml"));
    say("VERDICT D-5:", Number(after.assets) >= 3 ? "every clip of the session is in the file (HELD)" : "the document was shrunk (REGRESSED)");
    say("VERDICT DTD after D-5's change:", after.dtd);
    say("library element count (must be 0):", after.libraryElements, "| import-options count (must be 1):", after.importOptions);
    say("all .fcpxml in the folder:", fs.readdirSync(bClips).filter((f) => f.endsWith(".fcpxml")));
    await b.shot("B-after-third-cut");
    say("page errors:", b.logs.pageErrors.slice(0, 4));
    await b.close();
  }

  // ================================================== PART C — cross-campaign
  say("");
  say("================ PART C — regression: whose clips are in the document after a switch?");
  const cRoot = path.join(ROOT, "C");
  const cClips = path.join(cRoot, "Shared Clips");
  const cLib = path.join(cRoot, "Lib.fcpbundle");
  fs.mkdirSync(cClips, { recursive: true });
  fs.mkdirSync(cLib, { recursive: true });
  {
    const c = await L.launch({
      label: "d5-C-cross",
      cwd: stub,
      seed: {
        "clipper.campaigns": [
          L.slugCampaign("client-a", "Client A", cClips, path.join(cRoot, "DataA"), { prefix: "AAA" }),
          // Client B inherits the same clips folder, which is what C-13 produces
          L.slugCampaign("client-b", "Client B", cClips, path.join(cRoot, "DataB"), { prefix: "BBB" }),
        ],
        "clipper.activeCampaign": "client-a",
        "clipper.clipsDir": cClips,
        "clipper.dataDirConfirmed": true,
        "clipper.saveDir": cClips,
        "clipper.saveDirs": [cClips],
        "clipper.editorHandoff": {
          "client-a": { afterCutting: "nothing", fcpLibrary: cLib, eventName: "campaign", mediaEvent: "", createProject: false, projectEvent: "", projectNamePattern: "{clipId}", capcutDropDir: "", openCapCut: false },
          "client-b": { afterCutting: "finalcut", fcpLibrary: cLib, eventName: "campaign", mediaEvent: "", createProject: false, projectEvent: "", projectNamePattern: "{clipId}", capcutDropDir: "", openCapCut: false },
        },
      },
    });
    await L.loadVideo(c.win);
    say("Client A, cut 1:", await L.cutOne(c.win, "00:00:02", "00:00:08"));
    await L.dismissToast(c.win);
    say("Client A, cut 2:", await L.cutOne(c.win, "00:00:12", "00:00:18"));
    await L.dismissToast(c.win);
    say("folder:", fs.readdirSync(cClips));

    // switch to Client B
    await c.win.click("#ui-campaign-chip");
    await c.win.waitForTimeout(300);
    await c.win.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find(
        (x) => !/^(Edit|Remove)/.test(x.getAttribute("aria-label") || "") && (x.textContent || "").trim().startsWith("Client B"),
      );
      if (b) b.click();
    });
    await c.win.waitForTimeout(1000);
    await c.win.keyboard.press("Escape");
    await c.win.waitForTimeout(500);
    say("active campaign now:", c.state()["clipper.activeCampaign"]);
    await openHandoff(c);
    const noteB = await handoffStatus(c);
    say("the panel's own 'Send all puts ... (N)' note while Client B is active:", noteB.sendAllNote);
    say("Client B, cut 1 (automatic send is on for B):", await L.cutOne(c.win, "00:00:22", "00:00:28"));
    await c.win.waitForTimeout(4000);
    say("messages:", await L.messages(c.win));
    say("handoff status:", await handoffStatus(c));
    const docs = fs.readdirSync(cClips).filter((f) => f.endsWith(".fcpxml"));
    say("documents written:", docs);
    for (const d of docs) {
      const p = path.join(cClips, d);
      const s = docSummary(p);
      say(`  ${d}:`, s);
      fs.copyFileSync(p, path.join(c.outDir, `C-${d}`));
      const foreign = s.clipIds.filter((id) => id.startsWith("AAA-"));
      if (/Client B/.test(d)) {
        say(`  VERDICT: Client B's document holds Client A's clips:`, foreign.length ? `YES — ${foreign.join(", ")}` : "no");
      }
    }
    await c.shot("C-cross-campaign");
    say("page errors:", c.logs.pageErrors.slice(0, 4));
    await c.close();
  }

  // ================================================== PART D — delete mid-cut
  say("");
  say("================ PART D — regression: the campaign is deleted while its clip is cutting");
  const dRoot = path.join(ROOT, "D");
  const dClips = path.join(dRoot, "Clips");
  fs.mkdirSync(dClips, { recursive: true });
  L.writeCfg(path.join(ROOT, "stub"), { delayMs: 6000 });
  {
    const d = await L.launch({
      label: "d5-D-delete-midcut",
      cwd: stub,
      seed: {
        "clipper.campaigns": [
          L.slugCampaign("acme-q4", "Acme Q4", dClips, path.join(dRoot, "Data"), { prefix: "ACM" }),
          L.slugCampaign("keep", "Keeper", dClips, path.join(dRoot, "Data2"), { prefix: "KEE" }),
        ],
        "clipper.activeCampaign": "acme-q4",
        "clipper.bank": { "acme-q4": { stub0000001: [L.bankRow("A01", 60, 90, "banked row", "hook", "T1")] } },
        "clipper.clipsDir": dClips,
        "clipper.dataDirConfirmed": true,
        "clipper.saveDir": dClips,
        "clipper.saveDirs": [dClips],
      },
    });
    await L.loadVideo(d.win);
    await L.mark(d.win, "00:00:02", "00:00:08");
    await d.win.click("#ui-add-segment");
    await d.win.click("#ui-cut");
    await d.win.waitForTimeout(2000);
    say("deleting the campaign while the download runs");
    await d.win.click("#ui-campaign-chip");
    await d.win.waitForTimeout(300);
    await d.win.click('button[aria-label="Remove Acme Q4"]');
    await d.win.waitForTimeout(250);
    await d.win.click('button[aria-label="Remove Acme Q4"]');
    await d.win.waitForTimeout(400);
    await d.win.keyboard.press("Escape");
    await d.win
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('[role="status"],[role="alert"]')).some((n) =>
            /Clip saved|Error|could not|failed/i.test(n.textContent || ""),
          ),
        null,
        { timeout: 120000 },
      )
      .catch(() => {});
    await d.win.waitForTimeout(2000);
    const st = d.state();
    say("messages:", await L.messages(d.win));
    say("campaigns now:", (st["clipper.campaigns"] || []).map((x) => [x.id, x.name]));
    say("clips folder:", fs.readdirSync(dClips));
    say("bank now:", Object.keys(st["clipper.bank"] || {}));
    say("used ranges recorded against the dead campaign:",
      JSON.stringify((st["clipper.campaigns"] || []).map((x) => [x.name, x.usedRanges])));
    say("downloads list:", (st["clipper.downloads"] || []).map((x) => x.label));
    say("page errors:", d.logs.pageErrors.slice(0, 6));
    await d.shot("D-deleted-midcut");
    await d.close();
  }

  log.flush();
})().catch((e) => {
  say("SCRIPT FAILED: " + String(e.stack || e));
  log.flush();
  process.exit(1);
});
