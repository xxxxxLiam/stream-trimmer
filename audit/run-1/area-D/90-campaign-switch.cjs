/**
 * Area D / "change the clips folder after a download has started".
 *
 * The clips folder is a property of the active campaign, so the only way a
 * user changes it without the native dialog is to switch campaign. Two
 * campaigns are seeded with different clips folders; a download is started
 * against one and the campaign is switched to the other while it runs.
 *
 * Also runs the 10 user stories' folder-related steps.
 * Changes no product code.
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, campaign, folders, SCRATCH } = require("./lib-D.cjs");
const { loadVideo, addSegment, cut } = require("./lib-cut.cjs");

const OUT = "/home/user/stream-trimmer/audit/run-1/area-D/out/switch";
const STUBJSON = `${SCRATCH}/stubD2/stub.json`;
const setStub = (p) => {
  const c = JSON.parse(fs.readFileSync(STUBJSON, "utf8"));
  fs.writeFileSync(STUBJSON, JSON.stringify({ ...c, ...p }, null, 2));
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  setStub({ delayMs: 0 });
  const A = folders("sw-a");
  const B = folders("sw-b");
  console.log("campaign ONE clips:", A.clips);
  console.log("campaign TWO clips:", B.clips);

  const a = await boot({
    label: "D-switch", outDir: OUT,
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.clipsDir": A.clips, "clipper.dataDir": A.data, "clipper.saveDir": A.clips,
      "clipper.campaigns": [
        campaign("one", "Campaign One", A.clips, A.data),
        campaign("two", "Campaign Two", B.clips, B.data),
      ],
      "clipper.activeCampaign": "one",
    },
  });
  const footer = async () => await a.win.evaluate(() => document.querySelector("footer")?.innerText.replace(/\n+/g, " | "));
  const alerts = async () => await a.win.evaluate(() =>
    Array.from(document.querySelectorAll('[role="alert"], [role="status"]')).map((e) => e.innerText.trim()).filter(Boolean));

  try {
    console.log("\nfooter on Campaign One:", await footer());
    await loadVideo(a);

    // ---------------------------------------- switch campaign with no download
    console.log("\n=== switching campaign re-points the clips folder ===");
    await a.win.click("#ui-campaign-chip");
    await a.win.waitForTimeout(500);
    console.log(await a.shot("campaign-menu"));
    const menu = await a.win.evaluate(() =>
      Array.from(document.querySelectorAll("button, [role='option'], li")).map((e) => e.innerText.trim()).filter((t) => /Campaign (One|Two)/.test(t)).slice(0, 8));
    console.log("menu entries:", JSON.stringify(menu));
    await a.win.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button, [role='option']")).find((e) => e.innerText.trim().startsWith("Campaign Two"));
      if (b) b.click();
    });
    await a.win.waitForTimeout(1200);
    console.log("footer now:", await footer());
    console.log("clipsDir persisted:", JSON.stringify(a.readState()["clipper.clipsDir"]));
    console.log(await a.shot("switched-to-two"));

    // ---------------------------------------- switch mid-download
    console.log("\n=== start a download on Campaign Two, then switch to One while it runs ===");
    setStub({ delayMs: 7000 });
    await loadVideo(a);
    await addSegment(a, 2, 8);
    await a.win.click("#ui-cut");
    await a.win.waitForTimeout(1500);
    console.log("switching campaign mid-download…");
    await a.win.click("#ui-campaign-chip");
    await a.win.waitForTimeout(400);
    await a.win.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button, [role='option']")).find((e) => e.innerText.trim().startsWith("Campaign One"));
      if (b) b.click();
    });
    await a.win.waitForTimeout(22000);
    console.log("footer after:", await footer());
    console.log("Campaign ONE clips folder:", fs.readdirSync(A.clips));
    console.log("Campaign TWO clips folder:", fs.readdirSync(B.clips));
    console.log("alerts:", JSON.stringify(await alerts(), null, 1));
    console.log(await a.shot("switched-mid-download"));
    setStub({ delayMs: 0 });

    // ---------------------------------------- the handoff panel after the switch
    console.log("\n=== the handoff panel after the switch: whose settings, whose folder? ===");
    const expanded = await a.win.locator('section[aria-label="Editor handoff"] button[aria-expanded]').getAttribute("aria-expanded");
    if (expanded !== "true") await a.win.click('section[aria-label="Editor handoff"] button[aria-expanded]');
    await a.win.waitForTimeout(500);
    console.log("event-name preview:", await a.win.evaluate(() => {
      const s = document.querySelector('section[aria-label="Editor handoff"]');
      return Array.from(s.querySelectorAll("label")).map((l) => l.innerText.replace(/\n+/g, " / ")).slice(0, 4);
    }));
    const exp = a.win.locator('button:text-is("Export FCPXML")');
    console.log("Export FCPXML disabled:", await exp.isDisabled());
    if (!(await exp.isDisabled())) {
      await exp.click();
      await a.win.waitForTimeout(3000);
      console.log("status:", await a.win.evaluate(() => {
        const s = document.querySelector('section[aria-label="Editor handoff"]');
        const el = s.querySelector('[role="status"], [role="alert"]');
        return el ? el.innerText.trim() : "<none>";
      }));
      console.log("ONE:", fs.readdirSync(A.clips), " TWO:", fs.readdirSync(B.clips));
      console.log("=> the editor file for a clip saved under Campaign Two can land in Campaign One's folder");
    }
    console.log(await a.shot("handoff-after-switch"));
    console.log("--- page errors ---", JSON.stringify(a.logs.pageErrors));
  } finally { await a.close(); }
  process.exit(0);
})().catch((e) => { console.error("SCRIPT FAILED:", e); process.exit(1); });
