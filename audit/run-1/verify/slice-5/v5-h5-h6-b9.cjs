/**
 * File: v5-h5-h6-b9.cjs
 * Path: audit/run-1/verify/slice-5/v5-h5-h6-b9.cjs
 * Description: Verifies H-5 (tab close button takes focus at opacity 0),
 *   H-6 (native 15px scrollbars where the design asks for hidden ones) and
 *   B-9 (25 tabs: strip never scrolls to the active tab, + is off screen).
 *   Each is driven from its own finding's Steps, cold start per case.
 *
 *   Audit-only; changes no product code.
 */
const fs = require("node:fs");
const { boot, loadVideo, log } = require("./v5-lib.cjs");

// ---------------------------------------------------------------- H-5
async function h5(run) {
  const a = await boot(`h5-${run}`);
  const out = { run };

  // Steps say: from a cold start, press Tab twice.
  const stops = [];
  for (let i = 0; i < 4; i++) {
    await a.win.keyboard.press("Tab");
    stops.push(
      await a.win.evaluate(() => {
        const el = document.activeElement;
        return {
          tag: el.tagName.toLowerCase(),
          label: el.getAttribute?.("aria-label") || (el.textContent || "").trim().slice(0, 24),
          isCloseTab: /^Close /.test(el.getAttribute?.("aria-label") || ""),
        };
      }),
    );
  }
  out.firstFourStops = stops;

  // Focus the close button explicitly and read what is painted.
  out.closeBtn = await a.win.evaluate(() => {
    const btn = document.querySelector('div[role="tab"] button[aria-label^="Close"], button[aria-label^="Close "][aria-label*="tab"]');
    if (!btn) return { missing: true };
    btn.focus();
    const cs = getComputedStyle(btn);
    let eff = 1, n = btn;
    while (n && n.nodeType === 1) {
      const v = parseFloat(getComputedStyle(n).opacity);
      if (!Number.isNaN(v)) eff *= v;
      n = n.parentElement;
    }
    const r = btn.getBoundingClientRect();
    return {
      ariaLabel: btn.getAttribute("aria-label"),
      isActiveElement: document.activeElement === btn,
      matchesFocusVisible: btn.matches(":focus-visible"),
      ownOpacity: cs.opacity,
      effectiveOpacity: Number(eff.toFixed(3)),
      outline: cs.outline,
      outlineColor: cs.outlineColor,
      tabIndex: btn.tabIndex,
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      className: btn.className,
    };
  });

  // Byte-for-byte diff of the button's own box, unfocused vs focused.
  if (!out.closeBtn.missing) {
    const box = out.closeBtn.rect;
    const clip = { x: Math.max(0, box.x - 4), y: Math.max(0, box.y - 4), width: box.w + 8, height: box.h + 8 };
    await a.win.evaluate(() => document.activeElement.blur());
    await a.win.waitForTimeout(200);
    const before = await a.win.screenshot({ clip });
    await a.win.evaluate(() => {
      document.querySelector('div[role="tab"] button[aria-label^="Close"]').focus();
    });
    await a.win.waitForTimeout(300);
    const after = await a.win.screenshot({ clip });
    out.paintChanged = !before.equals(after);
    out.beforeBytes = before.length;
    out.afterBytes = after.length;
    const dir = `${a.outDir}`;
    fs.writeFileSync(`${dir}/h5-close-unfocused.png`, before);
    fs.writeFileSync(`${dir}/h5-close-focused.png`, after);
    out.shots = [`${dir}/h5-close-unfocused.png`, `${dir}/h5-close-focused.png`];

    // control: does a normal button's box change when focused?
    const ctrlBox = await a.win.evaluate(() => {
      const b = document.querySelector("#ui-settings");
      b.blur();
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    });
    const cclip = { x: Math.max(0, ctrlBox.x - 5), y: Math.max(0, ctrlBox.y - 5), width: ctrlBox.w + 10, height: ctrlBox.h + 10 };
    const cBefore = await a.win.screenshot({ clip: cclip });
    await a.win.evaluate(() => document.querySelector("#ui-settings").focus());
    await a.win.waitForTimeout(250);
    const cAfter = await a.win.screenshot({ clip: cclip });
    out.controlPaintChanged = !cBefore.equals(cAfter);
  }

  // And with the pointer hovering the tab, which is the documented way to see it.
  out.hoverOpacity = await a.win.evaluate(() => {
    const tab = document.querySelector('div[role="tab"]');
    const btn = tab && tab.querySelector('button[aria-label^="Close"]');
    return btn ? getComputedStyle(btn).opacity : null;
  });
  await a.shot("tabstrip");
  await a.close();
  return out;
}

// ---------------------------------------------------------------- H-6
const SCROLLER_PROBE = `(() => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    if (!(el instanceof HTMLElement)) continue;
    const cs = getComputedStyle(el);
    const scrollableY = (cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight - el.clientHeight > 2;
    const scrollableX = (cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth - el.clientWidth > 2;
    if (!scrollableY && !scrollableX) continue;
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const br = parseFloat(cs.borderRightWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0;
    const bb = parseFloat(cs.borderBottomWidth) || 0;
    out.push({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      cls: String(el.className).split(/\\s+/).slice(0, 3).join("."),
      gutterX: Math.round(el.offsetWidth - el.clientWidth - bl - br),
      gutterY: Math.round(el.offsetHeight - el.clientHeight - bt - bb),
      hiddenY: el.scrollHeight - el.clientHeight,
      hiddenX: el.scrollWidth - el.clientWidth,
      scrollbarWidth: cs.scrollbarWidth,
      scrollbarGutter: cs.scrollbarGutter,
    });
  }
  return out;
})()`;

async function h6(run) {
  const out = { run, states: {} };
  // 1024x768 with the help drawer and the setup checklist, then the overlays.
  const a = await boot(`h6-${run}`, { viewport: { width: 1024, height: 768 } });
  await loadVideo(a);
  out.states["workspace 1024x768"] = await a.win.evaluate(SCROLLER_PROBE);
  await a.win.click("#ui-help-button");
  await a.win.waitForTimeout(800);
  out.states["help drawer open"] = await a.win.evaluate(SCROLLER_PROBE);
  await a.shot("help-drawer");
  await a.win.keyboard.press("Escape");
  await a.win.click("#ui-symbols");
  await a.win.waitForTimeout(600);
  out.states["symbol palette"] = await a.win.evaluate(SCROLLER_PROBE);
  await a.shot("symbol-palette");
  await a.win.keyboard.press("Escape");
  out.horizontalPageScroll = await a.win.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  await a.close();

  // The sign-in modal is its own state.
  const b = await boot(`h6-modal-${run}`, { signedIn: false, viewport: { width: 1024, height: 768 } });
  await b.win.waitForSelector('[aria-labelledby="youtube-connect-title"]', { timeout: 40000 });
  out.states["sign-in modal"] = await b.win.evaluate(SCROLLER_PROBE);
  await b.shot("signin-modal");
  await b.close();

  out.scrollbarCssInSource = (() => {
    const { execSync } = require("node:child_process");
    try {
      return execSync(
        "grep -rn 'scrollbar' /home/user/stream-trimmer/src/ /home/user/stream-trimmer/index.html /home/user/stream-trimmer/tailwind.config.ts || true",
      ).toString().trim() || "(no hits)";
    } catch { return "(grep failed)"; }
  })();
  return out;
}

// ---------------------------------------------------------------- B-9
async function b9(run) {
  const tabs = Array.from({ length: 25 }, (_, i) => ({ id: `ws_seed_${i}`, name: "" }));
  const a = await boot(`b9-${run}`, {
    seed: { "clipper.workspaces": { tabs, activeId: tabs[24].id } },
  });
  await a.win.waitForTimeout(1500);
  const out = { run };
  out.strip = await a.win.evaluate(() => {
    // The strip has no role="tablist" — it is the overflow-x-auto div that owns
    // the role="tab" children and the "New tab" button. Pick the VISIBLE one.
    const plus = [...document.querySelectorAll('button[aria-label="New tab"]')].find(
      (b) => b.getBoundingClientRect().width > 0,
    );
    const strip = plus ? plus.parentElement : null;
    const tabsEls = strip ? [...strip.querySelectorAll(':scope > [role="tab"]')] : [];
    const active = tabsEls.find((t) => t.getAttribute("aria-selected") === "true");
    const inStrip = (el) => {
      if (!el || !strip) return null;
      const r = el.getBoundingClientRect();
      const s = strip.getBoundingClientRect();
      return r.left >= s.left - 1 && r.right <= s.right + 1;
    };
    return {
      stripFound: !!strip,
      stripClass: strip ? strip.className : null,
      tabsInVisibleStrip: tabsEls.length,
      roleTabInWholeDoc: document.querySelectorAll('[role="tab"]').length,
      headersInWholeDoc: document.querySelectorAll("header").length,
      activeIndex: active ? tabsEls.indexOf(active) : -1,
      activeInView: inStrip(active),
      activeRect: active ? Math.round(active.getBoundingClientRect().left) : null,
      newTabButtonInView: inStrip(plus),
      newTabLeft: plus ? Math.round(plus.getBoundingClientRect().left) : null,
      scrollLeft: strip ? strip.scrollLeft : null,
      scrollWidth: strip ? strip.scrollWidth : null,
      clientWidth: strip ? strip.clientWidth : null,
      stripOverflowX: strip ? getComputedStyle(strip).overflowX : null,
      horizontalScrollbarPx: strip ? strip.offsetHeight - strip.clientHeight : null,
      mountedMarkBars: document.querySelectorAll("[id='ui-mark-in']").length,
      mountedCutButtons: document.querySelectorAll("[id='ui-cut']").length,
      mountedTranscriptCols: document.querySelectorAll("[id='ui-col-transcript']").length,
    };
  });
  // Does anything scroll the strip to the selection by itself?
  out.afterSelectingLastTab = await a.win.evaluate(() => {
    const plus = [...document.querySelectorAll('button[aria-label="New tab"]')].find(
      (b) => b.getBoundingClientRect().width > 0,
    );
    const strip = plus ? plus.parentElement : null;
    return strip ? { scrollLeft: strip.scrollLeft, scrollWidth: strip.scrollWidth, clientWidth: strip.clientWidth } : null;
  });
  await a.shot("25-tabs");
  out.pageErrors = a.logs.pageErrors.slice(0, 3);
  await a.close();
  return out;
}

(async () => {
  const which = process.argv[2] || "all";
  for (const run of [1, 2]) {
    if (which === "all" || which === "h5") {
      const o = await h5(run);
      log(`\n=== H-5 run ${run} ===`);
      log("first four Tab stops:", JSON.stringify(o.firstFourStops));
      log("close button:", JSON.stringify(o.closeBtn, null, 1));
      log("paint changed when focused:", o.paintChanged, " (control #ui-settings changed:", o.controlPaintChanged + ")");
      log("opacity with no hover:", o.hoverOpacity);
      log("shots:", JSON.stringify(o.shots));
    }
    if (which === "all" || which === "h6") {
      const o = await h6(run);
      log(`\n=== H-6 run ${run} ===`);
      for (const [state, list] of Object.entries(o.states)) {
        log(` [${state}] ${list.length} scroller(s)`);
        for (const s of list) {
          log(`   ${s.tag}#${s.id || "-"}.${s.cls} gutterX=${s.gutterX}px hiddenY=${s.hiddenY}px scrollbar-width=${s.scrollbarWidth} scrollbar-gutter=${s.scrollbarGutter}`);
        }
      }
      log(" horizontal page scroll:", JSON.stringify(o.horizontalPageScroll));
      log(" scrollbar CSS in source:", o.scrollbarCssInSource);
    }
    if (which === "all" || which === "b9") {
      const o = await b9(run);
      log(`\n=== B-9 run ${run} ===`);
      log(JSON.stringify(o.strip, null, 1));
      log("pageErrors:", JSON.stringify(o.pageErrors));
    }
  }
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
