/**
 * File: v5-h2-modal.cjs
 * Path: audit/run-1/verify/slice-5/v5-h2-modal.cjs
 * Description: H-2 verification. Cold start with NO cookies file and a stub that
 *   refuses the auth probe, so the sign-in modal genuinely stays up. Then:
 *     - record document.activeElement on open,
 *     - press Tab 40 times, recording where focus lands each time and whether
 *       that node is inside the dialog,
 *     - read aria-hidden / inert on the background,
 *     - press Escape and see whether the dialog is still there,
 *     - click a background control through the scrim and see whether it acts.
 *
 *   Audit-only; changes no product code.
 */
const { boot, log } = require("./v5-lib.cjs");

async function describeFocus(win) {
  return win.evaluate(() => {
    const el = document.activeElement;
    if (!el) return { tag: "none" };
    const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
    const label =
      el.getAttribute?.("aria-label") ||
      (el.textContent || "").trim().slice(0, 34) ||
      el.getAttribute?.("placeholder") ||
      "";
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      label,
      insideDialog: !!(dlg && dlg.contains(el)),
      dialogExists: !!dlg,
    };
  });
}

async function once(run) {
  const a = await boot(`h2-modal-${run}`, { signedIn: false });
  const out = { run };

  // the modal must actually be up, or this run proves nothing
  await a.win.waitForSelector('[aria-labelledby="youtube-connect-title"]', { timeout: 40000 });
  out.modalAttrs = await a.win.evaluate(() => {
    const d = document.querySelector('[aria-labelledby="youtube-connect-title"]');
    const main = document.querySelector("main");
    const root = document.querySelector("#root");
    return {
      role: d.getAttribute("role"),
      ariaModal: d.getAttribute("aria-modal"),
      ariaHiddenOnMain: main ? main.getAttribute("aria-hidden") : "no <main>",
      inertOnMain: main ? main.inert : "no <main>",
      ariaHiddenOnRoot: root ? root.getAttribute("aria-hidden") : "no #root",
      inertOnRoot: root ? root.inert : "no #root",
      anyInertInDoc: document.querySelectorAll("[inert]").length,
      anyAriaHiddenTrue: document.querySelectorAll('[aria-hidden="true"]').length,
      scrimOpacityClass: d.className,
      focusableInsideDialog: d.querySelectorAll(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ).length,
    };
  });

  out.initialFocus = await describeFocus(a.win);
  await a.shot("signin-modal");

  // 40 Tab presses, exactly as the finding's steps say.
  const stops = [];
  for (let i = 0; i < 40; i++) {
    await a.win.keyboard.press("Tab");
    stops.push(await describeFocus(a.win));
  }
  out.tabStops = stops;
  out.outsideCount = stops.filter((s) => !s.insideDialog).length;
  out.insideCount = stops.filter((s) => s.insideDialog).length;
  out.distinctOutside = [...new Set(stops.filter((s) => !s.insideDialog).map((s) => s.label || s.tag))];

  // Escape
  await a.win.keyboard.press("Escape");
  await a.win.waitForTimeout(600);
  out.dialogAfterEscape = await a.win.evaluate(
    () => !!document.querySelector('[aria-labelledby="youtube-connect-title"]'),
  );

  // Can the background actually be operated through the scrim? Keyboard first.
  out.backgroundOperable = await a.win.evaluate(() => {
    const btn = document.querySelector("#ui-settings");
    if (!btn) return "no #ui-settings";
    btn.focus();
    const got = document.activeElement === btn;
    btn.click();
    const open = btn.getAttribute("aria-expanded");
    return { focusable: got, ariaExpandedAfterActivate: open };
  });
  await a.shot("after-escape-and-background-activate");

  // And with a real mouse click at the control's own coordinates — does the
  // scrim intercept it, or is the background genuinely live to the pointer?
  out.pointerHitsBackground = await a.win.evaluate(() => {
    const btn = document.querySelector("#ui-settings");
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      topElementAtSettings: top ? top.tagName.toLowerCase() + "." + String(top.className).split(/\s+/)[0] : null,
      isTheButton: top === btn || (top && btn.contains(top)),
    };
  });

  out.pageErrors = a.logs.pageErrors.slice(0, 3);
  await a.close();
  return out;
}

(async () => {
  for (const n of [1, 2]) {
    const o = await once(n);
    log(`\n=== run ${n} ===`);
    log("modal attributes:", JSON.stringify(o.modalAttrs, null, 2));
    log("initial focus:", JSON.stringify(o.initialFocus));
    log(`tab stops: ${o.insideCount} inside the dialog, ${o.outsideCount} outside, of 40`);
    log("distinct controls reached OUTSIDE the dialog:", JSON.stringify(o.distinctOutside));
    log("first 12 stops:");
    o.tabStops.slice(0, 12).forEach((s, i) => log(`   ${i + 1}. ${s.insideDialog ? "IN " : "OUT"} ${s.tag}#${s.id || "-"} "${s.label}"`));
    log("dialog still present after Escape:", o.dialogAfterEscape);
    log("background operable by keyboard:", JSON.stringify(o.backgroundOperable));
    log("pointer hit test over #ui-settings:", JSON.stringify(o.pointerHitsBackground));
    log("pageErrors:", JSON.stringify(o.pageErrors));
  }
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
