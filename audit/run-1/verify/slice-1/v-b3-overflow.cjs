/**
 * v-b3-overflow.cjs — B-3. From the second segment on, does the preview panel
 * overflow downwards and swallow clicks on In/Out and Add segment?
 *
 * Written from the finding's Steps. For each of 0..5 segments it records the
 * preview panel box, the aspect-video box, the In field and Add button boxes,
 * what document.elementFromPoint returns at the centre of each, and whether a
 * REAL mouse click on Add segment actually adds a row. Segments are added by
 * the keyboard shortcut when the button cannot be clicked, so the run can
 * continue. Also run at a taller viewport to see whether this is only
 * "the window is too short".
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a --server-args="-screen 0 WxHx24" \
 *          node v-b3-overflow.cjs <width> <height>
 */
const { boot, loadUrl } = require("./v-lib.cjs");

const W = Number(process.argv[2] || 1440);
const H = Number(process.argv[3] || 900);

const geom = () => {
  const vis = (el) => el && el.offsetParent !== null;
  const pick = (sel) => [...document.querySelectorAll(sel)].find(vis) || null;
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
  };
  const at = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      Math.round(r.left + r.width / 2),
      Math.round(r.top + r.height / 2),
    );
    if (!hit) return "nothing (outside the viewport)";
    if (hit === el || el.contains(hit)) return "ITSELF";
    return `${hit.tagName}.${(hit.className || "").toString().slice(0, 48)}`;
  };
  const centre = pick("#ui-col-centre");
  const aspect = centre ? centre.querySelector(".aspect-video") : null;
  const panel = aspect ? aspect.closest("#ui-col-centre > *") || aspect.parentElement : null;
  const addBtn = pick("#ui-add-segment");
  const inField = pick("#ui-mark-in");
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    previewPanel: box(panel),
    aspectBox: box(aspect),
    inField: box(inField),
    addBtn: box(addBtn),
    hitAdd: at(addBtn),
    hitIn: at(inField),
    rows: [...document.querySelectorAll("li")]
      .map((li) => li.innerText.replace(/\s+/g, " ").trim())
      .filter((t) => /\d\d:\d\d:\d\d to \d\d:\d\d:\d\d/.test(t)).length,
  };
};

(async () => {
  const a = await boot({
    label: `v-b3-${W}x${H}`,
    stubRoot: process.env.STUB,
    viewport: { width: W, height: H },
  });
  try {
    await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
    await a.win.waitForTimeout(1500);
    a.log(`viewport ${W}x${H}`);
    a.log("0 segments:", await a.win.evaluate(geom));
    await a.shot("00-segments");

    for (let n = 1; n <= 5; n++) {
      const inSec = n * 10;
      const marks = [
        new Date(inSec * 1000).toISOString().slice(11, 19),
        new Date((inSec + 5) * 1000).toISOString().slice(11, 19),
      ];
      await a.win.locator("#ui-mark-in:visible").first().fill(marks[0]);
      await a.win.locator("#ui-mark-out:visible").first().fill(marks[1]);

      const before = await a.win.evaluate(geom);
      let clickResult;
      try {
        // A REAL mouse click, not element.click(): this is what the user does.
        await a.win.locator("#ui-add-segment:visible").first().click({ timeout: 4000 });
        const after = await a.win.evaluate(geom);
        clickResult =
          after.rows > before.rows ? "MOUSE CLICK WORKED" : "CLICK LANDED BUT NO ROW APPEARED";
      } catch (e) {
        clickResult = `MOUSE CLICK REFUSED (${e.message.split("\n")[0].slice(0, 90)})`;
      }
      if ((await a.win.evaluate(geom)).rows < n) {
        // Fall back to the shortcut shown on the button itself, so the run goes on.
        await a.win.keyboard.press("Control+Shift+Enter");
        await a.win.waitForTimeout(400);
      }
      const g = await a.win.evaluate(geom);
      a.log(`${n} segment(s): ${clickResult}`, g);
      if (n === 2 || n === 5) await a.shot(`${n}-segments`);
    }

    // Can the user simply scroll the button out from under the preview?
    const scrolled = await a.win.evaluate(() => {
      const b = [...document.querySelectorAll("#ui-add-segment")].find((e) => e.offsetParent);
      b.scrollIntoView({ block: "center" });
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(
        Math.round(r.left + r.width / 2),
        Math.round(r.top + r.height / 2),
      );
      return {
        box: { top: Math.round(r.top), bottom: Math.round(r.bottom) },
        hit: hit === b || b.contains(hit) ? "ITSELF" : `${hit?.tagName}.${(hit?.className || "").toString().slice(0, 48)}`,
      };
    });
    a.log("after scrollIntoView on Add segment:", scrolled);
    await a.shot("after-scroll");

    a.log("visible keyboard hint on the Add button:", await a.win.evaluate(() => {
      const b = [...document.querySelectorAll("#ui-add-segment")].find((e) => e.offsetParent);
      return b ? { text: b.innerText.replace(/\s+/g, " ").trim(), keyshortcuts: b.getAttribute("aria-keyshortcuts") } : null;
    }));
  } finally {
    a.log("PROOF:", a.writeLog());
    await a.close();
  }
})();
