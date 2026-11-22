/**
 * v-b4-marks.cjs — B-4. Do sub-second decimals and non-numeric text silently
 * become a whole-video segment?
 *
 * Written from the finding's Steps. For each input pair it records the Length
 * readout, aria-invalid on both fields, whether Add segment is enabled, the row
 * that Add produces, whether Cut is then enabled, and (for the decimals case)
 * what happens when Cut is pressed: any alert, and any file on disk.
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a node v-b4-marks.cjs
 */
const fs = require("node:fs");
const { boot, loadUrl } = require("./v-lib.cjs");

const CLIPS = "/tmp/v-b4-clips";

const probe = () =>
  (() => {
    const vis = (el) => el && el.offsetParent !== null;
    const pick = (s) => [...document.querySelectorAll(s)].find(vis) || null;
    const inF = pick("#ui-mark-in");
    const outF = pick("#ui-mark-out");
    const add = pick("#ui-add-segment");
    const cut = pick("#ui-cut");
    const total = pick("#ui-stitched-total");
    return {
      shown: { in: inF?.value, out: outF?.value },
      ariaInvalid: [inF?.getAttribute("aria-invalid"), outF?.getAttribute("aria-invalid")],
      length: total ? total.innerText.trim() : null,
      addDisabled: add ? add.disabled : null,
      cutDisabled: cut ? cut.disabled : null,
      rows: [...document.querySelectorAll("li")]
        .map((li) => li.innerText.replace(/\s+/g, " ").trim())
        .filter((t) => /\d\d:\d\d:\d\d to \d\d:\d\d:\d\d/.test(t)),
      messages: [...document.querySelectorAll('[role="status"], [role="alert"]')]
        .filter(vis)
        .map((e) => e.innerText.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    };
  })();

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const a = await boot({
    label: "v-b4-marks",
    stubRoot: process.env.STUB,
    viewport: { width: 1440, height: 1250 }, // tall, so B-3 cannot interfere
    seed: { "clipper.dataDirConfirmed": true, "clipper.clipsDir": CLIPS },
  });
  const set = async (i, o) => {
    await a.win.locator("#ui-mark-in:visible").first().fill(i);
    await a.win.locator("#ui-mark-out:visible").first().fill(o);
    await a.win.waitForTimeout(500);
  };
  try {
    await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
    await a.win.waitForTimeout(1200);
    a.log("source chip:", await a.win.evaluate(() => {
      const c = [...document.querySelectorAll("#ui-source-chip")].find((e) => e.offsetParent);
      return c ? c.innerText.replace(/\s+/g, " ").trim() : null;
    }));

    for (const [i, o, name] of [
      ["00:00:10", "00:00:20", "control: a plain valid range"],
      ["10.5", "20.25", "sub-second decimals"],
      ["abc", "def", "letters"],
      ["-5", "00:00:20", "negative in"],
    ]) {
      await a.win.reload();
      await a.win.waitForTimeout(3500);
      await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
      await a.win.waitForTimeout(1200);
      await set(i, o);
      const before = await a.win.evaluate(probe);
      a.log(`[${name}] in="${i}" out="${o}" BEFORE Add:`, before);
      if (!before.addDisabled) {
        await a.win.locator("#ui-add-segment:visible").first().click();
        await a.win.waitForTimeout(600);
        a.log(`[${name}] AFTER Add:`, await a.win.evaluate(probe));
      }
      await a.shot(name.replace(/[^a-z]+/gi, "-"));
    }

    // The decimals case, carried all the way to a cut.
    await a.win.reload();
    await a.win.waitForTimeout(3500);
    await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
    await a.win.waitForTimeout(1200);
    await set("10.5", "20.25");
    await a.win.locator("#ui-add-segment:visible").first().click();
    await a.win.waitForTimeout(500);
    const beforeCut = await a.win.evaluate(probe);
    a.log("decimals, about to cut:", beforeCut);
    if (!beforeCut.cutDisabled) {
      await a.win.locator("#ui-cut:visible").first().click();
      await a.win.waitForTimeout(12000);
      a.log("after Cut:", await a.win.evaluate(probe));
      a.log("files in the clips folder:", fs.readdirSync(CLIPS));
      await a.shot("after-cut");
    }
  } finally {
    a.log("PROOF:", a.writeLog());
    await a.close();
  }
})();
