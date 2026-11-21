/**
 * F-03b: can the help button actually be CLICKED in each state?
 * Real Playwright clicks with a short timeout, plus the sign-in modal and the
 * full-screen OverlayLoader-style restoring overlay.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

async function tryClick(win, label, rows) {
  let ok = true;
  let err = "";
  try {
    await win.click("#ui-help-button", { timeout: 2500 });
  } catch (e) {
    ok = false;
    err = String(e).split("\n")[0];
  }
  const drawer = await win.evaluate(() => Boolean(document.getElementById("ui-help-drawer")));
  rows.push({ state: label, clickSucceeded: ok, drawerOpenAfter: drawer, err });
  console.log(`${label.padEnd(34)} click=${ok} drawer=${drawer} ${err}`);
  return ok;
}

(async () => {
  const rows = [];
  // ---- 1. signed-out boot: what does the app show? ----
  const b = await L.boot("F-03b-signedout", { signedOut: true });
  try {
    await b.win.setViewportSize({ width: 1440, height: 900 });
    await b.win.waitForTimeout(3000);
    const st = await b.win.evaluate(() => ({
      dialog: Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')),
      dialogLabel: document.querySelector('[role="dialog"][aria-modal="true"]')?.getAttribute("aria-labelledby"),
      chip: [...document.querySelectorAll("button,span")].map((e) => e.textContent.trim()).find((t) => /signed|connect|sign in/i.test(t)),
      cookieFileSeen: null,
    }));
    console.log("SIGNED-OUT BOOT STATE:", JSON.stringify(st));
    console.log("SHOT", await b.shot("signedout-boot"));
    await tryClick(b.win, "signed-out boot", rows);
  } finally {
    await b.close();
  }

  // ---- 2. signed in: overlays ----
  const a = await L.boot("F-03b-overlays");
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await tryClick(a.win, "plain workspace (open)", rows);
    await tryClick(a.win, "plain workspace (close)", rows);

    await a.win.click("#ui-copy-blocks");
    await a.win.waitForTimeout(500);
    await tryClick(a.win, "Copy blocks overlay open", rows);
    console.log("SHOT", await a.shot("copyblocks-help-blocked"));
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(400);

    await a.win.click("#ui-symbols");
    await a.win.waitForTimeout(500);
    await tryClick(a.win, "Symbols overlay open", rows);
    console.log("SHOT", await a.shot("symbols-help-blocked"));
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(400);

    // Help drawer open + Copy blocks on top of it
    await a.win.click("#ui-help-button");
    await a.win.waitForTimeout(400);
    await a.win.click("#ui-copy-blocks");
    await a.win.waitForTimeout(600);
    const cover = await a.win.evaluate(() => {
      const d = document.getElementById("ui-help-drawer");
      if (!d) return { drawer: false };
      const r = d.getBoundingClientRect();
      const pts = [
        [r.left + 20, r.top + 40],
        [r.left + r.width / 2, r.top + r.height / 2],
      ];
      return {
        drawer: true,
        covered: pts.map(([x, y]) => {
          const t = document.elementFromPoint(x, y);
          return t && !d.contains(t) ? `${t.tagName.toLowerCase()}.${String(t.className).slice(0, 40)}` : null;
        }),
      };
    });
    console.log("HELP DRAWER COVERED BY COPY BLOCKS:", JSON.stringify(cover));
    rows.push({ state: "help drawer under Copy blocks", ...cover });
    console.log("SHOT", await a.shot("drawer-under-copyblocks"));
  } finally {
    const out = path.join(L.OUT, "F-03b-overlays", "clicks.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log("REPORT", out);
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
