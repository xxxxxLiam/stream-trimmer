#!/usr/bin/env node
/**
 * AF-12 — regressions around the portalled help button, the new ids and the
 * reopened gate:
 *   T1 two workspace tabs: how many #ui-help-button elements exist, which one
 *      getElementById returns, and does the visible one still work?
 *   T2 the setup checklist's sign-in / open-bank actions (F-18)
 *   T3 the help drawer opened during the sign-in gate: how much of the gate
 *      does it cover, and is the escape route still clickable?
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, writeStub, jar, AUTH_TEXT } = require("./lib.cjs");

const R = {};
const CLIPS = "/tmp/af-clips-12";
const CAMPAIGN = {
  id: "camp_af12", name: "Audit AF", targetMinSec: 1, targetMaxSec: 600, hardMaxSec: 900,
  clipIdPattern: "{prefix}-{videoId}-{nn}", prefix: "AF", format: "mp4", quality: "360",
  clipsDir: CLIPS, dataDir: "/tmp/af-data-12", usedRanges: {},
};

async function main() {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  writeStub({
    auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
    subs: {}, infoStage: {}, downloadStage: {},
  });

  // ---------------- T1 + T2: signed in, two tabs --------------------------
  {
    const a = await launch({
      label: "af-12-tabs",
      cookieFile: jar(),
      seed: {
        "clipper.dataDirConfirmed": true,
        "clipper.campaigns": [CAMPAIGN],
        "clipper.activeCampaign": "camp_af12",
        "clipper.clipsDir": CLIPS, "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS],
        "clipper.workspaces": {
          tabs: [{ id: "ws1", name: "", url: "https://www.youtube.com/watch?v=stub0000001" }],
          activeId: "ws1",
        },
      },
    });
    await a.win.waitForSelector("#ui-mark-in", { timeout: 30000 });
    await a.win.waitForTimeout(3000);

    R.t1_oneTab = await a.win.evaluate(() => ({
      helpButtons: document.querySelectorAll('[id="ui-help-button"]').length,
      chips: document.querySelectorAll('[id="help-anchor-youtube-status"]').length,
      clipsTabs: document.querySelectorAll('[id="help-anchor-clips-tabs"]').length,
    }));

    // --- T2 setup checklist, one tab --------------------------------------
    await a.win.click("#ui-help-button");
    await a.win.waitForSelector("#ui-help-drawer");
    await a.win.click("#help-setup-toggle");
    await a.win.waitForTimeout(600);
    R.t2_items = await a.win.evaluate(() =>
      Array.from(document.querySelectorAll("[data-setup-item]")).map((li) => ({
        id: li.getAttribute("data-setup-item"),
        done: li.getAttribute("data-done"),
        blocked: li.getAttribute("data-blocked"),
        action: Array.from(li.querySelectorAll("button")).map((b) => b.textContent.trim())[0] || null,
      })),
    );
    R.t2_deadAnchors = await a.win.evaluate(() => ({
      youtubeStatus: !!document.getElementById("help-anchor-youtube-status"),
      clipsTabs: !!document.getElementById("help-anchor-clips-tabs"),
      bankTabFoundInside: !!Array.from(
        document.getElementById("help-anchor-clips-tabs")?.querySelectorAll("button,[role=tab]") ?? [],
      ).find((el) => /^bank\b/i.test(el.textContent?.trim() ?? "")),
    }));
    // press the clip-bank row's action and see whether the Bank tab opens
    const bankRow = a.win.locator('[data-setup-item="clip-bank"] button').first();
    R.t2_bankRowPresent = (await bankRow.count()) > 0;
    if (R.t2_bankRowPresent) {
      const before = await a.win.evaluate(
        () => document.querySelector('[id^="clips-tab-"][aria-selected="true"]')?.id || null,
      );
      await bankRow.click();
      await a.win.waitForTimeout(600);
      const after = await a.win.evaluate(
        () => document.querySelector('[id^="clips-tab-"][aria-selected="true"]')?.id || null,
      );
      R.t2_bankAction = { before, after, worked: after !== before && /bank/.test(after || "") };
    }
    R.t2_shot = await a.shot("setup-checklist");

    // --- T1 second tab -----------------------------------------------------
    await a.win.click("#ui-help-button"); // close help
    await a.win.waitForTimeout(300);
    await a.win.locator('button[title*="New tab"], button[aria-label*="New tab"]').first().click()
      .catch(async () => {
        await a.win.locator("header ~ * button", { hasText: "+" }).first().click().catch(() => {});
      });
    await a.win.waitForTimeout(1500);
    R.t1_tabCount = await a.win.evaluate(
      () => document.querySelectorAll('[role="tab"], [data-tab-id]').length,
    );
    R.t1_twoTabs = await a.win.evaluate(() => {
      const list = Array.from(document.querySelectorAll('[id="ui-help-button"]'));
      const first = document.getElementById("ui-help-button");
      return {
        helpButtons: list.length,
        rects: list.map((b) => {
          const r = b.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
        }),
        getElementByIdIsFirst: list[0] === first,
        firstHasZeroSize: list[0] ? list[0].getBoundingClientRect().width === 0 : null,
        chips: document.querySelectorAll('[id="help-anchor-youtube-status"]').length,
        clipsTabs: document.querySelectorAll('[id="help-anchor-clips-tabs"]').length,
        segmentLists: document.querySelectorAll('[id="ui-segment-list"]').length,
        timelines: document.querySelectorAll('[id="ui-timeline"]').length,
      };
    });
    // A REAL pointer click at the "?" coordinates on screen, not a selector click.
    const before = await a.win.evaluate(() =>
      Array.from(document.querySelectorAll('[id="ui-help-drawer"]')).map(
        (d) => d.getBoundingClientRect().width > 0,
      ),
    );
    const pt = await a.win.evaluate(() => {
      // the topmost "?" at the slot's coordinates, which is what a user hits
      const list = Array.from(document.querySelectorAll('[id="ui-help-button"]'));
      const vis = list.find((b) => b.getBoundingClientRect().width > 0) || list[0];
      const r = vis.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const el = document.elementFromPoint(x, y);
      return { x, y, topmostIsIndex: list.indexOf(el?.closest('[id="ui-help-button"]')) };
    });
    await a.win.mouse.click(pt.x, pt.y);
    await a.win.waitForTimeout(600);
    const after = await a.win.evaluate(() =>
      Array.from(document.querySelectorAll('[id="ui-help-drawer"]')).map(
        (d) => d.getBoundingClientRect().width > 0,
      ),
    );
    R.t1_clickWithTwoTabs = {
      clickPoint: { x: Math.round(pt.x), y: Math.round(pt.y) },
      topmostHelpButtonIndex: pt.topmostIsIndex,
      drawersVisibleBefore: before,
      drawersVisibleAfter: after,
      aVisibleDrawerOpened: after.some(Boolean),
      hiddenDrawerOpenedInstead: after.length > 0 && !after.some(Boolean),
      searchFieldVisible: await a.win.evaluate(() => {
        const i = document.getElementById("help-search");
        return i ? i.getBoundingClientRect().width > 0 : null;
      }),
    };
    R.t1_shot = await a.shot("two-tabs-help-button");
    // a tutorial from the second tab, if a usable drawer is open
    if (R.t1_clickWithTwoTabs.searchFieldVisible) {
      await a.win.fill("#help-search", "Fix a 360p");
      await a.win.waitForTimeout(300);
      await a.win.locator("#ui-help-drawer [data-help-result]").first().click();
      await a.win.waitForTimeout(700);
      R.t1_tutorialFromTab2 = await a.win.evaluate(() => ({
        spotlight: document.querySelector("[data-help-spotlight]")?.getAttribute("data-help-spotlight") || null,
        notice: Array.from(document.querySelectorAll("#ui-help-drawer [role=status]")).some((p) =>
          /not on screen right now/.test(p.textContent || ""),
        ),
      }));
      R.t1_shot2 = await a.shot("tutorial-on-second-tab");
    }
    await a.close();
  }

  // ---------------- T3: the drawer over the gate --------------------------
  {
    writeStub({ auth: { ...AUTH_TEXT.profile_missing }, subs: {}, infoStage: {}, downloadStage: {} });
    const a = await launch({ label: "af-12-gate", seed: { "clipper.dataDirConfirmed": true } });
    await a.win.waitForSelector('[role="dialog"]', { timeout: 30000 });
    await a.win.waitForTimeout(2000);
    await a.win.click("#ui-help-button");
    await a.win.waitForTimeout(600);
    R.t3 = await a.win.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) =>
        /Continue without signing in/.test(b.textContent || ""),
      );
      if (!btn) return { continueFound: false };
      const r = btn.getBoundingClientRect();
      const pts = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => {
        const x = r.left + r.width * f;
        const y = r.top + r.height / 2;
        const el = document.elementFromPoint(x, y);
        return { f, hitsButton: !!(el && (el === btn || btn.contains(el))), hit: el ? el.tagName + "#" + (el.id || "") : null };
      });
      const d = document.getElementById("ui-help-drawer");
      return {
        continueFound: true,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) },
        points: pts,
        coveredFraction: pts.filter((p) => !p.hitsButton).length / pts.length,
        drawerRect: d ? { x: Math.round(d.getBoundingClientRect().x), w: Math.round(d.getBoundingClientRect().width) } : null,
      };
    });
    R.t3_shot = await a.shot("drawer-over-gate");
    // the gate's own Diagnostics summary is now behind the drawer too?
    let escape = "n/a";
    try {
      await a.win.locator('[role="dialog"] button', { hasText: "Continue without signing in" }).first().click({ timeout: 3000 });
      await a.win.waitForTimeout(500);
      escape = (await a.win.locator('[role="dialog"]').count()) === 0 ? "escaped" : "still gated";
    } catch (e) {
      escape = `BLOCKED: ${String(e).split("\n")[0]}`;
    }
    R.t3_escapeByClick = escape;
    await a.close();
  }

  fs.writeFileSync(path.join(__dirname, "out", "af-12.json"), JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
