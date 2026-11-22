/**
 * File: run-tabs-tree.cjs
 * Path: audit/run-2/area-H/run-tabs-tree.cjs
 * Description: Many open tabs and the accessibility tree. The earlier pass
 *   could not even wait for `header` with 25 tabs open, because the document
 *   then holds 50 of them — every workspace mounts in full. This measures what
 *   that does to the tree a screen reader walks: how many of those copies are
 *   `display:none` (harmless, merely mounted) versus still exposed, how many
 *   ids are duplicated, and how many tab stops exist. It also records the
 *   banner / contentinfo landmark question: AppHeader and AppFooter sit inside
 *   <main>, so neither is a top-level landmark.
 *
 *   Audit-only; no product code is touched.
 */
const fs = require("node:fs");
const path = require("node:path");
const { buildStubRoot } = require("./lib/stub.cjs");
const { launch } = require("./lib/launch.cjs");
const { dismissGate, setSize } = require("./lib/h2.cjs");

const OUT = path.join(__dirname, "out");
const DATA = path.join(OUT, "data");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";

const TREE = () => {
  const vis = (e) => { const s = getComputedStyle(e); return s.display !== "none" && s.visibility !== "hidden"; };
  const count = (sel) => {
    const all = [...document.querySelectorAll(sel)];
    return { total: all.length, visible: all.filter(vis).length };
  };
  const ids = new Map();
  for (const e of document.querySelectorAll("[id]")) {
    if (!ids.has(e.id)) ids.set(e.id, { total: 0, visible: 0 });
    const r = ids.get(e.id); r.total++; if (vis(e)) r.visible++;
  }
  const dupes = [...ids.entries()].filter(([, v]) => v.total > 1)
    .map(([id, v]) => ({ id, total: v.total, visible: v.visible }));
  const focusable = [...document.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')]
    .filter((e) => vis(e) && e.getBoundingClientRect().width > 0);
  return {
    header: count("header"), main: count("main"), footer: count("footer"),
    tab: count('[role="tab"]'), tablist: count('[role="tablist"]'),
    region: count('[role="region"]'), sectionNamed: count("section[aria-label]"),
    headings: count("h1,h2,h3,h4,h5,h6"),
    h1: count("h1"),
    banner: count('[role="banner"]'), contentinfo: count('[role="contentinfo"]'),
    duplicateIds: dupes,
    duplicateIdsWithTwoVisible: dupes.filter((d) => d.visible > 1),
    visibleFocusables: focusable.length,
    totalElements: document.querySelectorAll("*").length,
    // Where the app header and footer actually sit: inside <main> means neither
    // is exposed as a banner / contentinfo landmark.
    appHeaderInsideMain: (() => {
      const h = document.querySelector("header");
      return h ? Boolean(h.closest("main")) : null;
    })(),
    appFooterInsideMain: (() => {
      const f = document.querySelector("footer");
      return f ? Boolean(f.closest("main")) : null;
    })(),
  };
};

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };
  const out = [];

  for (const n of [1, 3, 10, 25]) {
    const seed = {
      "clipper.dataDirConfirmed": true, "clipper.signInSkipped": true,
      ...(n === 1 ? {} : { "clipper.workspaces": {
        tabs: Array.from({ length: n }, (_, i) => ({ id: `w${i}`, name: `Tab ${i}` })), activeId: `w${n - 1}` } }),
    };
    let a;
    try {
      a = await launch({ label: `h2-tabs-${n}`, cwd: STUB, outDir: path.join(OUT, `tabs-${n}`), signedIn: true, seed, timeout: 90000 });
      // Do NOT wait for `header`: with many tabs the first one is a hidden copy.
      await a.win.waitForSelector("#root", { timeout: 60000 });
      await a.win.waitForFunction(() => document.querySelectorAll('[role="tab"]').length > 0, undefined, { timeout: 60000 });
      await a.win.waitForTimeout(3000);
      await dismissGate(a.win);
      await setSize(a, 1280, 800);
      await a.win.waitForTimeout(1200);
      const t = await a.win.evaluate(TREE);
      out.push({ tabs: n, ...t });
      say(`\n=== ${n} tab(s) open ===`);
      say(`  header ${JSON.stringify(t.header)}  main ${JSON.stringify(t.main)}  footer ${JSON.stringify(t.footer)}`);
      say(`  role=tab ${JSON.stringify(t.tab)}  role=tablist ${JSON.stringify(t.tablist)}  role=region ${JSON.stringify(t.region)}`);
      say(`  section[aria-label] ${JSON.stringify(t.sectionNamed)}  headings ${JSON.stringify(t.headings)}  h1 ${JSON.stringify(t.h1)}`);
      say(`  role=banner ${JSON.stringify(t.banner)}  role=contentinfo ${JSON.stringify(t.contentinfo)}`);
      say(`  app header inside <main>: ${t.appHeaderInsideMain}   app footer inside <main>: ${t.appFooterInsideMain}`);
      say(`  duplicate ids: ${t.duplicateIds.length} (with more than one VISIBLE: ${t.duplicateIdsWithTwoVisible.length})`);
      if (t.duplicateIds.length) {
        say(`    ${t.duplicateIds.slice(0, 14).map((d) => `${d.id} x${d.total} (vis ${d.visible})`).join(" , ")}` +
          (t.duplicateIds.length > 14 ? ` … +${t.duplicateIds.length - 14} more` : ""));
      }
      say(`  visible focusables: ${t.visibleFocusables}   total elements: ${t.totalElements}`);
      await a.shot(`tabs-${n}`);
    } catch (e) {
      say(`\n=== ${n} tabs: FAILED — ${String(e).slice(0, 200)}`);
    } finally { if (a) await a.close(); }
  }

  fs.writeFileSync(path.join(DATA, "tabs-tree.json"), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(DATA, "tabs-tree.txt"), log.join("\n"));
  console.log("\nwrote", path.join(DATA, "tabs-tree.json"));
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
