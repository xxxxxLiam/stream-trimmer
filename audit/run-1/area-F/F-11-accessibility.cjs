/**
 * F-11: accessibility of the help button, the drawer, the spotlight and the
 * update strip. Uses the accessibility tree and real Tab/Escape keys.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const active = () =>
  (() => {
    const e = document.activeElement;
    if (!e) return null;
    return {
      tag: e.tagName.toLowerCase(),
      id: e.id || null,
      role: e.getAttribute("role"),
      label: e.getAttribute("aria-label") || (e.textContent || "").trim().slice(0, 40) || e.getAttribute("placeholder"),
      inDrawer: Boolean(document.getElementById("ui-help-drawer")?.contains(e)),
    };
  })();

(async () => {
  const a = await L.boot("F-11-accessibility");
  const out = {};
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.waitForTimeout(800);

    // --- the a11y tree, read over CDP (Playwright dropped page.accessibility) ---
    const cdp = await a.win.context().newCDPSession(a.win);
    await cdp.send("Accessibility.enable");
    const axTree = async () => {
      const { nodes } = await cdp.send("Accessibility.getFullAXTree");
      return nodes
        .filter((n) => !n.ignored)
        .map((n) => ({
          role: n.role?.value,
          name: n.name?.value,
          value: n.value?.value,
          props: Object.fromEntries((n.properties || []).map((p) => [p.name, p.value?.value])),
        }));
    };
    const find = (list, pred) => list.filter(pred);
    out.helpButtonAx = find(await axTree(), (n) => /help/i.test(n.name || ""));
    console.log("help in a11y tree:", JSON.stringify(out.helpButtonAx));

    // --- can Tab reach the help button from the top of the page? ---
    await a.win.evaluate(() => document.body.focus());
    await a.win.click("#ui-campaign-chip");
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(200);
    let reached = false;
    const path_ = [];
    await a.win.evaluate(() => document.getElementById("ui-campaign-chip")?.focus());
    for (let i = 0; i < 40 && !reached; i++) {
      await a.win.keyboard.press("Tab");
      const f = await a.win.evaluate(active);
      path_.push(f && `${f.tag}#${f.id || ""}:${f.label}`);
      if (f?.id === "ui-help-button") reached = true;
    }
    out.tabToHelp = { reached, steps: path_.length, path: path_ };
    console.log(`Tab reaches the help button: ${reached} after ${path_.length} stops`);

    // --- open with Enter, check focus moves into the drawer ---
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(600);
    out.afterOpen = await a.win.evaluate(active);
    out.drawerPresent = await a.win.evaluate(() => Boolean(document.getElementById("ui-help-drawer")));
    console.log("after Enter on help:", JSON.stringify(out.afterOpen), "drawer:", out.drawerPresent);

    // --- is the drawer announced? role/label ---
    out.drawerSemantics = await a.win.evaluate(() => {
      const d = document.getElementById("ui-help-drawer");
      if (!d) return null;
      return {
        tag: d.tagName.toLowerCase(),
        role: d.getAttribute("role"),
        ariaLabel: d.getAttribute("aria-label"),
        ariaModal: d.getAttribute("aria-modal"),
        headingText: d.querySelector("h2")?.textContent?.trim() ?? null,
        liveRegions: [...d.querySelectorAll("[aria-live]")].map((n) => ({ live: n.getAttribute("aria-live"), role: n.getAttribute("role"), text: n.textContent.trim().slice(0, 50) })),
      };
    });
    console.log("drawer semantics:", JSON.stringify(out.drawerSemantics));

    // --- every control in the drawer has an accessible name ---
    out.unlabelled = await a.win.evaluate(() => {
      const d = document.getElementById("ui-help-drawer");
      return [...d.querySelectorAll("button,a,input,select,textarea,[role=button]")]
        .map((e) => ({
          tag: e.tagName.toLowerCase(),
          id: e.id || null,
          name: (e.getAttribute("aria-label") || e.textContent || "").trim() || (e.labels && e.labels[0]?.textContent.trim()) || "",
        }))
        .filter((e) => !e.name);
    });
    console.log("unlabelled drawer controls:", JSON.stringify(out.unlabelled));

    // --- does Tab stay inside the drawer (a trap) or escape to the app? ---
    const trapWalk = [];
    for (let i = 0; i < 25; i++) {
      await a.win.keyboard.press("Tab");
      const f = await a.win.evaluate(active);
      trapWalk.push(f && `${f.inDrawer ? "IN " : "OUT"} ${f.tag}#${f.id || ""}:${String(f.label).slice(0, 28)}`);
    }
    out.trapWalk = trapWalk;
    out.trapped = trapWalk.every((s) => s && s.startsWith("IN "));
    console.log("focus trapped in drawer:", out.trapped);
    console.log(trapWalk.join("\n"));

    // --- Escape closes and focus returns ---
    await a.win.evaluate(() => document.getElementById("help-search")?.focus());
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(500);
    out.afterEscape = {
      drawer: await a.win.evaluate(() => Boolean(document.getElementById("ui-help-drawer"))),
      focus: await a.win.evaluate(active),
    };
    console.log("after Escape:", JSON.stringify(out.afterEscape));

    // --- with a tutorial running, does the spotlight strand focus? ---
    await a.win.click("#ui-help-button");
    await a.win.waitForTimeout(400);
    await a.win.evaluate(() => {
      [...document.querySelectorAll("[data-help-result]")].find((n) => n.textContent.startsWith("Switch campaign"))?.click();
    });
    await a.win.waitForTimeout(600);
    out.spotlight = await a.win.evaluate(() => {
      const sp = document.querySelector("[data-help-spotlight]");
      return sp
        ? {
            ariaHidden: sp.getAttribute("aria-hidden"),
            pointerEvents: getComputedStyle(sp).pointerEvents,
            zIndex: getComputedStyle(sp).zIndex,
            focusableInside: sp.querySelectorAll("a,button,input,[tabindex]").length,
            // Is the highlighted control itself still clickable?
            anchorReachable: (() => {
              const el = document.getElementById(sp.getAttribute("data-help-spotlight"));
              if (!el) return null;
              const r = el.getBoundingClientRect();
              const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return Boolean(t && (el.contains(t) || t.contains(el)));
            })(),
          }
        : null;
    });
    console.log("spotlight:", JSON.stringify(out.spotlight));
    // Does the badge number reach a screen reader at all? (it is aria-hidden)
    out.stepAnnouncement = await a.win.evaluate(() => {
      const d = document.getElementById("ui-help-drawer");
      return [...d.querySelectorAll("[aria-live]")].map((n) => n.textContent.trim());
    });
    console.log("live-region text while stepping:", JSON.stringify(out.stepAnnouncement));
    console.log("SHOT", await a.shot("a11y-tutorial"));

    // --- real click on the spotlit control while the spotlight is up ---
    let clickOk = true;
    try {
      await a.win.click("#ui-campaign-chip", { timeout: 2500 });
    } catch (e) {
      clickOk = false;
      console.log("spotlit control not clickable:", String(e).split("\n")[0]);
    }
    out.spotlitControlClickable = clickOk;
    console.log("spotlit control clickable:", clickOk);
    await a.win.keyboard.press("Escape");

    // --- update strip controls labelled? ---
    await a.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((x) => !x.isDestroyed())
        .webContents.send("updater:status", { state: "ready", version: "4.1.0" });
    });
    await a.win.waitForTimeout(500);
    out.updateAx = find(await axTree(), (n) => /restart|check|update|download/i.test(n.name || ""));
    console.log("update strip in a11y tree:", JSON.stringify(out.updateAx));
    out.updateLive = await a.win.evaluate(() => {
      const check = [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Check");
      const strip = check?.parentElement;
      return {
        hasLive: Boolean(strip?.querySelector("[aria-live]")) || strip?.getAttribute("aria-live"),
        role: strip?.getAttribute("role") ?? null,
      };
    });
    console.log("update strip live region:", JSON.stringify(out.updateLive));
    console.log("PAGE ERRORS", JSON.stringify(a.logs.pageErrors));
  } finally {
    const f = path.join(a.outDir, "accessibility.json");
    fs.writeFileSync(f, JSON.stringify(out, null, 2));
    console.log("REPORT", f);
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
