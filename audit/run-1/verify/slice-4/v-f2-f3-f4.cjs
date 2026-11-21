#!/usr/bin/env node
/**
 * F-2, F-3, F-4 verification, from their Steps. My own scripts.
 *
 * F-2: with a second workspace tab active, every live anchor id exists twice
 *      and getElementById returns the hidden first tab's 0x0 copy, so the
 *      spotlight renders nothing.
 * F-3: #ui-help-button is covered and unclickable while Copy blocks or
 *      Symbols is open, and during the first-run sign-in modal.
 * F-4: an update error at <=1024px wraps the header and moves the help button
 *      out of the top-right corner.
 *
 * F-3 / F-4 are both "the help button is unreachable", so I measure the same
 * things for both (clickability, geometry, what covers it) in one script, to
 * judge whether they are one defect or two.
 *
 * usage: xvfb-run -a --server-args="-screen 0 1440x900x24" node v-f2-f3-f4.cjs [run]
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, cookieTxt, SIGNED_IN_STDERR } = require("./lib.cjs");
const { makeStub } = require("./mkstub.cjs");

const RUN = process.argv[2] || "1";
const STUB = `/tmp/s4-stub-f234-${RUN}`;

const SIGNED_IN = { exitCode: 0, stdout: SIGNED_IN_STDERR };
const QUIET = { exitCode: 0, stdout: "[download] 100% of 1.00MiB", stderr: "" };

const SEED = {
  "clipper.dataDirConfirmed": true,
  "clipper.authSource": "app",
  "clipper.campaigns": [{ id: "camp1", name: "Campaign One", clipsDir: "/tmp/s4-f-clips", dataDir: "/tmp/s4-f-data" }],
  "clipper.activeCampaign": "camp1",
};

const helpButtonGeometry = (win) =>
  win.evaluate(() => {
    const b = document.getElementById("ui-help-button");
    const header = document.querySelector("header");
    if (!b || !header) return null;
    const r = b.getBoundingClientRect();
    const hr = header.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      fromRight: Math.round(window.innerWidth - r.right),
      fromTop: Math.round(r.top),
      headerHeight: Math.round(hr.height),
      isLastHeaderChild: header.lastElementChild
        ? header.lastElementChild.contains(b) || header.lastElementChild === b
        : null,
      coveredBy: top ? `${top.tagName}.${String(top.className).slice(0, 70)}` : null,
      hitIsSelf: Boolean(top && (b === top || b.contains(top))),
      viewport: { w: window.innerWidth, h: window.innerHeight },
    };
  });

async function tryClick(win, sel, ms = 2500) {
  try {
    await win.click(sel, { timeout: ms });
    return "clicked";
  } catch (e) {
    return `BLOCKED: ${String(e).split("\n")[0].slice(0, 80)}`;
  }
}

(async () => {
  const report = { run: RUN };
  makeStub(STUB, { auth: { default: SIGNED_IN, app: SIGNED_IN }, channel: { captionLines: 12 } });

  /* ============================== F-2 ============================== */
  {
    const a = await launch({
      mirror: "/tmp/s4-public",
      label: `f2-${RUN}`,
      cwd: STUB,
      cookieFile: cookieTxt(),
      seed: SEED,
    });
    const r = {};
    try {
      await a.win.waitForSelector("header", { timeout: 30000 });
      await a.win.waitForTimeout(3000);
      r.tabsBefore = await a.win.evaluate(
        () => document.querySelectorAll('[role="tab"], [aria-label^="Close "]').length,
      );
      r.dupesOneTab = await a.win.evaluate(() => {
        const ids = ["ui-campaign-chip", "ui-footer-clips", "ui-footer-data", "ui-copy-blocks", "ui-symbols", "ui-source-chip", "ui-help-button", "help-search"];
        const out = {};
        for (const id of ids) out[id] = document.querySelectorAll(`[id="${id}"]`).length;
        return out;
      });
      // Open a second workspace tab.
      await a.win.click('button[aria-label="New tab"]', { timeout: 10000 });
      await a.win.waitForTimeout(1500);
      r.dupesTwoTabs = await a.win.evaluate(() => {
        const ids = ["ui-campaign-chip", "ui-footer-clips", "ui-footer-data", "ui-copy-blocks", "ui-symbols", "ui-source-chip", "ui-help-button", "ui-help-drawer", "help-search"];
        const out = {};
        for (const id of ids) {
          const all = Array.from(document.querySelectorAll(`[id="${id}"]`));
          const first = all[0]?.getBoundingClientRect();
          out[id] = {
            copies: all.length,
            firstRect: first ? { w: Math.round(first.width), h: Math.round(first.height) } : null,
            firstVisible: Boolean(first && first.width > 0 && first.height > 0),
            anyVisible: all.some((e) => {
              const rc = e.getBoundingClientRect();
              return rc.width > 0 && rc.height > 0;
            }),
          };
        }
        return out;
      });
      r.shotTwoTabs = await a.shot("two-tabs");

      // Run the four tutorials whose first anchor does exist, on the 2nd tab.
      const tasks = ["Switch campaign", "Change where clips save", "Copy a transcript for a chat", "Insert a symbol or honorific"];
      r.tutorials = {};
      // The 2nd tab's help button is the visible one; click by Playwright
      // (which picks a visible element).
      await a.win.getByRole("button", { name: "Help", exact: true }).last().click({ timeout: 5000 }).catch(async () => {
        await a.win.keyboard.press("Control+/");
      });
      await a.win.waitForTimeout(600);
      for (const title of tasks) {
        // Back to the list first, and let React re-render before picking.
        await a.win.evaluate(() => {
          const drawers = Array.from(document.querySelectorAll("#ui-help-drawer"));
          const visible = drawers.find((d) => d.getBoundingClientRect().width > 0) || drawers[0];
          Array.from(visible?.querySelectorAll("button") ?? [])
            .find((b) => (b.textContent || "").trim() === "All tasks")
            ?.click();
        });
        await a.win.waitForTimeout(400);
        const picked = await a.win.evaluate((t) => {
          const drawers = Array.from(document.querySelectorAll("#ui-help-drawer"));
          const visible = drawers.find((d) => d.getBoundingClientRect().width > 0) || drawers[0];
          if (!visible) return "no drawer";
          const b = Array.from(visible.querySelectorAll("[data-help-result]")).find((x) =>
            (x.textContent || "").includes(t),
          );
          if (!b) return "task not listed";
          b.click();
          return "picked";
        }, title);
        await a.win.waitForTimeout(700);
        r.tutorials[title] = {
          picked,
          ...(await a.win.evaluate(() => {
            const sp = document.querySelector("[data-help-spotlight]");
            const drawers = Array.from(document.querySelectorAll("#ui-help-drawer"));
            const visible = drawers.find((d) => d.getBoundingClientRect().width > 0) || drawers[0];
            return {
              spotlight: Boolean(sp),
              spotlightAnchor: sp ? sp.getAttribute("data-help-spotlight") : null,
              notice: /That control is not on screen right now/.test(visible?.textContent || ""),
            };
          })),
        };
      }
      r.shotTutorial = await a.shot("two-tabs-tutorial");
    } catch (e) {
      r.error = String(e);
    }
    await a.close();
    report.f2 = r;
  }

  /* ============================== F-3 ============================== */
  {
    // (a) signed in, overlays
    const a = await launch({
      mirror: "/tmp/s4-public",
      label: `f3-${RUN}-overlays`,
      cwd: STUB,
      cookieFile: cookieTxt(),
      seed: SEED,
    });
    const r = { overlays: {} };
    try {
      await a.win.waitForSelector("header", { timeout: 30000 });
      await a.win.waitForTimeout(3000);
      r.baseline = { geometry: await helpButtonGeometry(a.win), click: await tryClick(a.win, "#ui-help-button") };
      // close the drawer the baseline click opened
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(300);

      for (const [name, toggle] of [["copyBlocks", "#ui-copy-blocks"], ["symbols", "#ui-symbols"]]) {
        await a.win.click(toggle, { timeout: 5000 });
        await a.win.waitForTimeout(600);
        const g = await helpButtonGeometry(a.win);
        const click = await tryClick(a.win, "#ui-help-button");
        // shortcut route
        await a.win.keyboard.press("Control+/");
        await a.win.waitForTimeout(500);
        const drawer = await a.win.evaluate(() => {
          const d = Array.from(document.querySelectorAll("#ui-help-drawer")).find(
            (x) => x.getBoundingClientRect().width > 0,
          );
          if (!d) return { open: false };
          const rc = d.getBoundingClientRect();
          const mid = document.elementFromPoint(rc.left + rc.width / 2, rc.top + 120);
          return {
            open: true,
            coveredAtMidpoint: mid ? `${mid.tagName}.${String(mid.className).slice(0, 60)}` : null,
            drawerContainsHit: Boolean(mid && d.contains(mid)),
          };
        });
        r.overlays[name] = { geometry: g, click, drawerViaShortcut: drawer };
        r[`shot_${name}`] = await a.shot(`${name}-help-blocked`);
        // reset: close drawer and the overlay
        await a.win.keyboard.press("Escape");
        await a.win.waitForTimeout(200);
        await a.win.evaluate((sel) => {
          const b = document.querySelector(sel);
          if (b && b.getAttribute("aria-pressed") === "true") b.click();
        }, toggle);
        await a.win.waitForTimeout(300);
      }
    } catch (e) {
      r.error = String(e);
    }
    await a.close();
    report.f3_overlays = r;
  }
  {
    // (b) first-run sign-in modal
    makeStub(STUB, { auth: { default: QUIET, browserDefault: QUIET, app: QUIET }, channel: { captionLines: 12 } });
    const a = await launch({
      mirror: "/tmp/s4-public",
      label: `f3-${RUN}-signin`,
      cwd: STUB,
      seed: { "clipper.dataDirConfirmed": true },
    });
    const r = {};
    try {
      await a.win.waitForSelector("header", { timeout: 30000 });
      await a.win.waitForTimeout(12000);
      r.modalOpen = await a.win.locator('[role="dialog"]').count();
      r.geometry = await helpButtonGeometry(a.win);
      r.click = await tryClick(a.win, "#ui-help-button");
      // The shortcut still works?
      await a.win.keyboard.press("Control+/");
      await a.win.waitForTimeout(600);
      r.afterShortcut = await a.win.evaluate(() => {
        const d = document.getElementById("ui-help-drawer");
        if (!d) return { drawerMounted: false };
        const rc = d.getBoundingClientRect();
        const cs = getComputedStyle(d);
        const mid = document.elementFromPoint(rc.left + rc.width / 2, rc.top + 120);
        return {
          drawerMounted: true,
          rect: { w: Math.round(rc.width), h: Math.round(rc.height) },
          zIndex: cs.zIndex,
          coveredAtMidpoint: mid ? `${mid.tagName}.${String(mid.className).slice(0, 60)}` : null,
          drawerIsHit: Boolean(mid && d.contains(mid)),
          searchFieldClickable: (() => {
            const s = document.getElementById("help-search");
            if (!s) return "absent";
            const sr = s.getBoundingClientRect();
            const t = document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2);
            return t === s ? "yes" : `no, hit ${t ? t.tagName + "." + String(t.className).slice(0, 50) : "null"}`;
          })(),
        };
      });
      r.shortcutAdvertisedWhere = await a.win.evaluate(() => {
        const b = document.getElementById("ui-help-button");
        const bodyMentionsShortcut = /⌘\/|Ctrl\+\/|Cmd \//.test(
          document.querySelector('[role="dialog"]')?.textContent || "",
        );
        return { buttonTitle: b?.getAttribute("title") ?? null, mentionedInModal: bodyMentionsShortcut };
      });
      r.shot = await a.shot("signin-modal-help-blocked");
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(300);
      r.shotAfter = await a.shot("after-escape");
    } catch (e) {
      r.error = String(e);
    }
    await a.close();
    report.f3_signin = r;
  }

  /* ============================== F-4 ============================== */
  {
    makeStub(STUB, { auth: { default: SIGNED_IN, app: SIGNED_IN }, channel: { captionLines: 12 } });
    const a = await launch({
      mirror: "/tmp/s4-public",
      label: `f4-${RUN}`,
      cwd: STUB,
      cookieFile: cookieTxt(),
      seed: SEED,
    });
    const r = { widths: {} };
    try {
      await a.win.waitForSelector("header", { timeout: 30000 });
      await a.win.waitForTimeout(3000);
      for (const w of [1440, 1024, 900, 760]) {
        await a.win.setViewportSize({ width: w, height: 768 });
        await a.win.waitForTimeout(600);
        const before = await helpButtonGeometry(a.win);
        // Send the real updater:status over the real IPC channel from the
        // main process. No product code is modified.
        await a.app.evaluate(({ BrowserWindow }, payload) => {
          const win = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed());
          win.webContents.send("updater:status", payload);
        }, { state: "error", message: "ENOENT: no such file or directory, open '/tmp/app-update.yml'" });
        await a.win.waitForTimeout(900);
        const after = await helpButtonGeometry(a.win);
        const strip = await a.win.evaluate(() => {
          const h = document.querySelector("header");
          return (h?.textContent || "").slice(0, 200);
        });
        r.widths[w] = { before, after, strip, clickAfter: await tryClick(a.win, "#ui-help-button") };
        await a.win.keyboard.press("Escape");
        r[`shot_${w}`] = await a.shot(`update-error-${w}`);
        // Clear the strip for the next width.
        await a.app.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed());
          win.webContents.send("updater:status", { state: "idle" });
        });
        await a.win.waitForTimeout(500);
      }
    } catch (e) {
      r.error = String(e);
    }
    await a.close();
    report.f4 = r;
  }

  const outFile = path.join(__dirname, "out", `f2-f3-f4-run${RUN}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2).slice(0, 14000));
  console.log("\nwrote", outFile);
})().catch((e) => { console.error(e); process.exit(1); });
