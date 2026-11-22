// Cut under A (auto Final Cut send ON), switch to B (send OFF) while it runs. Which settings apply?
const fs = require("node:fs"); const path = require("node:path"); const L = require("./cdlib.cjs");
const ROOT = path.join(L.SCRATCH, "ra-midcut");
async function switchTo(a, name) {
  await a.win.click("#ui-campaign-chip"); await a.win.waitForTimeout(300);
  await a.win.evaluate((n) => { const b = Array.from(document.querySelectorAll("button")).find((x) => !/^(Edit|Remove)/.test(x.getAttribute("aria-label") || "") && (x.textContent || "").trim().startsWith(n)); if (b) b.click(); }, name);
  await a.win.waitForTimeout(700); await a.win.keyboard.press("Escape"); await a.win.waitForTimeout(300);
}
(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const stub = L.makeStubRoot(path.join(ROOT, "stub"), { delayMs: 8000 });
  const ca = path.join(ROOT, "A clips"), cb = path.join(ROOT, "B clips"), lib = path.join(ROOT, "Lib.fcpbundle");
  [ca, cb, lib].forEach((d) => fs.mkdirSync(d, { recursive: true }));
  const h = (after) => ({ afterCutting: after, fcpLibrary: lib, eventName: "campaign", mediaEvent: "", createProject: false, projectEvent: "", projectNamePattern: "{clipId}", capcutDropDir: "", openCapCut: false });
  const a = await L.launch({ label: "ra-midcut", cwd: stub, seed: {
    "clipper.campaigns": [L.slugCampaign("client-a", "Client A", ca, path.join(ROOT, "da"), { prefix: "AAA" }), L.slugCampaign("client-b", "Client B", cb, path.join(ROOT, "db"), { prefix: "BBB" })],
    "clipper.activeCampaign": "client-a", "clipper.clipsDir": ca, "clipper.dataDirConfirmed": true, "clipper.saveDir": ca, "clipper.saveDirs": [ca, cb],
    "clipper.editorHandoff": { "client-a": h("finalcut"), "client-b": h("nothing") } } });
  await L.loadVideo(a.win);
  await L.mark(a.win, "00:00:12", "00:00:18"); await a.win.click("#ui-add-segment"); await a.win.click("#ui-cut");
  await a.win.waitForTimeout(2500); await switchTo(a, "Client B");
  await a.win.waitForFunction(() => Array.from(document.querySelectorAll('[role="status"],[role="alert"]')).some((n) => /Clip saved|Error|failed/i.test(n.textContent || "")), null, { timeout: 120000 }).catch(() => {});
  await a.win.waitForTimeout(4000);
  console.log("A folder:", fs.readdirSync(ca), "| B folder:", fs.readdirSync(cb));
  console.log("VERDICT:", fs.existsSync(path.join(ca, "Client A.fcpxml")) ? "A's cut used A's After-cutting setting (Client A.fcpxml written)" : "A's cut did NOT get A's setting (no Client A.fcpxml)");
  await a.close();
})();
