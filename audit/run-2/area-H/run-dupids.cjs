/**
 * File: run-dupids.cjs
 * Path: audit/run-2/area-H/run-dupids.cjs
 * Description: What the duplicated ids actually cost, with two tabs open and
 *   the SECOND one active — the ordinary state after Ctrl+T.
 *
 *   Every workspace mounts in full (App.tsx renders one subtree per tab and
 *   hides the inactive ones with display:none), so the 28 ids inside a
 *   workspace — including the eleven T10 added for the help catalogue — exist
 *   once per tab. `document.getElementById` and the id-based ARIA relations
 *   (`label[for]`, `aria-controls`, `aria-labelledby`) all resolve to the FIRST
 *   copy in document order, which belongs to the hidden tab. This measures:
 *
 *     - which copy getElementById returns, and whether it is the visible one
 *     - whether the visible transcript search input still has a label
 *       (T10 replaced its useId with the literal id "ui-transcript-search")
 *     - whether a help step's Spotlight ring still appears
 *     - the accessibility tree with the hidden tabs present
 *
 *   Audit-only; no product code is touched.
 */
const fs = require("node:fs");
const path = require("node:path");
const { buildStubRoot } = require("./lib/stub.cjs");
const { launch } = require("./lib/launch.cjs");
const { dismissGate, setSize, loadVideo } = require("./lib/h2.cjs");

const OUT = path.join(__dirname, "out");
const DATA = path.join(OUT, "data");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";

const IDS = ["ui-mark-in", "ui-mark-out", "ui-add-segment", "ui-cut", "ui-timeline",
  "ui-segment-list", "ui-transcript-search", "ui-transcript-lines", "ui-col-clips",
  "ui-source-chip", "ui-campaign-chip", "ui-settings", "help-anchor-youtube-status",
  "help-anchor-clips-tabs", "ui-symbol-list", "ui-campaign-list"];

const MEASURE = (ids) => {
  const onScreen = (e) => Boolean(e.getClientRects().length) && e.offsetParent !== null;
  const out = { byId: [], labels: [], ariaRefs: [], tree: {} };
  for (const id of ids) {
    const all = [...document.querySelectorAll(`[id="${CSS.escape ? id : id}"]`)]
      .filter((e) => e.id === id);
    const first = document.getElementById(id);
    out.byId.push({
      id, copies: all.length,
      copiesOnScreen: all.filter(onScreen).length,
      getElementByIdIsOnScreen: first ? onScreen(first) : null,
      getElementByIdIndex: first ? all.indexOf(first) : null,
      // The rect the Spotlight would measure.
      getElementByIdRect: first ? (() => { const r = first.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) }; })() : null,
      spotlightWouldShow: first ? (() => { const r = first.getBoundingClientRect();
        return r.width > 0 && r.height > 0; })() : false,
    });
  }
  // Labels: for every text input on screen, does it have an accessible name?
  for (const el of document.querySelectorAll("input, select, textarea")) {
    if (!onScreen(el)) continue;
    if (["hidden", "submit", "button"].includes(el.type)) continue;
    out.labels.push({
      what: el.id ? "#" + el.id : el.tagName.toLowerCase() + "[" + (el.type || "") + "]",
      labelsFound: el.labels ? el.labels.length : 0,
      labelIsOnScreen: el.labels && el.labels.length ? onScreen(el.labels[0]) : null,
      ariaLabel: el.getAttribute("aria-label"),
      ariaLabelledby: el.getAttribute("aria-labelledby"),
      placeholder: el.placeholder || null,
      hasAccessibleName: Boolean((el.labels && el.labels.length) || el.getAttribute("aria-label") ||
        el.getAttribute("aria-labelledby") || el.getAttribute("title")),
    });
  }
  // label[for] targets: which copy do they land on?
  for (const lab of document.querySelectorAll("label[for]")) {
    const f = lab.getAttribute("for");
    const t = document.getElementById(f);
    out.ariaRefs.push({ kind: "label[for]", ref: f,
      labelOnScreen: onScreen(lab),
      targetExists: Boolean(t),
      targetOnScreen: t ? onScreen(t) : null,
      labelText: (lab.innerText || lab.textContent || "").trim().slice(0, 40) });
  }
  for (const attr of ["aria-controls", "aria-labelledby", "aria-describedby"]) {
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      if (!onScreen(el)) continue;
      for (const ref of (el.getAttribute(attr) || "").split(/\s+/).filter(Boolean)) {
        const t = document.getElementById(ref);
        out.ariaRefs.push({ kind: attr, ref,
          on: el.id ? "#" + el.id : (el.getAttribute("aria-label") || el.tagName.toLowerCase()),
          targetExists: Boolean(t), targetOnScreen: t ? onScreen(t) : null });
      }
    }
  }
  const countBoth = (sel) => { const all = [...document.querySelectorAll(sel)];
    return { inDocument: all.length, onScreen: all.filter(onScreen).length }; };
  out.tree = {
    header: countBoth("header"), main: countBoth("main"), footer: countBoth("footer"),
    tab: countBoth('[role="tab"]'), region: countBoth('[role="region"]'),
    sectionNamed: countBoth("section[aria-label]"), headings: countBoth("h1,h2,h3,h4,h5,h6"),
    tabIndexZero: countBoth('[tabindex="0"]'),
    duplicateIdCount: (() => { const m = new Map();
      for (const e of document.querySelectorAll("[id]")) m.set(e.id, (m.get(e.id) || 0) + 1);
      return [...m.values()].filter((v) => v > 1).length; })(),
  };
  return out;
};

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };
  const all = {};

  for (const n of [1, 2]) {
    const seed = {
      "clipper.dataDirConfirmed": true, "clipper.signInSkipped": true,
      ...(n === 1 ? {} : { "clipper.workspaces": {
        tabs: [{ id: "w0", name: "First tab" }, { id: "w1", name: "Second tab" }], activeId: "w1" } }),
    };
    const a = await launch({ label: `h2-dup-${n}`, cwd: STUB, outDir: path.join(OUT, `dup-${n}`), signedIn: true, seed });
    await a.win.waitForSelector("#root", { timeout: 40000 });
    await a.win.waitForFunction(() => document.querySelectorAll('[role="tab"]').length > 0, undefined, { timeout: 40000 });
    await a.win.waitForTimeout(2500);
    await dismissGate(a.win);
    await setSize(a, 1440, 900);
    try { await loadVideo(a); } catch { say(`  (${n} tab: video did not load)`); }
    // Open the help drawer and pick a task, so a Spotlight is genuinely asked for.
    await a.win.evaluate(() => document.getElementById("ui-help-button")?.click());
    await a.win.waitForTimeout(800);
    await a.win.evaluate(() => {
      const first = document.querySelector("[data-help-result] button, [data-help-result]");
      if (first) first.click();
    });
    await a.win.waitForTimeout(1000);
    const spot = await a.win.evaluate(() => {
      const s = document.querySelector("[data-help-spotlight]");
      return { present: Boolean(s), anchor: s?.getAttribute("data-help-spotlight") || null,
        ringPainted: s ? [...s.children].some((c) => c.getBoundingClientRect().width > 0) : false,
        helpBody: (document.getElementById("ui-help-drawer")?.innerText || "").replace(/\s+/g, " ").slice(0, 160) };
    });
    const m = await a.win.evaluate(MEASURE, IDS);
    all[`tabs-${n}`] = { spotlight: spot, ...m };
    say(`\n########## ${n} tab(s), active = ${n === 1 ? "the only one" : "the SECOND"} ##########`);
    say(`tree: ${JSON.stringify(m.tree)}`);
    say(`\nid resolution:`);
    for (const r of m.byId) {
      say(`  ${r.id.padEnd(26)} copies=${r.copies} onScreen=${r.copiesOnScreen}  ` +
        `getElementById -> index ${r.getElementByIdIndex}, onScreen=${r.getElementByIdIsOnScreen}, ` +
        `rect=${JSON.stringify(r.getElementByIdRect)}, a Spotlight on it would show=${r.spotlightWouldShow}`);
    }
    say(`\nform controls on screen and their names:`);
    for (const l of m.labels) {
      say(`  ${l.what.padEnd(26)} labels=${l.labelsFound} labelOnScreen=${l.labelIsOnScreen} ` +
        `aria-label=${l.ariaLabel ? JSON.stringify(l.ariaLabel.slice(0, 24)) : "null"} ` +
        `name=${l.hasAccessibleName}  placeholder=${l.placeholder ? JSON.stringify(l.placeholder.slice(0, 30)) : "null"}`);
    }
    say(`\nid-based ARIA relations that resolve to an OFF-SCREEN copy:`);
    const bad = m.ariaRefs.filter((r) => r.targetExists && r.targetOnScreen === false);
    if (!bad.length) say("  none");
    for (const r of bad) say(`  ${r.kind}="${r.ref}" on ${r.on || "label"} -> target exists but is off screen`);
    const dangling = m.ariaRefs.filter((r) => !r.targetExists);
    say(`dangling id references: ${dangling.length}${dangling.length ? " -> " + dangling.map((r) => `${r.kind}="${r.ref}"`).join(" , ") : ""}`);
    say(`\nhelp spotlight: ${JSON.stringify(spot)}`);
    await a.shot(`dup-${n}tabs`);
    await a.close();
  }

  fs.writeFileSync(path.join(DATA, "dupids.json"), JSON.stringify(all, null, 2));
  fs.writeFileSync(path.join(DATA, "dupids.txt"), log.join("\n"));
  console.log("\nwrote", path.join(DATA, "dupids.json"));
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
