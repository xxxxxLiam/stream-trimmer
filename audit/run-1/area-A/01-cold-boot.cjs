/**
 * A-01: cold start, fresh install, no cookies file.
 * Proves: what a first-run user sees, whether the connect modal is dismissable,
 * Escape behaviour, whether the app behind it is reachable at all.
 */
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");
const L = require("./lib.cjs");

(async () => {
  L.stub({ exitCode: 0, writeMedia: false }); // plain run -> "inconclusive"
  const a = await launchApp({ label: "A-01-cold-boot", cwd: L.STUB, outDir: `${L.OUT}/A-01` });
  try {
    await a.win.waitForSelector("header", { timeout: 20000 }).catch(() => {});
    await a.win.waitForTimeout(3000);
    console.log("SHOT", await a.shot("cold-boot"));
    console.log("DUMP", JSON.stringify(await L.dump(a.win), null, 2));

    // Is there anything in the whole document that dismisses it?
    const dismiss = await a.win.evaluate(() => {
      const t = (document.body.innerText || "").toLowerCase();
      return {
        hasClose: /close|skip|not now|later|continue without|dismiss|×/.test(t),
        headerReachable: Boolean(document.querySelector("header")),
        headerClickable: (() => {
          const h = document.querySelector("header");
          if (!h) return null;
          const r = h.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return top ? `${top.tagName}.${top.className}`.slice(0, 80) : null;
        })(),
      };
    });
    console.log("DISMISS", JSON.stringify(dismiss, null, 2));

    // Escape
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(500);
    console.log("AFTER ESC modalOpen =", (await L.dump(a.win)).modalOpen);
    console.log("SHOT", await a.shot("after-escape"));

    // Keyboard-only walk: how many tabs before focus leaves the dialog?
    const walk = [];
    for (let i = 0; i < 24; i++) {
      await a.win.keyboard.press("Tab");
      walk.push(
        await a.win.evaluate(() => {
          const el = document.activeElement;
          if (!el) return "none";
          const inDialog = Boolean(el.closest('[role="dialog"]'));
          const label =
            (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 36);
          return `${inDialog ? "IN " : "OUT"} ${el.tagName} ${label}`;
        }),
      );
    }
    console.log("TAB WALK:");
    walk.forEach((w, i) => console.log(` ${String(i + 1).padStart(2)} ${w}`));

    // Labels on every control inside the modal
    const labels = await a.win.evaluate(() => {
      const root = document.querySelector('[role="dialog"]');
      return Array.from(root?.querySelectorAll("button, select, input, summary") ?? []).map((el) => ({
        tag: el.tagName,
        text: (el.textContent || "").trim().slice(0, 40),
        ariaLabel: el.getAttribute("aria-label"),
        named: Boolean((el.textContent || "").trim() || el.getAttribute("aria-label")),
      }));
    });
    console.log("LABELS", JSON.stringify(labels, null, 2));

    console.log("STATE", JSON.stringify(a.readState(), null, 2));
    console.log("CONSOLE", JSON.stringify(a.logs.console.slice(-20), null, 2));
    console.log("PAGEERRORS", JSON.stringify(a.logs.pageErrors, null, 2));
  } finally {
    await a.close();
  }
})();
