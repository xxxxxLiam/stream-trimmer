/**
 * File: probe-inert.cjs
 * Path: audit/run-2/area-H/probe-inert.cjs
 * Description: Which elements the sign-in gate actually marks inert, and
 *   whether `main` ends up effectively inert through an ancestor. Run 1's H-2
 *   asserted "main[inert] is false", which is still literally true after the
 *   fix, so this records where the inertness really sits — otherwise the next
 *   reader re-files a defect that is gone. Audit-only.
 */
const fs = require("node:fs");
const path = require("node:path");
const { buildStubRoot, script } = require("./lib/stub.cjs");
const H = require("./lib/h2.cjs");

const OUT = path.join(__dirname, "out");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";

(async () => {
  buildStubRoot(STUB);
  script(STUB, { authFail: true });
  const a = await H.open({ label: "h2-inert", cwd: STUB, outDir: path.join(OUT, "inert"),
    keepGate: true, signedIn: false });
  await H.setSize(a, 1280, 800);
  await a.win.waitForSelector('[role="dialog"]', { timeout: 40000 });
  await a.win.waitForTimeout(800);
  const d = await a.win.evaluate(() => {
    const desc = (e) => (e.id ? "#" + e.id : e.tagName.toLowerCase() + "." +
      String(e.className || "").split(/\s+/).filter(Boolean).slice(0, 3).join("."));
    const dlg = document.querySelector('[role="dialog"]');
    const main = document.querySelector("main");
    const chain = [];
    let n = main;
    while (n && n !== document.documentElement) {
      chain.push({ el: desc(n), inertAttr: n.hasAttribute("inert"), ariaHidden: n.getAttribute("aria-hidden") });
      n = n.parentElement;
    }
    return {
      inertElements: [...document.querySelectorAll("[inert]")].map(desc),
      ariaHiddenTrue: [...document.querySelectorAll('[aria-hidden="true"]')].map(desc).slice(0, 12),
      dialogPath: (() => { const p = []; let x = dlg;
        while (x && x !== document.documentElement) { p.unshift(desc(x)); x = x.parentElement; } return p; })(),
      mainAncestorChain: chain,
      // The property reflects inheritance in Chromium.
      mainInertProperty: main ? main.inert : null,
      mainIsEffectivelyInert: main ? Boolean(main.closest("[inert]")) : null,
      // A screen reader's virtual cursor follows aria-hidden, not Tab.
      mainHiddenFromAX: main ? Boolean(main.closest('[aria-hidden="true"]')) : null,
    };
  });
  console.log(JSON.stringify(d, null, 2));
  await a.shot("inert");
  fs.writeFileSync(path.join(OUT, "data", "inert.json"), JSON.stringify(d, null, 2));
  await a.close();
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
