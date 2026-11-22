/**
 * E/T10 — the count field and the parts checkboxes, driven with real keys
 * (setting .value from script does not reach a React controlled input).
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const CHANNEL = "https://www.youtube.com/@stubchannel";

(async () => {
  L.useShape("owner-star");
  const root = L.stubRoot("t10");
  L.writeStub(root, { info: L.channelInfo({ count: 2 }), vtt: "", exitCode: 0, writeMedia: false });
  const saveDir = "/tmp/area-E-save/t10";
  fs.rmSync(saveDir, { recursive: true, force: true });
  fs.mkdirSync(saveDir, { recursive: true });
  const outDir = path.join(L.OUT, "t10-count");
  const a = await L.launchApp({
    label: "t10-count", outDir, cwd: root,
    seed: { "clipper.dataDirConfirmed": true, "clipper.dataDir": saveDir, "clipper.clipsDir": saveDir },
  });
  const r = {};
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    await L.signIn(a);
    await a.win.click("#ui-channel-link");
    await a.win.waitForSelector('button:has-text("Export channel")', { timeout: 15000 });
    const urlBox = a.win.locator('input[placeholder="https://www.youtube.com/@channelhandle"]');
    const numBox = a.win.locator('input[type="number"]');
    const btn = a.win.locator('button:has-text("Export channel")');
    const snap = async (tag) => ({
      tag,
      field: await numBox.inputValue(),
      estimate: await a.win.evaluate(() => {
        const m = document.body.innerText.match(
          /Set how many videos to export above\.|A run of [^.]*\.|Exporting every video[^.]*\./);
        return m ? m[0] : null;
      }),
      topNNote: await a.win.evaluate(() => {
        const m = document.body.innerText.match(/A "Top [^"]*" run still reads view\s*counts[^.]*\./);
        return m ? m[0].replace(/\s+/g, " ") : null;
      }),
      disabled: await btn.isDisabled(),
    });

    await urlBox.fill(CHANNEL);
    r.start = await snap("default 100");

    // clear the field with real keystrokes
    await numBox.click();
    await a.win.keyboard.press("Control+a");
    await a.win.keyboard.press("Backspace");
    await a.win.waitForTimeout(200);
    r.cleared = await snap("cleared");
    r.clearedShot = await a.shot("count-cleared");
    await btn.click();
    await a.win.waitForTimeout(600);
    r.clearedClick = {
      alert: await a.win.evaluate(() => {
        const el = document.querySelector('[role="alert"]');
        return el ? el.textContent.trim() : null;
      }),
      running: await a.win.evaluate(() => document.body.innerText.includes("Stop keeps everything")),
    };
    r.clearedClickShot = await a.shot("count-cleared-after-click");

    // type a non-numeric value with real keys
    await numBox.click();
    await a.win.keyboard.type("abc");
    await a.win.waitForTimeout(200);
    r.nonNumeric = await snap("typed abc");

    // 5, then 7000
    await numBox.click();
    await a.win.keyboard.press("Control+a");
    await a.win.keyboard.type("5");
    await a.win.waitForTimeout(150);
    r.five = await snap("5");
    await numBox.click();
    await a.win.keyboard.press("Control+a");
    await a.win.keyboard.type("7000");
    await a.win.waitForTimeout(150);
    r.sevenThousand = await snap("7000");
    r.sevenThousandHeavy = await a.win.evaluate(() =>
      document.body.innerText.includes("A run this size takes hours"));

    // ---- parts checkboxes ----------------------------------------------
    await numBox.click();
    await a.win.keyboard.press("Control+a");
    await a.win.keyboard.type("100");
    await a.win.waitForTimeout(150);
    const boxes = a.win.locator('input[type="checkbox"]');
    r.partsCount = await boxes.count();
    for (const label of ["Video details", "Comments", "Transcripts"]) {
      await a.win.locator(`label:has-text("${label}") input[type="checkbox"]`).first().uncheck();
    }
    await a.win.waitForTimeout(250);
    r.nothingSelected = {
      warning: await a.win.evaluate(() => {
        const m = document.body.innerText.match(/Nothing selected\. Tick at least one\./);
        return m ? m[0] : null;
      }),
      disabled: await btn.isDisabled(),
    };
    r.nothingSelectedShot = await a.shot("nothing-selected");
    // untick only video details, keep the numeric limit: the "still reads view
    // counts" note should appear
    await a.win.locator('label:has-text("Transcripts") input[type="checkbox"]').first().check();
    await a.win.waitForTimeout(200);
    r.transcriptsOnly = await snap("transcripts only, limit 100");
    r.transcriptsOnlyShot = await a.shot("transcripts-only");
  } catch (e) {
    r.error = String(e).slice(0, 600);
    r.shotError = await a.shot("error");
  } finally {
    r.pageErrors = a.logs.pageErrors;
    await a.close();
  }
  console.log(JSON.stringify(r, null, 2));
  L.save(outDir, "report.json", r);
})();
