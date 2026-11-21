/**
 * F-03: help button presence and position.
 *  - same place on the workspace screen and the channel screen
 *  - same place with each overlay open
 *  - at 1024x768, 1440x900 and a narrow 900px width
 *  - reachable (not covered) in each state
 *
 * Run twice: default (public build) and --channel (channel-data build, owner=*)
 * because the channel screen only exists in the latter.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const CHANNEL = process.argv.includes("--channel");
const LABEL = CHANNEL ? "F-03-position-channel" : "F-03-position";

const MEASURE = () => {
  const b = document.getElementById("ui-help-button");
  if (!b) return { present: false };
  const r = b.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  const header = document.querySelector("header")?.getBoundingClientRect();
  return {
    present: true,
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.round(r.width),
    h: Math.round(r.height),
    // Distance from the viewport's right/top edge: what "same place" means for
    // a right-aligned header item under a changing viewport.
    fromRight: Math.round(innerWidth - r.right),
    fromTop: Math.round(r.top),
    // Last item in the header?
    isLastHeaderChild: (() => {
      const h = document.querySelector("header");
      return h ? h.lastElementChild === b || h.lastElementChild?.contains(b) : null;
    })(),
    headerBox: header ? { y: Math.round(header.y), h: Math.round(header.height) } : null,
    viewport: { w: innerWidth, h: innerHeight },
    reachable: Boolean(top && (top === b || b.contains(top) || top.contains(b))),
    coveredBy: top && !(top === b || b.contains(top) || top.contains(b))
      ? `${top.tagName.toLowerCase()}#${top.id}.${String(top.className).slice(0, 50)}`
      : null,
    ariaExpanded: b.getAttribute("aria-expanded"),
  };
};

async function measure(a, name, rows) {
  await a.win.waitForTimeout(350);
  const m = await a.win.evaluate(MEASURE);
  rows.push({ state: name, ...m });
  const shot = await a.shot(name.replace(/[^a-z0-9]+/gi, "-").toLowerCase());
  rows[rows.length - 1].shot = shot;
  return m;
}

(async () => {
  const a = await L.boot(LABEL, { appRoot: CHANNEL ? "/tmp/f-app-channel" : "/tmp/f-app" });
  const rows = [];
  try {
    for (const vp of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 900, height: 800 },
    ]) {
      await a.win.setViewportSize(vp);
      const tag = `${vp.width}x${vp.height}`;
      await measure(a, `${tag} workspace-plain`, rows);

      // Each overlay in turn.
      await a.win.click("#ui-settings");
      await measure(a, `${tag} overlay-settings`, rows);
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(250);

      await a.win.click("#ui-campaign-chip");
      await measure(a, `${tag} overlay-campaign`, rows);
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(250);

      await a.win.click("#ui-copy-blocks");
      await measure(a, `${tag} overlay-copyblocks`, rows);
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(250);

      await a.win.click("#ui-symbols");
      await measure(a, `${tag} overlay-symbols`, rows);
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(250);

      await a.win.click("#ui-help-button");
      await measure(a, `${tag} overlay-helpdrawer`, rows);
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(250);

      if (CHANNEL) {
        const hasLink = await a.win.evaluate(() => Boolean(document.getElementById("ui-channel-link")));
        rows.push({ state: `${tag} channel-link-present`, present: hasLink });
        if (hasLink) {
          await a.win.click("#ui-channel-link");
          await measure(a, `${tag} screen-channel`, rows);
          await a.win.click("#ui-help-button");
          await measure(a, `${tag} screen-channel-helpopen`, rows);
          await a.win.keyboard.press("Escape");
          await a.win.waitForTimeout(200);
          await a.win.evaluate(() => {
            const b = [...document.querySelectorAll("button")].find((x) => /Back to clipping/.test(x.textContent));
            b?.click();
          });
          await a.win.waitForTimeout(400);
        }
      }
    }

    // Sign-in modal state: relaunch signed out.
    await a.close();
    const b = await L.boot(`${LABEL}-signedout`, {
      signedOut: true,
      appRoot: CHANNEL ? "/tmp/f-app-channel" : "/tmp/f-app",
      outDir: path.join(L.OUT, `${LABEL}-signedout`),
    });
    try {
      await b.win.setViewportSize({ width: 1440, height: 900 });
      await b.win.waitForTimeout(2500);
      const m = await b.win.evaluate(MEASURE);
      const shot = await b.shot("signin-modal-open");
      rows.push({ state: "1440x900 modal-signin", ...m, shot });
      // OverlayLoader state: force it by driving a channel comment export? Not
      // available in the public build; instead measure during the app's own
      // restoring overlay, captured immediately after a reload.
      await b.win.reload();
      await b.win.waitForTimeout(400);
      const m2 = await b.win.evaluate(MEASURE);
      rows.push({ state: "1440x900 restoring-overlay", ...m2, shot: await b.shot("restoring-overlay") });
    } finally {
      await b.close();
    }
  } finally {
    const out = path.join(L.OUT, LABEL, "positions.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log("REPORT", out);
    console.log("\nstate                                 present  x     y   fromRight fromTop  reachable  last");
    for (const r of rows) {
      console.log(
        `${r.state.padEnd(36)} ${String(r.present).padEnd(7)} ${String(r.x ?? "-").padEnd(5)} ${String(r.y ?? "-").padEnd(3)} ${String(r.fromRight ?? "-").padEnd(9)} ${String(r.fromTop ?? "-").padEnd(7)} ${String(r.reachable ?? "-").padEnd(10)} ${String(r.isLastHeaderChild ?? "-")}` +
          (r.coveredBy ? `  covered-by ${r.coveredBy}` : ""),
      );
    }
    // Consistency check per viewport.
    const byVp = {};
    for (const r of rows) {
      if (!r.present || r.x === undefined) continue;
      const vp = r.state.split(" ")[0];
      (byVp[vp] ||= []).push(r);
    }
    console.log("\nSame place within each viewport?");
    for (const [vp, list] of Object.entries(byVp)) {
      const set = new Set(list.map((r) => `${r.fromRight},${r.fromTop}`));
      console.log(`  ${vp}: ${set.size === 1 ? "YES" : "NO -> " + [...set].join(" | ")}`);
    }
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
