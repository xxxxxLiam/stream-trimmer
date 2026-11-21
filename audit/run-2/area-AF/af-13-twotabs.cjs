#!/usr/bin/env node
/**
 * AF-13 — follow-ups: with two workspace tabs, (a) does the VISIBLE "?" still
 * work, (b) where does the help drawer send focus on close, (c) what is the
 * stray portal in the top-left corner sitting on, (d) a tutorial from tab 2,
 * and (e) the setup checklist's Open-bank action from a different tab.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, writeStub, jar, AUTH_TEXT } = require("./lib.cjs");

const R = {};
const CLIPS = "/tmp/af-clips-13";
const CAMPAIGN = {
  id: "camp_af13", name: "Audit AF", targetMinSec: 1, targetMaxSec: 600, hardMaxSec: 900,
  clipIdPattern: "{prefix}-{videoId}-{nn}", prefix: "AF", format: "mp4", quality: "360",
  clipsDir: CLIPS, dataDir: "/tmp/af-data-13", usedRanges: {},
};

async function main() {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  writeStub({
    auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
    subs: {}, infoStage: {}, downloadStage: {},
  });

  const a = await launch({
    label: "af-13",
    cookieFile: jar(),
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.campaigns": [CAMPAIGN],
      "clipper.activeCampaign": "camp_af13",
      "clipper.clipsDir": CLIPS, "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS],
      "clipper.workspaces": {
        tabs: [{ id: "ws1", name: "", url: "https://www.youtube.com/watch?v=stub0000001" }],
        activeId: "ws1",
      },
    },
  });
  try {
    await a.win.waitForSelector("#ui-mark-in", { timeout: 30000 });
    await a.win.waitForTimeout(3000);

    // (e) setup checklist Open bank, from a tab that is NOT the bank
    await a.win.click("#clips-tab-all");
    await a.win.waitForTimeout(300);
    await a.win.click("#ui-help-button");
    await a.win.waitForSelector("#ui-help-drawer");
    await a.win.click("#help-setup-toggle");
    await a.win.waitForTimeout(500);
    const before = await a.win.evaluate(
      () => document.querySelector('[id^="clips-tab-"][aria-selected="true"]')?.id || null,
    );
    await a.win.locator('[data-setup-item="clip-bank"] button').first().click();
    await a.win.waitForTimeout(600);
    const after = await a.win.evaluate(
      () => document.querySelector('[id^="clips-tab-"][aria-selected="true"]')?.id || null,
    );
    R.openBankAction = { before, after, worked: before !== after && /bank/.test(after || "") };

    // (b) focus return from the help drawer, ONE tab
    await a.win.evaluate(() => document.getElementById("ui-help-button")?.focus());
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(400);
    R.focusReturnOneTab = await a.win.evaluate(() => {
      const el = document.activeElement;
      const r = el?.getBoundingClientRect?.();
      return { id: el?.id || null, tag: el?.tagName, w: r ? Math.round(r.width) : null, x: r ? Math.round(r.x) : null };
    });

    // ---- open a second tab -------------------------------------------------
    await a.win.click('button[aria-label="New tab"]');
    await a.win.waitForTimeout(1800);

    R.corner = await a.win.evaluate(() => {
      const list = Array.from(document.querySelectorAll('[id="ui-help-button"]'));
      const ghost = list[0];
      const gr = ghost.getBoundingClientRect();
      const at = (x, y) => {
        const e = document.elementFromPoint(x, y);
        return e ? `${e.tagName}#${e.id || ""}.${String(e.className).slice(0, 30)}` : null;
      };
      return {
        count: list.length,
        ghostRect: { x: Math.round(gr.x), y: Math.round(gr.y), w: Math.round(gr.width), h: Math.round(gr.height) },
        ghostIsFirstById: document.getElementById("ui-help-button") === ghost,
        at_1_1: at(1, 1),
        at_8_8: at(8, 8),
        at_20_14: at(20, 14),
        visibleRect: (() => {
          const v = list.find((b) => b.getBoundingClientRect().width > 10);
          if (!v) return null;
          const r = v.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
        })(),
      };
    });

    // (a) click the VISIBLE "?" with two tabs
    const vis = await a.win.evaluate(() => {
      const v = Array.from(document.querySelectorAll('[id="ui-help-button"]')).find(
        (b) => b.getBoundingClientRect().width > 10,
      );
      const r = v.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await a.win.mouse.click(vis.x, vis.y);
    await a.win.waitForTimeout(700);
    R.visibleClickTwoTabs = await a.win.evaluate(() => {
      const ds = Array.from(document.querySelectorAll('[id="ui-help-drawer"]'));
      const search = Array.from(document.querySelectorAll('[id="help-search"]'));
      return {
        drawers: ds.length,
        visibleDrawers: ds.filter((d) => d.getBoundingClientRect().width > 0).length,
        searchFields: search.length,
        firstSearchVisible: search[0] ? search[0].getBoundingClientRect().width > 0 : null,
      };
    });
    R.shot_twoTabs = await a.shot("two-tabs-visible-help-click");

    // (d) run a tutorial from tab 2 using the VISIBLE drawer
    if (R.visibleClickTwoTabs.visibleDrawers > 0) {
      await a.win.evaluate(() => {
        const d = Array.from(document.querySelectorAll('[id="ui-help-drawer"]')).find(
          (x) => x.getBoundingClientRect().width > 0,
        );
        const i = d.querySelector("#help-search, input[type=search]");
        i.focus();
      });
      await a.win.keyboard.type("Fix a 360p");
      await a.win.waitForTimeout(500);
      await a.win.evaluate(() => {
        const d = Array.from(document.querySelectorAll('[id="ui-help-drawer"]')).find(
          (x) => x.getBoundingClientRect().width > 0,
        );
        d.querySelector("[data-help-result]")?.click();
      });
      await a.win.waitForTimeout(800);
      R.tutorialFromTab2 = await a.win.evaluate(() => ({
        spotlights: document.querySelectorAll("[data-help-spotlight]").length,
        spotlightFor:
          document.querySelector("[data-help-spotlight]")?.getAttribute("data-help-spotlight") || null,
        notice: Array.from(document.querySelectorAll('[id="ui-help-drawer"] [role=status]')).some((p) =>
          /not on screen right now/.test(p.textContent || ""),
        ),
        anchorCopies: document.querySelectorAll('[id="help-anchor-youtube-status"]').length,
        firstAnchorVisible: (() => {
          const e = document.getElementById("help-anchor-youtube-status");
          return e ? e.getBoundingClientRect().width > 0 : null;
        })(),
      }));
      R.shot_tab2Tutorial = await a.shot("tutorial-from-tab2");
    }

    // (b2) focus return with two tabs
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(500);
    R.focusReturnTwoTabs = await a.win.evaluate(() => {
      const el = document.activeElement;
      const r = el?.getBoundingClientRect?.();
      return {
        id: el?.id || null, tag: el?.tagName,
        w: r ? Math.round(r.width) : null, x: r ? Math.round(r.x) : null, y: r ? Math.round(r.y) : null,
        isGhost: el?.id === "ui-help-button" && r && r.width < 10,
      };
    });
  } finally {
    a.save("af-13.json", R);
    fs.writeFileSync(path.join(__dirname, "out", "af-13.json"), JSON.stringify(R, null, 2));
    await a.close();
  }
  console.log(JSON.stringify(R, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
