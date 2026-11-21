/**
 * F-03c: the help button during the blocking YouTube sign-in modal — the very
 * first screen a new user sees. Stub reports a genuine signed-out probe and no
 * cookies file is on disk.
 */
const L = require("./lib.cjs");

(async () => {
  L.stub({
    exitCode: 0,
    authStderr:
      "ERROR: [youtube] jNQXAC9IVRw: Sign in to confirm your age. This video may be inappropriate for some users.",
    authExitCode: 1,
  });
  const a = await L.boot("F-03c-signin-modal", { signedOut: true, noStub: true });
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.waitForTimeout(4000);
    const st = await a.win.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-modal="true"]');
      const b = document.getElementById("ui-help-button");
      const r = b?.getBoundingClientRect();
      const top = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
      return {
        modalOpen: Boolean(d),
        modalLabel: d?.getAttribute("aria-labelledby") ?? null,
        helpPresent: Boolean(b),
        helpBox: r ? { x: Math.round(r.x), y: Math.round(r.y), fromRight: Math.round(innerWidth - r.right) } : null,
        helpCoveredBy: top && b && !b.contains(top) ? `${top.tagName.toLowerCase()}.${String(top.className).slice(0, 60)}` : null,
        // Can a keyboard user reach it? Is it inside the modal's focus trap?
        helpTabbable: b ? b.tabIndex >= 0 && !b.hasAttribute("inert") : null,
        bodyInert: document.body.hasAttribute("inert"),
      };
    });
    console.log("STATE", JSON.stringify(st, null, 2));
    console.log("SHOT", await a.shot("signin-modal"));

    // Real click + real shortcut.
    let clickOk = true;
    try {
      await a.win.click("#ui-help-button", { timeout: 2500 });
    } catch (e) {
      clickOk = false;
      console.log("CLICK FAILED:", String(e).split("\n")[0]);
    }
    console.log("click succeeded:", clickOk, "drawer:", await a.win.evaluate(() => Boolean(document.getElementById("ui-help-drawer"))));

    await a.win.keyboard.press("Control+Slash");
    await a.win.waitForTimeout(500);
    console.log("after Ctrl+/ drawer:", await a.win.evaluate(() => Boolean(document.getElementById("ui-help-drawer"))));
    console.log("SHOT", await a.shot("after-help-shortcut"));
  } finally {
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
