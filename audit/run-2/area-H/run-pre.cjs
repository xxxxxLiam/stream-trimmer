/**
 * File: run-pre.cjs
 * Path: audit/run-2/area-H/run-pre.cjs
 * Description: The <pre> overflow blocks T3 said it had NOT checked, reached
 *   for real: the sign-in modal's "Technical details" (needs the auth probe to
 *   fail so `state.reason` exists), the diagnostics disclosure after a failed
 *   cut, and the Import timestamps "Accepted shapes" blocks (overflow-x). For
 *   each: is a bar painted, does the wheel reach the end, and is there a
 *   keyboard route — these are the scrollers with no focusable children, so they
 *   depend on Chromium making a scroller itself keyboard-focusable.
 *
 *   The ErrorBoundary's <pre> needs a real render throw and is NOT PROVABLE here.
 *
 *   Audit-only; no product code is touched.
 */
const fs = require("node:fs");
const path = require("node:path");
const { buildStubRoot, script } = require("./lib/stub.cjs");
const H = require("./lib/h2.cjs");

const OUT = path.join(__dirname, "out");
const DATA = path.join(OUT, "data");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";

const PRES = () => {
  const out = [];
  let i = 0;
  for (const el of document.querySelectorAll("pre")) {
    const s = getComputedStyle(el);
    if (s.display === "none") continue;
    const r = el.getBoundingClientRect();
    const bw = parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth);
    const bh = parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth);
    const m = "pre" + i++;
    el.setAttribute("data-h2", m);
    out.push({
      marker: m,
      overflowY: s.overflowY, overflowX: s.overflowX,
      maxHeight: s.maxHeight, scrollbarWidth: s.scrollbarWidth,
      rect: { w: Math.round(r.width), h: Math.round(r.height) },
      hiddenY: el.scrollHeight - el.clientHeight,
      hiddenX: el.scrollWidth - el.clientWidth,
      gutterY: Math.round(el.offsetWidth - el.clientWidth - bw),
      gutterX: Math.round(el.offsetHeight - el.clientHeight - bh),
      tabIndexAttr: el.getAttribute("tabindex"),
      tabIndex: el.tabIndex,
      focusableInside: el.querySelectorAll('a[href],button,input,[tabindex]:not([tabindex="-1"])').length,
      programmaticFocusWorks: (() => { el.focus({ preventScroll: true }); return document.activeElement === el; })(),
      text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 70),
      inDialog: Boolean(el.closest('[role="dialog"]')),
    });
  }
  return out;
};

async function exercise(a, p) {
  const res = { marker: p.marker };
  if (p.hiddenY <= 2 && p.hiddenX <= 2) { res.note = "does not overflow in this state"; return res; }
  // Wheel.
  const box = await a.win.evaluate((m) => {
    const el = document.querySelector(`[data-h2="${m}"]`);
    el.scrollTop = 0; el.scrollLeft = 0;
    const r = el.getBoundingClientRect();
    return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2),
      inView: r.top > 0 && r.bottom < window.innerHeight };
  }, p.marker);
  if (box.inView) {
    await a.win.mouse.move(box.cx, box.cy);
    for (let i = 0; i < 15; i++) { await a.win.mouse.wheel(0, 200); await a.win.waitForTimeout(50); }
    res.wheelTop = await a.win.evaluate((m) => Math.round(document.querySelector(`[data-h2="${m}"]`).scrollTop), p.marker);
  } else res.wheelTop = "not in view";
  // Real Tab, then keys.
  await a.win.evaluate((m) => { const e = document.querySelector(`[data-h2="${m}"]`);
    e.scrollTop = 0; document.activeElement?.blur?.(); }, p.marker);
  let tabs = 0, landed = false;
  for (let i = 0; i < 60; i++) {
    await a.win.keyboard.press("Tab"); tabs = i + 1;
    landed = await a.win.evaluate((m) => {
      const el = document.querySelector(`[data-h2="${m}"]`);
      return Boolean(el && document.activeElement && (el === document.activeElement || el.contains(document.activeElement)));
    }, p.marker);
    if (landed) break;
  }
  res.tabReachable = landed; res.tabs = tabs;
  if (landed) {
    for (const key of ["PageDown", "End", "ArrowDown", "ArrowRight"]) {
      await a.win.evaluate((m) => { const e = document.querySelector(`[data-h2="${m}"]`); e.scrollTop = 0; e.scrollLeft = 0; }, p.marker);
      for (let i = 0; i < 6; i++) { await a.win.keyboard.press(key); await a.win.waitForTimeout(60); }
      res[key] = await a.win.evaluate((m) => { const e = document.querySelector(`[data-h2="${m}"]`);
        return { top: Math.round(e.scrollTop), left: Math.round(e.scrollLeft) }; }, p.marker);
    }
  }
  return res;
}

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };
  const out = {};

  // ---- A. the sign-in modal's Technical details <pre> ---------------------
  {
    script(STUB, { authFail: true, exitCode: 1, stderr: ("ERROR: cookies could not be read from the browser profile; " +
      "the file is locked by another process and yt-dlp cannot continue.\n").repeat(12) });
    const a = await H.open({ label: "h2-pre-modal", cwd: STUB, outDir: path.join(OUT, "pre-modal"),
      keepGate: true, signedIn: false });
    await H.setSize(a, 1000, 640);
    await a.win.waitForSelector('[role="dialog"]', { timeout: 40000 });
    await a.win.waitForTimeout(1000);
    await a.win.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await a.win.waitForTimeout(700);
    const pres = await a.win.evaluate(PRES);
    say(`=== the sign-in modal, disclosures expanded: ${pres.length} <pre> block(s) ===`);
    for (const p of pres) {
      say(`  ${p.marker} maxH=${p.maxHeight} overflow ${p.overflowY}/${p.overflowX} rect ${JSON.stringify(p.rect)} ` +
        `hiddenY=${p.hiddenY} hiddenX=${p.hiddenX} gutterY=${p.gutterY} gutterX=${p.gutterX} ` +
        `sb-width=${p.scrollbarWidth} tabIndex=${p.tabIndex} focusablesInside=${p.focusableInside} ` +
        `programmaticFocus=${p.programmaticFocusWorks} inDialog=${p.inDialog}`);
      say(`    text: "${p.text}"`);
      const e = await exercise(a, p);
      say(`    ${JSON.stringify(e)}`);
      (out.modal ||= []).push({ ...p, exercise: e });
    }
    await a.shot("pre-modal");
    await a.close();
  }

  // ---- B. the diagnostics <pre> after a failed cut -------------------------
  {
    script(STUB, { authFail: false, exitCode: 0, stderr: "", delayMs: 0, writeMedia: true });
    const a = await H.open({ label: "h2-pre-diag", cwd: STUB, outDir: path.join(OUT, "pre-diag"), skipSeeded: true });
    await H.setSize(a, 1280, 820);
    await H.loadVideo(a);
    await H.addSegments(a, 1);
    script(STUB, { exitCode: 1, writeMedia: false,
      stderr: ("ERROR: ffmpeg exited with code 1 while concatenating segment 1 of 1; the output file was not written.\n").repeat(14) });
    await a.win.evaluate(() => document.getElementById("ui-cut")?.click());
    await a.win.waitForTimeout(12000);
    // Open every disclosure the failure offers.
    await a.win.evaluate(() => {
      for (const d of document.querySelectorAll("details")) d.open = true;
      for (const b of document.querySelectorAll("button,summary")) {
        if (/diagnostic|technical detail|show (the )?log|details/i.test(b.innerText || "")) b.click();
      }
    });
    await a.win.waitForTimeout(1200);
    const pres = await a.win.evaluate(PRES);
    const alerts = await a.win.evaluate(() => [...document.querySelectorAll('[role="alert"],[role="status"]')]
      .map((e) => (e.innerText || "").replace(/\s+/g, " ").slice(0, 110)).filter(Boolean));
    say(`\n=== after a failed cut: ${pres.length} <pre> block(s); alerts ${JSON.stringify(alerts)} ===`);
    for (const p of pres) {
      say(`  ${p.marker} maxH=${p.maxHeight} overflow ${p.overflowY}/${p.overflowX} rect ${JSON.stringify(p.rect)} ` +
        `hiddenY=${p.hiddenY} hiddenX=${p.hiddenX} gutterY=${p.gutterY} gutterX=${p.gutterX} ` +
        `sb-width=${p.scrollbarWidth} tabIndex=${p.tabIndex} focusablesInside=${p.focusableInside} ` +
        `programmaticFocus=${p.programmaticFocusWorks}`);
      say(`    text: "${p.text}"`);
      const e = await exercise(a, p);
      say(`    ${JSON.stringify(e)}`);
      (out.diagnostics ||= []).push({ ...p, exercise: e });
    }
    await a.shot("pre-diagnostics");
    await a.close();
  }

  // ---- C. Import timestamps' overflow-x <pre> blocks -----------------------
  {
    script(STUB, { exitCode: 0, stderr: "", delayMs: 0, writeMedia: true });
    const a = await H.open({ label: "h2-pre-import", cwd: STUB, outDir: path.join(OUT, "pre-import"), skipSeeded: true });
    await H.setSize(a, 1280, 700);
    await H.loadVideo(a);
    await a.win.evaluate(() => document.getElementById("clips-tab-bank")?.click());
    await a.win.waitForTimeout(700);
    await a.win.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /import timestamps/i.test(x.innerText || ""));
      b?.click();
    });
    await a.win.waitForTimeout(900);
    const pres = await a.win.evaluate(PRES);
    say(`\n=== Import timestamps: ${pres.length} <pre> block(s) ===`);
    for (const p of pres) {
      say(`  ${p.marker} overflow ${p.overflowY}/${p.overflowX} rect ${JSON.stringify(p.rect)} ` +
        `hiddenY=${p.hiddenY} hiddenX=${p.hiddenX} gutterY=${p.gutterY} gutterX=${p.gutterX} ` +
        `sb-width=${p.scrollbarWidth} tabIndex=${p.tabIndex} programmaticFocus=${p.programmaticFocusWorks}`);
      say(`    text: "${p.text}"`);
      const e = await exercise(a, p);
      say(`    ${JSON.stringify(e)}`);
      (out.import ||= []).push({ ...p, exercise: e });
    }
    // Narrow the window so they certainly overflow horizontally.
    await H.setSize(a, 960, 700);
    await a.win.waitForTimeout(600);
    const pres2 = await a.win.evaluate(PRES);
    say(`  --- the same blocks at 960px wide ---`);
    for (const p of pres2) {
      say(`  ${p.marker} hiddenX=${p.hiddenX} gutterX=${p.gutterX} programmaticFocus=${p.programmaticFocusWorks}`);
      const e = await exercise(a, p);
      say(`    ${JSON.stringify(e)}`);
      (out.importNarrow ||= []).push({ ...p, exercise: e });
    }
    await a.shot("pre-import");
    await a.close();
  }

  fs.writeFileSync(path.join(DATA, "pre.json"), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(DATA, "pre.txt"), log.join("\n"));
  console.log("\nwrote", path.join(DATA, "pre.json"));
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
