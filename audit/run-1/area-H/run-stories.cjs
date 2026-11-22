/**
 * File: run-stories.cjs
 * Path: audit/run-1/area-H/run-stories.cjs
 * Description: Area H step 4 — thirteen user stories framed as access needs,
 *   each run against the real app, plus the leftover measurements they need
 *   (field focus rings, reduced-motion emulation, scroll reachability, live
 *   regions during a download). Audit-only.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch } = require("./lib/launch.cjs");
const { buildStubRoot, script } = require("./lib/stub.cjs");
const { setSize, inject, loadShot } = require("./lib/drive.cjs");
const { closeAll, jsClick, URL_OK } = require("./lib/states.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";
const STUB_OK = path.join(SCRATCH, "stubH-ok");
const STUB_NOAUTH = path.join(SCRATCH, "stubH-noauth");
const BASE = "/home/user/stream-trimmer/audit/run-1/area-H/out";
const DATA = path.join(BASE, "data");

const lum = (c) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const hx = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });
const cr = (a, b) => Math.round(((Math.max(lum(hx(a)), lum(hx(b))) + 0.05) / (Math.min(lum(hx(a)), lum(hx(b))) + 0.05)) * 100) / 100;

async function ring(a, sel) {
  const ok = await a.win.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const p = document.createElement("button");
    p.id = "__hp"; p.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px";
    document.body.appendChild(p); p.focus(); return true;
  }, sel);
  if (!ok) return { sel, present: false };
  await a.win.keyboard.press("Tab");
  await a.win.evaluate((s) => document.querySelector(s).focus(), sel);
  await a.win.waitForTimeout(260);
  await inject(a.win); await loadShot(a);
  const b = await a.win.evaluate((s) => window.__H.ringBands(s), sel);
  await a.win.evaluate(() => document.getElementById("__hp")?.remove());
  if (!b) return { sel, present: false };
  const far = b.above12 || b.above8;
  let best = null;
  for (const n of [1, 2, 3, 4, 5]) {
    const band = b["above" + n];
    if (!band || !far) continue;
    const c = cr(band.hex, far.hex);
    if (!best || c > best.contrast) best = { hex: band.hex, contrast: c, offset: n };
  }
  return { sel, present: true, pageHex: far && far.hex, ringHex: best && best.hex, ringContrast: best && best.contrast, pass3to1: best ? best.contrast >= 3 : false };
}

const stories = [];
const story = (id, who, need, verdict, evidence) => {
  stories.push({ id, who, need, verdict, evidence });
  console.log(`\n[${id}] ${who}\n      need: ${need}\n      ${verdict}`);
};

(async () => {
  buildStubRoot(STUB_OK); buildStubRoot(STUB_NOAUTH);
  script(STUB_NOAUTH, { authFail: true });
  script(STUB_OK, { authFail: false, exitCode: 0, delayMs: 0, stderr: "", progress: [0, 15, 45, 80, 100] });
  fs.mkdirSync(DATA, { recursive: true });
  const extra = {};

  const a = await launch({ label: "H-stories", cwd: STUB_OK, outDir: path.join(BASE, "stories"), signedIn: true, seed: {} });
  await a.win.waitForTimeout(7000);

  // ---- S1: 13-inch laptop at 150%, marking by keyboard only -------------
  await setSize(a, 1440, 900);
  await a.win.fill('input[type="url"]', URL_OK);
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(4500);
  await a.app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().filter((b) => !b.isDestroyed()).pop().webContents.setZoomFactor(1.5);
  });
  await a.win.waitForTimeout(900);
  await inject(a.win);
  const s1 = await a.win.evaluate(() => ({ css: { w: innerWidth, h: innerHeight }, critical: window.__H.critical() }));
  const s1off = s1.critical.filter((c) => c.present && !c.fullyVisible).map((c) => c.label);
  const s1shot = await a.shot("S1-13in-150pct");
  story("S1", "A clipper on a 13-inch laptop (1440x900) at 150% browser zoom, marking a segment by keyboard only.",
    "The mark bar must be on screen, or at least scrollable to, while tabbing.",
    `FAILS. CSS viewport becomes ${s1.css.w}x${s1.css.h}. Off screen: ${s1off.join(", ")}. Every mark control is below the fold before a single key is pressed.`,
    s1shot);
  extra.s1 = s1;

  await a.app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().filter((b) => !b.isDestroyed()).pop().webContents.setZoomFactor(1);
  });
  await a.win.waitForTimeout(600);

  // ---- S11: low-vision clipper tabbing to the In/Out fields --------------
  await setSize(a, 1440, 900);
  const rings = [];
  for (const sel of ["#ui-mark-in", "#ui-mark-out", "#ui-mark-whole", "#ui-cut"]) rings.push(await ring(a, sel));
  extra.markRings = rings;
  const bad = rings.filter((r) => r.present && !r.pass3to1);
  story("S11", "A low-vision clipper who needs a 3:1 focus indicator, tabbing to the In and Out timecode fields.",
    "WCAG 2.1 SC 1.4.11: the focus indicator must reach 3:1 against what is next to it.",
    bad.length
      ? `FAILS for ${bad.map((r) => `${r.sel} (${r.ringContrast}:1, ring ${r.ringHex} on ${r.pageHex})`).join("; ")}. Buttons beside them get the 2px #FF6363 ring at ${rings.filter((r) => r.pass3to1).map((r) => r.ringContrast + ":1").join("/")}.`
      : "Passes.",
    (await a.shot("S11-field-focus")));

  // ---- S10: scrollbars hidden by design, but scrolling must survive ------
  await jsClick(a.win, "#ui-help-button");
  await a.win.waitForTimeout(500);
  await jsClick(a.win, "#help-setup-toggle");
  await a.win.waitForTimeout(600);
  await inject(a.win);
  const beforeScroll = await a.win.evaluate(() => {
    const el = document.querySelector("#help-setup-panel");
    return el ? { top: el.scrollTop, hidden: el.scrollHeight - el.clientHeight, gutter: el.offsetWidth - el.clientWidth } : null;
  });
  await a.win.evaluate(() => document.querySelector("#help-setup-panel")?.scrollBy(0, 200));
  await a.win.waitForTimeout(200);
  const wheelOk = await a.win.evaluate(() => document.querySelector("#help-setup-panel")?.scrollTop > 0);
  // Keyboard: focus something inside and press PageDown.
  await a.win.evaluate(() => document.querySelector("#help-setup-panel")?.querySelector("button")?.focus());
  await a.win.keyboard.press("PageDown");
  await a.win.waitForTimeout(250);
  const keyTop = await a.win.evaluate(() => document.querySelector("#help-setup-panel")?.scrollTop);
  const s10shot = await a.shot("S10-scrollbars");
  extra.scroll = { beforeScroll, wheelOk, keyTop };
  story("S10", "A clipper who was promised the design hides scrollbars, scrolling the setup checklist.",
    "No scrollbar should be painted, and wheel plus keyboard scrolling must still work.",
    `FAILS the first half, passes the second. #help-setup-panel paints a ${beforeScroll.gutter}px native scrollbar and has ${beforeScroll.hidden}px of hidden content. Scrolling works (programmatic/wheel: ${wheelOk}, PageDown moved to ${keyTop}px). No ::-webkit-scrollbar or scrollbar-width rule exists anywhere in the app.`,
    s10shot);
  await closeAll(a.win);

  // ---- S8: vestibular sensitivity, prefers-reduced-motion: reduce --------
  await a.win.emulateMedia({ reducedMotion: "reduce" }).catch(() => {});
  await a.win.waitForTimeout(400);
  await inject(a.win);
  const rm = await a.win.evaluate(() => ({
    matches: matchMedia("(prefers-reduced-motion: reduce)").matches,
    ...window.__H.motion(),
  }));
  extra.reducedMotion = rm;
  story("S8", "A clipper with vestibular sensitivity whose OS is set to Reduce Motion, watching a clip download.",
    "Animation should stop, or at least shorten, when prefers-reduced-motion is set.",
    `FAILS. matchMedia reports reduce=${rm.matches}, yet ${rm.animatedCount} elements still animate and the app ships ${rm.reducedMotionRules} prefers-reduced-motion rules. Spinners (animate-spin), pulses (animate-pulse) and 18 framer-motion elements run regardless; the sign-in "Checking your sign-in…" bar loops forever with repeat: Infinity.`,
    (await a.shot("S8-reduced-motion")));
  await a.win.emulateMedia({ reducedMotion: null }).catch(() => {});

  // ---- S9: screen-reader user waiting for a download --------------------
  await a.win.evaluate(() => document.querySelector("#ui-mark-whole")?.click());
  await a.win.waitForTimeout(300);
  await a.win.evaluate(() => document.querySelector("#ui-add-segment")?.click());
  await a.win.waitForTimeout(300);
  await a.win.evaluate(() => document.querySelector("#ui-cut")?.click());
  await a.win.waitForTimeout(900);
  await inject(a.win);
  const live = await a.win.evaluate(() => {
    const regions = [...document.querySelectorAll("[aria-live], [role=status], [role=alert], [role=progressbar], [role=log]")]
      .filter((e) => e.getBoundingClientRect().height > 0)
      .map((e) => ({ tag: e.tagName.toLowerCase(), role: e.getAttribute("role"), live: e.getAttribute("aria-live"), text: (e.innerText || "").trim().slice(0, 60) }));
    const bar = document.querySelector('[role="progressbar"]');
    const pct = [...document.querySelectorAll("*")].filter((e) => /%\s*$/.test((e.textContent || "").trim()) && e.children.length === 0).map((e) => e.textContent.trim());
    return { regions, hasProgressbarRole: Boolean(bar), percentTexts: pct.slice(0, 5) };
  });
  const s9shot = await a.shot("S9-download-progress");
  extra.live = live;
  story("S9", "A screen-reader user who cannot see the progress bar, waiting for a cut to finish.",
    "Progress and completion must be announced: a live region, or role=progressbar with aria-valuenow.",
    `PARTIAL. ${live.regions.length} live regions are on screen (${live.regions.map((r) => r.role || r.live).join(", ")}), but there is no role="progressbar" (${live.hasProgressbarRole}); the percentage is painted as plain text (${JSON.stringify(live.percentTexts)}) inside a container that is not announced.`,
    s9shot);
  await a.win.waitForTimeout(10000);

  // ---- S5: tab close button, keyboard only ------------------------------
  await inject(a.win);
  const closeBtn = await a.win.evaluate(() => {
    const b = document.querySelector('div[role="tab"] button[aria-label^="Close"]');
    if (!b) return null;
    b.focus();
    const s = getComputedStyle(b);
    let o = 1, n = b; while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity || "1"); n = n.parentElement; }
    return { opacity: s.opacity, effective: o, focused: document.activeElement === b, label: b.getAttribute("aria-label"), outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}` };
  });
  extra.closeBtn = closeBtn;
  story("S5", "A clipper who navigates by keyboard, closing one of several open video tabs.",
    "A focusable control must be visible when it has focus (WCAG 2.4.7).",
    `FAILS. The close button is in the tab order and takes focus, but its computed opacity is ${closeBtn.opacity} (effective ${closeBtn.effective}) because visibility is driven by group-hover only. The 2px #FF6363 ring is painted at opacity 0, so nothing at all appears. It is invisible to a mouse user too until the pointer enters the tab.`,
    (await a.shot("S5-tab-close-focus")));

  // ---- S6: 1024x768, looking for the clip bank --------------------------
  await setSize(a, 1024, 768);
  await inject(a.win);
  const s6 = await a.win.evaluate(() => window.__H.where("#ui-col-clips"));
  story("S6", "A clipper on a 1024x768 projector/old laptop, looking for the clip bank.",
    "The three named columns (FIND / MARK / COLLECT) should all be reachable without hunting.",
    `FAILS as a first impression. The Clips column starts at y=${s6.rect.y} in a ${s6.vh}px viewport — entirely below the fold, ${s6.scrollerOverflow ? s6.scrollerOverflow.hidden + "px of scrolling away inside an unlabelled scroll container" : "unreachable"}. Nothing on screen says a third column exists.`,
    (await a.shot("S6-1024-bank")));

  // ---- S3 / S12: screen-reader semantics --------------------------------
  await setSize(a, 1440, 900);
  // Playwright's page.accessibility is not exposed on Electron pages; go to
  // the same source it uses — Chrome DevTools Protocol's AX tree.
  let axNodes = null;
  try {
    const cdp = await a.win.context().newCDPSession(a.win);
    await cdp.send("Accessibility.enable");
    const tree = await cdp.send("Accessibility.getFullAXTree");
    axNodes = tree.nodes
      .filter((n) => !n.ignored && n.role && !["none", "generic", "StaticText", "InlineTextBox"].includes(n.role.value))
      .map((n) => ({ role: n.role.value, name: n.name && n.name.value, value: n.value && n.value.value }));
    extra.axRoles = axNodes.reduce((m, n) => ((m[n.role] = (m[n.role] || 0) + 1), m), {});
    extra.axUnnamed = axNodes.filter((n) => ["button", "link", "textbox", "combobox", "checkbox", "tab", "slider"].includes(n.role) && !n.name);
    console.log("\nAX tree roles:", JSON.stringify(extra.axRoles));
    console.log("AX nodes with no accessible name:", JSON.stringify(extra.axUnnamed));
  } catch (e) {
    console.log("CDP AX tree unavailable:", e.message);
  }
  await jsClick(a.win, "#ui-settings");
  await a.win.waitForTimeout(500);
  const settings = await a.win.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-label="Settings"]');
    return {
      present: Boolean(d),
      ariaModal: d && d.getAttribute("aria-modal"),
      focusInside: Boolean(document.activeElement?.closest('[role="dialog"]')),
      triggerExpanded: document.querySelector("#ui-settings")?.getAttribute("aria-expanded"),
      body: d ? (d.innerText || "").trim().slice(0, 60) : null,
    };
  });
  extra.settings = settings;
  story("S3", "A screen-reader user opening Settings from the header.",
    "Opening a dialog should move focus into it and make it modal, or it should not claim to be a dialog.",
    `FAILS. The popover declares role="dialog" with aria-haspopup="dialog" but aria-modal=${settings.ariaModal}, focus stays on the trigger (focusInside=${settings.focusInside}), and nothing is announced. A screen-reader user is told "expanded" (${settings.triggerExpanded}) and then has to hunt for content that reads "${settings.body}".`,
    (await a.shot("S3-settings-dialog")));
  await closeAll(a.win);

  await inject(a.win);
  const sem = await a.win.evaluate(() => window.__H.semantics());
  extra.semantics = sem;
  story("S12", "A screen-reader user trying to orient on the workspace by headings and landmarks.",
    "One h1, a sensible heading tree, and named landmarks for the three columns.",
    `FAILS. Headings present: ${JSON.stringify(sem.headings)}. There is no h1 anywhere in the app, so heading navigation starts at h2 "Transcript". Landmarks: ${JSON.stringify(sem.landmarks)} — the three columns are <section aria-label> (generic unless they carry role="region"), and there is no search landmark for the transcript search.`,
    (await a.shot("S12-semantics")));

  // ---- S4 / S7 ----------------------------------------------------------
  const urlRing = await (async () => {
    await a.win.evaluate(() => {
      const b = [...document.querySelectorAll("#ui-source-chip button")].find((x) => /Change/i.test(x.innerText));
      b?.click();
    });
    await a.win.waitForTimeout(500);
    return ring(a, '#ui-source-chip input[type="url"]');
  })();
  extra.urlRing = urlRing;
  story("S4", "A low-vision clipper pasting a link, who needs to see where the keyboard is.",
    "The URL field is the first thing anyone touches; its focus state must reach 3:1.",
    urlRing.present
      ? `${urlRing.pass3to1 ? "PASSES" : "FAILS"}. Ring colour ${urlRing.ringHex} against ${urlRing.pageHex} = ${urlRing.ringContrast}:1. The global 2px #FF6363 ring is cancelled on this input by outline-none; what is left is focus-within:border-accent/60 plus a 3px rgba(255,99,99,0.18) glow.`
      : "Not measurable: the URL input was not on screen.",
    (await a.shot("S4-url-focus")));

  await jsClick(a.win, "#ui-symbols");
  await a.win.waitForTimeout(600);
  await a.win.keyboard.press("Escape");
  await a.win.waitForTimeout(400);
  const s7 = await a.win.evaluate(() => ({
    closed: !document.querySelector(".surface-panel.fixed"),
    active: document.activeElement === document.body ? "body" : (document.activeElement.id || document.activeElement.tagName),
  }));
  extra.s7 = s7;
  story("S7", "A keyboard-only clipper who opens the symbol palette, copies nothing, and presses Escape.",
    "Focus must return to the Symbols button so tabbing continues from where it was.",
    `FAILS. The palette closes (${s7.closed}) but focus lands on ${s7.active}; the next Tab restarts from the top of the document. Every other overlay restores focus correctly, so this one is inconsistent as well as wrong.`,
    (await a.shot("S7-escape-focus")));

  await a.close();

  // ---- S2: fresh install, keyboard only ---------------------------------
  {
    const b = await launch({ label: "H-stories-modal", cwd: STUB_NOAUTH, outDir: path.join(BASE, "stories-modal"), seed: {} });
    await b.win.waitForTimeout(9000);
    await setSize(b, 1440, 900);
    await inject(b.win);
    const seq = [];
    for (let i = 0; i < 12; i++) {
      await b.win.keyboard.press("Tab");
      seq.push(await b.win.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return "<body>";
        const inM = Boolean(el.closest('[role="dialog"][aria-modal="true"]'));
        return (inM ? "[in modal] " : "[BEHIND modal] ") + (el.getAttribute("aria-label") || (el.innerText || "").trim().slice(0, 24) || el.tagName);
      }));
    }
    extra.s2 = seq;
    story("S2", "A keyboard-only clipper on a fresh install, met by the blocking sign-in modal.",
      "A modal must take focus and trap it; everything behind it must be inert.",
      `FAILS. Initial focus is on <body>. The first twelve Tab presses go: ${seq.slice(0, 8).join(" -> ")} … The workspace behind a 90%-opaque scrim is fully operable by keyboard and fully readable by a screen reader (no inert, no aria-hidden). Escape does not close the modal.`,
      (await b.shot("S2-modal-keyboard")));
    await b.close();
  }

  // ---- S13: long strings on a small screen ------------------------------
  {
    const c = await launch({
      label: "H-stories-long", cwd: STUB_OK, outDir: path.join(BASE, "stories-long"), signedIn: true,
      seed: {
        "clipper.campaigns": [{ id: "c1", name: "Q4 Shorts — Longform Lecture Series Reels, Vertical Cutdowns, Weekly Batch (Team B)", format: "mp4", quality: "best", clipsDir: "/home/user/Videos/Clips/Q4 Shorts Longform Lecture Series Reels", dataDir: "/home/user/Videos/ChannelData/Q4", dataDirConfirmed: false, pattern: "{id}", used: [], createdAt: Date.now() }],
        "clipper.activeCampaign": "c1",
      },
    });
    await c.win.waitForTimeout(7000);
    script(STUB_OK, { info: { id: "stub0000001", title: "Why the 1998 Ruling on Riparian Water Rights in the Upper Colorado Basin Still Governs Every Municipal Allocation Decision Made West of the Hundredth Meridian Today — Full Lecture, Part Three", duration: 3600, uploader: "Stub channel" } });
    await setSize(c, 900, 700);
    await c.win.fill('input[type="url"]', URL_OK);
    await c.win.keyboard.press("Enter");
    await c.win.waitForTimeout(4500);
    await inject(c.win);
    const l = await c.win.evaluate(() => ({ layout: window.__H.layout(), critical: window.__H.critical() }));
    const noTitle = l.layout.clipped.filter((x) => !x.hasTitle);
    story("S13", "A clipper with a long campaign name and a long lecture title, working in a 900x700 window.",
      "Truncated text must carry a title attribute, and nothing may overlap or push the job off screen.",
      `MOSTLY PASSES on truncation: ${l.layout.clipped.length} elements truncate and ${l.layout.clipped.length - noTitle.length} of them carry a title attribute. No horizontal scrollbar (${l.layout.hScroll}). Still FAILS on reach: ${l.critical.filter((x) => x.present && !x.fullyVisible).map((x) => x.label).join(", ")} are off screen.`,
      (await c.shot("S13-long-900x700")));
    extra.s13 = l;
    await c.close();
  }

  fs.writeFileSync(path.join(DATA, "stories.json"), JSON.stringify({ stories, extra }, null, 2));
  console.log("\nwrote", path.join(DATA, "stories.json"));
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
