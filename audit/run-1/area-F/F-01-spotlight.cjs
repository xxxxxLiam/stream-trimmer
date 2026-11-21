/**
 * F-01: THE SPOTLIGHT TEST.
 *
 * For EVERY task in the help catalogue, run the tutorial in the real app and
 * assert that the element each step names actually exists and is visible at
 * that moment. Enumerated from the catalogue, not sampled.
 *
 * Run in two states:
 *   state "empty" — fresh workspace, no video loaded
 *   state "loaded" — a video loaded from the stub (transcript/timeline present)
 *
 * Usage: node F-01-spotlight.cjs [--channel]
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const CHANNEL = process.argv.includes("--channel");
const LABEL = CHANNEL ? "F-01-spotlight-channel" : "F-01-spotlight";

/** What the page can tell us about one anchor id, right now. */
const PROBE = (id) => {
  const el = document.getElementById(id);
  const all = document.querySelectorAll(`[id="${id}"]`).length;
  if (!el) return { id, exists: false, duplicates: all };
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const topEl = r.width && r.height ? document.elementFromPoint(cx, cy) : null;
  return {
    id,
    exists: true,
    duplicates: all,
    tag: el.tagName.toLowerCase(),
    text: (el.textContent || "").trim().slice(0, 60),
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    zeroSize: r.width === 0 || r.height === 0,
    display: cs.display,
    visibility: cs.visibility,
    opacity: cs.opacity,
    inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
    // Is the control itself the thing under its own centre point?
    covered: topEl ? !(el.contains(topEl) || topEl.contains(el)) : null,
    coveredBy: topEl && !(el.contains(topEl) || topEl.contains(el))
      ? `${topEl.tagName.toLowerCase()}#${topEl.id}.${String(topEl.className).slice(0, 40)}`
      : null,
  };
};

async function runState(a, state, cat, results) {
  const win = a.win;
  for (const task of cat.tasks) {
    // Fresh drawer per task so nothing leaks between tutorials. NOTE: closing
    // and reopening does NOT reset the drawer (see F-resume), so the "All
    // tasks" link is what actually returns to the list.
    const drawerOpen = await win.evaluate(() => Boolean(document.getElementById("ui-help-drawer")));
    if (!drawerOpen) await L.openHelp(win);
    await win.evaluate(() => {
      const d = document.getElementById("ui-help-drawer");
      const back = [...d.querySelectorAll("button")].find((x) => x.textContent.trim() === "All tasks");
      back?.click();
    });
    await win.waitForTimeout(200);
    const picked = await win.evaluate((title) => {
      const b = [...document.querySelectorAll("[data-help-result]")].find((n) =>
        (n.textContent || "").startsWith(title),
      );
      if (!b) return false;
      b.click();
      return true;
    }, task.title);
    if (!picked) {
      results.push({ state, task: task.id, error: "task not listed in drawer" });
      continue;
    }
    await win.waitForTimeout(300);

    for (let i = 0; i < task.steps.length; i++) {
      const step = task.steps[i];
      await win.waitForTimeout(250);
      const probe = await win.evaluate(
        ({ id, fn }) => new Function("id", `return (${fn})(id)`)(id),
        { id: step.anchorId, fn: PROBE.toString() },
      );
      const ui = await win.evaluate(() => ({
        spotlightFor: document.querySelector("[data-help-spotlight]")?.getAttribute("data-help-spotlight") ?? null,
        notOnScreenNotice: /not on screen right now/i.test(
          document.getElementById("ui-help-drawer")?.textContent || "",
        ),
        stepLabel: (document.getElementById("ui-help-drawer")?.textContent || "").match(/Step \d+ of \d+/)?.[0] ?? null,
      }));
      results.push({
        state,
        task: task.id,
        step: i + 1,
        do: step.do,
        anchorId: step.anchorId,
        ...probe,
        ...ui,
        spotlightShown: ui.spotlightFor === step.anchorId,
      });
      // advance
      if (i < task.steps.length - 1) {
        await win.evaluate(() => {
          const d = document.getElementById("ui-help-drawer");
          const b = [...d.querySelectorAll("button")].find((x) => x.textContent.trim() === "Next step");
          b?.click();
        });
      }
    }
    await a.shot(`${state}-${task.id}`);
  }
}

(async () => {
  const cat = L.readCatalogue();
  const tasks = CHANNEL ? cat.tasks : cat.tasks.filter((t) => !["export-channel", "stop-run"].includes(t.id));
  const useCat = { ...cat, tasks };

  const a = await L.boot(LABEL, {
    appRoot: CHANNEL ? "/tmp/f-app-channel" : "/tmp/f-app",
  });
  const results = [];
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.waitForTimeout(500);

    // -------- state: empty workspace --------
    await runState(a, "empty", useCat, results);

    // -------- state: a video loaded --------
    await a.win.evaluate(() => {
      const d = document.getElementById("ui-help-drawer");
      const back = d && [...d.querySelectorAll("button")].find((x) => x.textContent.trim() === "All tasks");
      if (back) back.click();
      if (d) document.getElementById("ui-help-button").click();
    });
    await a.win.waitForTimeout(300);
    const input = a.win.locator("#ui-source-chip input");
    await input.fill("https://www.youtube.com/watch?v=stub0000001");
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(6000);
    const loaded = await a.win.evaluate(() => ({
      title: document.getElementById("ui-source-chip")?.textContent?.slice(0, 80),
      bodyHas: /Stub video/.test(document.body.innerText),
    }));
    console.log("VIDEO LOADED:", JSON.stringify(loaded));
    await a.shot("video-loaded");
    await runState(a, "loaded", useCat, results);

    console.log("PAGE ERRORS", JSON.stringify(a.logs.pageErrors));
  } finally {
    const out = path.join(a.outDir, "spotlight-results.json");
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    console.log("RESULTS", out);
    // Summary table
    const bad = results.filter((r) => r.error || !r.exists || r.zeroSize || !r.spotlightShown || r.covered);
    console.log(`\n=== ${results.length} step-probes, ${bad.length} FAILING ===`);
    for (const r of results) {
      const verdict = r.error
        ? `ERROR ${r.error}`
        : !r.exists
          ? "ANCHOR ABSENT"
          : r.zeroSize
            ? "ZERO SIZE"
            : r.covered
              ? `COVERED by ${r.coveredBy}`
              : !r.spotlightShown
                ? `NO SPOTLIGHT (shown for ${r.spotlightFor})`
                : "ok";
      console.log(
        `[${r.state}] ${r.task} step${r.step ?? "?"} ${r.anchorId ?? ""} -> ${verdict}` +
          (r.notOnScreenNotice ? "  (+notice shown)" : ""),
      );
    }
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
