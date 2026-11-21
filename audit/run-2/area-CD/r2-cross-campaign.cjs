/**
 * r2-cross-campaign.cjs — the owner runs several client campaigns a day and
 * switches constantly; data must never cross between them. These are the
 * crossings that the identity change did not cover.
 *
 * Part A  cut a BANKED clip from the clips column, then switch campaign while
 *         the download is still running. The bank status is written against the
 *         campaign the cut started in, but the used-ranges record is not: it is
 *         written against whichever campaign is active when the cut finishes.
 *         Control: the same sequence with no switch.
 * Part B  the same thing for the main Cut button (App.tsx passes the campaign
 *         id it started with), as a comparison.
 * Part C  the handoff panel's session list across a switch: whose clips does
 *         "Send all" offer to send?
 *
 * xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-2/area-CD/r2-cross-campaign.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./cdlib.cjs");

const ROOT = path.join(L.SCRATCH, "r2");
const VID = "stub0000001";
const log = L.mkLogger(path.join(__dirname, "out", "r2-cross-campaign.txt"));
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
function used(st) {
  return (st["clipper.campaigns"] || []).map((c) => [c.name, JSON.stringify(c.usedRanges)]);
}
function bank(st) {
  const b = st["clipper.bank"] || {};
  return Object.fromEntries(
    Object.entries(b).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([vid, rows]) => [vid, rows.map((r) => [r.id, r.status])]))]),
  );
}

function seed(clipsA, clipsB, dataA, dataB) {
  return {
    "clipper.campaigns": [
      L.slugCampaign("client-a", "Client A", clipsA, dataA, { prefix: "AAA" }),
      L.slugCampaign("client-b", "Client B", clipsB, dataB, { prefix: "BBB" }),
    ],
    "clipper.activeCampaign": "client-a",
    "clipper.bank": {
      "client-a": { [VID]: [L.bankRow("A01", 2, 8, "client A banked clip", "hook", "T1")] },
      "client-b": { [VID]: [L.bankRow("B01", 30, 36, "client B banked clip", "payoff", "T2")] },
    },
    "clipper.clipsDir": clipsA,
    "clipper.dataDirConfirmed": true,
    "clipper.saveDir": clipsA,
    "clipper.saveDirs": [clipsA, clipsB],
  };
}

async function cutBanked(a, rowId) {
  await a.win.click("#clips-tab-bank").catch(() => {});
  await a.win.waitForTimeout(500);
  const clicked = await a.win.evaluate((id) => {
    const rows = Array.from(document.querySelectorAll("#clips-panel [role='button']"));
    const row = rows.find((r) => (r.innerText || "").includes(id));
    if (!row) return "row not found";
    const b = Array.from(row.querySelectorAll("button")).find((x) => /^Cut$/.test((x.textContent || "").trim()));
    if (!b) return "cut button not found";
    b.click();
    return "clicked";
  }, rowId);
  return clicked;
}

(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const stub = L.makeStubRoot(path.join(ROOT, "stub"), { delayMs: 8000 });

  for (const variant of ["switch", "control"]) {
    say("");
    say(`================ PART A (${variant}) — cut a banked clip, ${variant === "switch" ? "then switch campaign mid-cut" : "no switch"}`);
    const r = path.join(ROOT, `A-${variant}`);
    const ca = path.join(r, "Client A clips");
    const cb = path.join(r, "Client B clips");
    [ca, cb].forEach((d) => fs.mkdirSync(d, { recursive: true }));
    const a = await L.launch({ label: `r2-A-${variant}`, cwd: stub, seed: seed(ca, cb, path.join(r, "da"), path.join(r, "db")) });
    await L.loadVideo(a.win);
    say("before — used:", used(a.state()));
    say("before — bank:", bank(a.state()));
    say("Cut on the banked row A01:", await cutBanked(a, "A01"));
    await a.win.waitForTimeout(2500);
    if (variant === "switch") {
      say("switching to Client B while the cut runs");
      await switchTo(a, "Client B");
      say("active campaign:", a.state()["clipper.activeCampaign"]);
    }
    await a.win
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('[role="status"],[role="alert"]')).some((n) =>
            /Clip saved|Error|could not|was not cut|failed/i.test(n.textContent || ""),
          ),
        null,
        { timeout: 180000 },
      )
      .catch(() => {});
    await a.win.waitForTimeout(3000);
    const st = a.state();
    say("messages:", await L.messages(a.win));
    say("after — used ranges per campaign:", used(st));
    say("after — bank statuses:", bank(st));
    say("after — Client A folder:", fs.readdirSync(ca), "| Client B folder:", fs.readdirSync(cb));
    const ur = (st["clipper.campaigns"] || []).map((c) => [c.name, Object.values(c.usedRanges || {}).flat().map((u) => u.clipId)]);
    say("after — which campaign holds the used range for A01:", JSON.stringify(ur));
    if (variant === "switch") {
      const b = (st["clipper.campaigns"] || []).find((c) => c.name === "Client B");
      const leaked = JSON.stringify(b?.usedRanges || {}).includes("A01");
      say("VERDICT:", leaked ? "Client A's clip was recorded against CLIENT B (data crossed)" : "no crossing");
    }
    await a.shot(`A-${variant}`);
    say("page errors:", a.logs.pageErrors.slice(0, 4));
    await a.close();
  }

  // ================================================== PART B — main Cut button
  say("");
  say("================ PART B — the main Cut button, switching mid-cut (comparison)");
  {
    const r = path.join(ROOT, "B");
    const ca = path.join(r, "Client A clips");
    const cb = path.join(r, "Client B clips");
    [ca, cb].forEach((d) => fs.mkdirSync(d, { recursive: true }));
    const a = await L.launch({ label: "r2-B-maincut", cwd: stub, seed: seed(ca, cb, path.join(r, "da"), path.join(r, "db")) });
    await L.loadVideo(a.win);
    await L.mark(a.win, "00:00:12", "00:00:18");
    await a.win.click("#ui-add-segment");
    await a.win.click("#ui-cut");
    await a.win.waitForTimeout(2500);
    await switchTo(a, "Client B");
    await a.win
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('[role="status"],[role="alert"]')).some((n) =>
            /Clip saved|Error|could not|failed/i.test(n.textContent || ""),
          ),
        null,
        { timeout: 180000 },
      )
      .catch(() => {});
    await a.win.waitForTimeout(2500);
    const st = a.state();
    say("messages:", await L.messages(a.win));
    say("used ranges per campaign:", used(st));
    say("Client A folder:", fs.readdirSync(ca), "| Client B folder:", fs.readdirSync(cb));
    say("downloads:", (st["clipper.downloads"] || []).map((d) => [d.label, path.basename(d.dir || "")]));
    await a.shot("B-maincut");
    await a.close();
  }

  // ================================================== PART C — session clips
  say("");
  say("================ PART C — whose clips does the handoff panel offer after a switch?");
  {
    const r = path.join(ROOT, "C");
    const ca = path.join(r, "Client A clips");
    const cb = path.join(r, "Client B clips");
    [ca, cb].forEach((d) => fs.mkdirSync(d, { recursive: true }));
    L.writeCfg(path.join(ROOT, "stub"), {});
    const a = await L.launch({ label: "r2-C-session", cwd: stub, seed: seed(ca, cb, path.join(r, "da"), path.join(r, "db")) });
    await L.loadVideo(a.win);
    say("Client A cut:", await L.cutOne(a.win, "00:00:12", "00:00:18"));
    await L.dismissToast(a.win);
    const note = async () =>
      a.win.evaluate(() => {
        const sec = Array.from(document.querySelectorAll("section")).find((s) => (s.getAttribute("aria-label") || "") === "Editor handoff");
        if (!sec) return "no panel";
        const b = sec.querySelector("button[aria-expanded]");
        if (b && b.getAttribute("aria-expanded") === "false") b.click();
        return new Promise((res) =>
          setTimeout(() => {
            res({
              sendAll: Array.from(sec.querySelectorAll("p")).map((p) => (p.textContent || "").trim()).filter((t) => /Send all puts/.test(t)),
              copyPathDisabled: Array.from(sec.querySelectorAll("button")).filter((x) => /Copy file path/.test(x.textContent || "")).map((x) => x.disabled),
              projectPreview: Array.from(sec.querySelectorAll("span")).map((s) => (s.textContent || "").trim()).filter((t) => /^Use \{clipId\}/.test(t)),
            });
          }, 700),
        );
      });
    say("with Client A active:", await note());
    await switchTo(a, "Client B");
    say("with Client B active (its own bank has one row, no cuts yet):", await note());
    const copied = await a.win.evaluate(async () => {
      const sec = Array.from(document.querySelectorAll("section")).find((s) => (s.getAttribute("aria-label") || "") === "Editor handoff");
      const b = Array.from(sec.querySelectorAll("button")).find((x) => /Copy file path/.test(x.textContent || ""));
      if (!b || b.disabled) return "<disabled>";
      b.click();
      await new Promise((r) => setTimeout(r, 500));
      return navigator.clipboard.readText().catch((e) => `<clipboard failed: ${e.message}>`);
    });
    say("Copy file path while CLIENT B is active returns:", copied);
    say("VERDICT:", typeof copied === "string" && copied.includes("Client A clips")
      ? "Client A's file paths are handed out under Client B (data crossed)"
      : "no crossing");
    await a.shot("C-session-clips");
    say("page errors:", a.logs.pageErrors.slice(0, 4));
    await a.close();
  }

  log.flush();
})().catch((e) => {
  say("SCRIPT FAILED: " + String(e.stack || e));
  log.flush();
  process.exit(1);
});
