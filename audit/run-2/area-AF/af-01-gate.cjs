#!/usr/bin/env node
/**
 * AF-01 — A-1 / H-2: the sign-in gate's escape route and its focus trap,
 * driven in the running app. No product code touched.
 *
 * usage: xvfb-run -a --server-args="-screen 0 1440x900x24" node af-01-gate.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, writeStub, clearCalls, calls, AUTH_TEXT, OUT } = require("./lib.cjs");

const R = {};

async function describeFocus(win) {
  return win.evaluate(() => {
    const a = document.activeElement;
    if (!a) return { tag: "none" };
    const dlg = document.querySelector('[role="dialog"]');
    return {
      tag: a.tagName,
      id: a.id || null,
      text: (a.textContent || "").trim().slice(0, 48),
      inDialog: !!(dlg && (dlg === a || dlg.contains(a))),
      insideInert: !!a.closest("[inert]"),
    };
  });
}

async function main() {
  writeStub({
    auth: { ...AUTH_TEXT.profile_missing, delayMs: 60 },
    infoStage: { exitCode: 0 },
    downloadStage: { exitCode: 0, writeMedia: true },
  });
  clearCalls();

  const a = await launch({ label: "af-01-gate", seed: { "clipper.dataDirConfirmed": true } });
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 30000 });
    await a.win.waitForTimeout(1500);
    R.shot_open = await a.shot("gate-open");

    // --- the escape route exists and is labelled -----------------------------
    R.dialogButtons = await a.win.evaluate(() =>
      Array.from(document.querySelectorAll('[role="dialog"] button')).map((b) => ({
        text: (b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60),
        disabled: b.disabled,
      })),
    );
    R.continueButtonVisible = await a.win
      .locator('[role="dialog"] button', { hasText: "Continue without signing in" })
      .first()
      .isVisible();

    // --- the trap: focus on open, background inert ---------------------------
    R.focusOnOpen = await describeFocus(a.win);
    R.background = await a.win.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      const sibs = Array.from(dlg?.parentElement?.children ?? []).filter((e) => e !== dlg);
      return {
        siblings: sibs.length,
        inert: sibs.filter((e) => e.hasAttribute("inert")).length,
        ariaHidden: sibs.filter((e) => e.getAttribute("aria-hidden") === "true").length,
        inertCountInDoc: document.querySelectorAll("[inert]").length,
        helpButtonInsideInert: !!document.getElementById("ui-help-button")?.closest("[inert]"),
        helpButtonIsBodyChild:
          document.getElementById("ui-help-button")?.parentElement === document.body,
      };
    });

    // --- 44 Tab presses, recording every landing ----------------------------
    const stops = [];
    for (let i = 0; i < 44; i++) {
      await a.win.keyboard.press("Tab");
      stops.push(await describeFocus(a.win));
    }
    R.tabStops = stops;
    R.tabsOutsideDialog = stops.filter((s) => !s.inDialog).length;
    R.tabsOutsideDetail = stops
      .map((s, i) => ({ i: i + 1, ...s }))
      .filter((s) => !s.inDialog);
    R.continueReachedAtTab =
      stops.findIndex((s) => /Continue without signing in/.test(s.text)) + 1 || null;
    R.distinctStops = [...new Set(stops.map((s) => `${s.tag}#${s.id || ""}:${s.text}`))];
    R.shot_tabs = await a.shot("after-44-tabs");

    // --- is the portalled help button clickable while the gate is up? -------
    R.helpDuringGate = await (async () => {
      const hit = await a.win.evaluate(() => {
        const b = document.getElementById("ui-help-button");
        if (!b) return { present: false };
        const r = b.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          present: true,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          hit: el ? `${el.tagName}#${el.id || ""}.${(el.className || "").toString().slice(0, 40)}` : null,
          hitIsSelf: el === b || b.contains(el),
          zIndex: getComputedStyle(b).zIndex,
        };
      });
      let clicked = "no";
      try {
        await a.win.click("#ui-help-button", { timeout: 3000 });
        clicked = "clicked";
      } catch (e) {
        clicked = `BLOCKED: ${String(e).split("\n")[0]}`;
      }
      await a.win.waitForTimeout(400);
      const drawer = await a.win.evaluate(() => {
        const d = document.getElementById("ui-help-drawer");
        if (!d) return { open: false };
        const r = d.getBoundingClientRect();
        const mid = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const s = document.getElementById("help-search");
        return {
          open: true,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          insideInert: !!d.closest("[inert]"),
          midHit: mid ? `${mid.tagName}#${mid.id || ""}` : null,
          midIsDrawer: !!(mid && d.contains(mid)),
          searchDisabledByInert: s ? !!s.closest("[inert]") : null,
          zIndex: getComputedStyle(d).zIndex,
        };
      });
      return { ...hit, clicked, drawer };
    })();
    R.shot_help = await a.shot("help-during-gate");

    // can the user type in the drawer's search box while the gate is up?
    R.drawerUsable = await (async () => {
      try {
        await a.win.fill("#help-search", "folder", { timeout: 3000 });
        const v = await a.win.inputValue("#help-search");
        return { filled: true, value: v };
      } catch (e) {
        return { filled: false, error: String(e).split("\n")[0] };
      }
    })();
    R.focusAfterHelpAttempt = await describeFocus(a.win);

    // --- Escape still works -------------------------------------------------
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(500);
    R.afterEscape = await a.win.evaluate(() => ({
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      inertLeft: document.querySelectorAll("[inert]").length,
      ariaHiddenLeft: document.querySelectorAll('[aria-hidden="true"]').length,
      chip: document.getElementById("help-anchor-youtube-status")?.textContent?.trim() || null,
      drawerStillOpen: !!document.getElementById("ui-help-drawer"),
    }));
    R.focusAfterEscape = await describeFocus(a.win);
    R.shot_escaped = await a.shot("after-escape");
    R.stateAfterEscape = a.readState();

    // --- the app is now reachable by pointer --------------------------------
    const clickTargets = [
      ["#ui-source-chip input", "URL field"],
      ["#ui-footer-format", "format chip"],
      ["#ui-settings", "settings"],
      ["#ui-campaign-chip", "campaign chip"],
      ["#help-anchor-youtube-status", "sign-in chip"],
    ];
    R.pointerReach = {};
    for (const [sel, name] of clickTargets) {
      try {
        await a.win.click(sel, { timeout: 2500 });
        R.pointerReach[name] = "clicked";
        await a.win.keyboard.press("Escape");
      } catch (e) {
        R.pointerReach[name] = `BLOCKED: ${String(e).split("\n")[0]}`;
      }
    }

    R.sweepProcesses = calls().filter((c) => c.argv.includes("--cookies-from-browser")).length;
  } finally {
    const f = a.save("af-01.json", R);
    await a.close();
    console.log("wrote", f);
  }
  console.log(JSON.stringify(R, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
