/**
 * File: run-modal-overlap.cjs
 * Path: audit/run-2/area-H/run-modal-overlap.cjs
 * Description: Two things the earlier passes saw but could not pin down.
 *
 *   1. The sign-in gate. It opens about 3.5 s after boot, so the regression
 *      pass photographed the page before it existed. This waits for the dialog
 *      itself, then measures: role / aria-modal, initial focus, where 40 Tab
 *      presses land, whether `main` / `#root` are inert or aria-hidden, whether
 *      the background can be OPERATED from behind the scrim, and what Escape
 *      does now that T6 has added a way out.
 *
 *   2. The footer painting over the mark bar. Several zoom levels reported
 *      "In field FULLY-COVERED by #ui-footer-data", which is the footer, not
 *      the sticky Cut row. This measures the shell's own box, the layout area
 *      and the footer at each zoom level and says which one overflows which.
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

const MODAL = () => {
  const dlg = document.querySelector('[role="dialog"][aria-modal="true"]') || document.querySelector('[role="dialog"]');
  const vis = (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0; };
  const F = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
  const main = document.querySelector("main"), root = document.getElementById("root");
  const q = (e) => e ? { ariaHidden: e.getAttribute("aria-hidden"), inertAttr: e.hasAttribute("inert"), inertProp: e.inert === true } : null;
  const inside = dlg ? [...dlg.querySelectorAll(F)].filter(vis) : [];
  const outside = [...document.body.querySelectorAll(F)].filter((e) => vis(e) && (!dlg || !dlg.contains(e)));
  return {
    dialogPresent: Boolean(dlg),
    role: dlg?.getAttribute("role") ?? null,
    ariaModal: dlg?.getAttribute("aria-modal") ?? null,
    labelledBy: dlg?.getAttribute("aria-labelledby") ?? null,
    labelTargetExists: dlg?.getAttribute("aria-labelledby")
      ? Boolean(document.getElementById(dlg.getAttribute("aria-labelledby"))) : null,
    main: q(main), root: q(root),
    inertCount: document.querySelectorAll("[inert]").length,
    focusablesInsideDialog: inside.length,
    focusablesOutsideDialog: outside.length,
    outsideSample: outside.slice(0, 22).map((e) => e.id ? "#" + e.id : (e.getAttribute("aria-label") || e.tagName)),
    activeElement: document.activeElement === document.body ? "body"
      : (document.activeElement?.id ? "#" + document.activeElement.id
        : document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName),
    activeInsideDialog: dlg ? dlg.contains(document.activeElement) : null,
    scrimEatsPointer: (() => {
      const s = document.getElementById("ui-settings");
      if (!s) return null;
      const r = s.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === s || s.contains(hit) ? false : (hit ? (hit.id ? "#" + hit.id : hit.tagName.toLowerCase() + "." +
        String(hit.className || "").split(/\s+/).slice(0, 2).join(".")) : "none");
    })(),
  };
};

const SHELL = () => {
  const shell = document.querySelector("div.surface-ground");
  const main = document.querySelector("main");
  const host = document.querySelector(".cols-host");
  const header = document.querySelector("header");
  const footer = document.querySelector("footer");
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    return { t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height),
      overflowY: s.overflowY, position: s.position, zIndex: s.zIndex, flexShrink: s.flexShrink,
      clientH: e.clientHeight, scrollH: e.scrollHeight, hidden: e.scrollHeight - e.clientHeight }; };
  // Does the footer's box overlap the layout area's box?
  const hr = host?.getBoundingClientRect(), fr = footer?.getBoundingClientRect();
  const overlapPx = hr && fr ? Math.round(Math.min(hr.bottom, fr.bottom) - Math.max(hr.top, fr.top)) : null;
  return {
    vh: window.innerHeight, vw: window.innerWidth,
    shell: box(shell), main: box(main), host: box(host), header: box(header), footer: box(footer),
    hostOverlapsFooterPx: overlapPx !== null && overlapPx > 0 ? overlapPx : 0,
    footerBelowViewportPx: fr ? Math.max(0, Math.round(fr.bottom - window.innerHeight)) : null,
    // Is the footer's own content reachable by any scroll?
    footerFullyVisible: fr ? fr.top >= 0 && fr.bottom <= window.innerHeight + 1 : null,
    markBarHit: (() => {
      const el = document.getElementById("ui-mark-in");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit) return "NONE";
      if (hit === el || el.contains(hit)) return "OK";
      const anc = hit.closest("[id]");
      return "COVERED:" + (anc?.id ? "#" + anc.id : hit.tagName.toLowerCase());
    })(),
  };
};

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };
  const out = {};

  // ---- 1. the sign-in gate, waited for properly ---------------------------
  // A genuine fresh install: no cookies file, and the stub refuses the auth
  // probe (`authFail`), so the gate is deterministic rather than racing a
  // probe that would otherwise answer "signed in".
  {
    script(STUB, { authFail: true });
    const a = await H.open({ label: "h2-gate", cwd: STUB, outDir: path.join(OUT, "gate"),
      keepGate: true, signedIn: false });
    await H.setSize(a, 1280, 800);
    await a.win.waitForSelector('[role="dialog"]', { timeout: 40000 });
    await a.win.waitForTimeout(800);
    say("=== the sign-in gate, with the dialog actually on screen ===");
    const st = await a.win.evaluate(MODAL);
    say(JSON.stringify(st, null, 1));
    await a.shot("gate-open");

    await a.win.evaluate(() => { document.activeElement?.blur?.(); });
    const stops = [];
    for (let i = 0; i < 40; i++) {
      await a.win.keyboard.press("Tab");
      stops.push(await a.win.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { body: true };
        const dlg = document.querySelector('[role="dialog"]');
        return { what: el.id ? "#" + el.id : (el.getAttribute("aria-label") || (el.innerText || "").trim().slice(0, 24) || el.tagName),
          inside: dlg ? dlg.contains(el) : false };
      }));
    }
    const outsideStops = stops.filter((s) => !s.body && !s.inside);
    say(`Tab x40: inside=${stops.filter((s) => s.inside).length} outside=${outsideStops.length} body=${stops.filter((s) => s.body).length}`);
    say(`reached behind the scrim: ${[...new Set(outsideStops.map((s) => s.what))].join(" , ")}`);

    // Operate the background: open Settings, then load a video.
    const driven = await (async () => {
      await a.win.evaluate(() => document.getElementById("ui-settings")?.focus());
      await a.win.keyboard.press("Enter");
      await a.win.waitForTimeout(500);
      const r1 = await a.win.evaluate(() => ({
        expanded: document.getElementById("ui-settings")?.getAttribute("aria-expanded"),
        settingsTextVisible: document.body.innerText.includes("No app settings yet"),
        modalStillUp: Boolean(document.querySelector('[role="dialog"]')),
      }));
      await a.win.evaluate(() => document.getElementById("ui-settings")?.click());
      await a.win.fill('input[type="url"]', H.URL_OK).catch(() => {});
      await a.win.keyboard.press("Enter");
      await a.win.waitForTimeout(5000);
      const r2 = await a.win.evaluate(() => ({
        markInEnabled: document.querySelector("#ui-mark-in") ? !document.querySelector("#ui-mark-in").disabled : null,
        clipsColumnPresent: Boolean(document.getElementById("ui-col-clips")),
        modalStillUp: Boolean(document.querySelector('[role="dialog"]')),
      }));
      return { settings: r1, video: r2 };
    })();
    say(`driving the background from behind the scrim: ${JSON.stringify(driven)}`);
    await a.shot("gate-background-driven");

    // Escape.
    const esc = await (async () => {
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(600);
      return a.win.evaluate(() => Boolean(document.querySelector('[role="dialog"]')));
    })();
    say(`dialog present after Escape: ${esc}  (so Escape closes it: ${!esc})`);
    out.gate = { state: st, stops, outsideCount: outsideStops.length, driven, escapeCloses: !esc };
    await a.close();
  }

  // ---- 2. the footer over the mark bar ------------------------------------
  {
    script(STUB, { authFail: false });
    const a = await H.open({ label: "h2-overlap", cwd: STUB, outDir: path.join(OUT, "overlap"), skipSeeded: true });
    await H.setSize(a, 1280, 820);
    await H.loadVideo(a);
    say(`\n=== the shell, the layout area and the footer, by size and zoom ===`);
    for (const [w, h, z] of [
      [1100, 760, 1], [1100, 760, 1.25], [1100, 760, 1.5], [1100, 760, 2],
      [900, 600, 1], [900, 600, 1.25], [900, 600, 1.5],
      [1280, 600, 1], [1280, 560, 1], [1280, 500, 1], [1440, 900, 1.5], [1440, 900, 1.75],
    ]) {
      await H.setZoom(a, 1);
      await H.setSize(a, w, h);
      await H.setZoom(a, z);
      await a.win.waitForTimeout(500);
      const s = await a.win.evaluate(SHELL);
      out.shell ||= [];
      out.shell.push({ w, h, z, ...s });
      say(`\n  window ${w}x${h} zoom ${z * 100}%  -> CSS viewport ${s.vw}x${s.vh}`);
      say(`    shell  ${JSON.stringify(s.shell)}`);
      say(`    main   ${JSON.stringify(s.main)}`);
      say(`    host   ${JSON.stringify(s.host)}`);
      say(`    footer ${JSON.stringify(s.footer)}`);
      say(`    layout area overlaps the footer by ${s.hostOverlapsFooterPx}px; footer past the viewport by ` +
        `${s.footerBelowViewportPx}px; footer fully visible=${s.footerFullyVisible}; In field hit=${s.markBarHit}`);
      if (s.hostOverlapsFooterPx > 0 || !s.footerFullyVisible) await a.shot(`overlap-${w}x${h}-z${z * 100}`);
    }
    await H.setZoom(a, 1);
    await a.close();
  }

  fs.writeFileSync(path.join(DATA, "modal-overlap.json"), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(DATA, "modal-overlap.txt"), log.join("\n"));
  console.log("\nwrote", path.join(DATA, "modal-overlap.json"));
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
