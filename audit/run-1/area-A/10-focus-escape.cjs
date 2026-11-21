/**
 * A-10: the modal's focus containment. A keyboard user can reach and operate
 * the controls the modal is covering; a pointer user cannot.
 */
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");
const L = require("./lib.cjs");

(async () => {
  L.stub({ app: { exitCode: 0 }, browser: { exitCode: 0 } });
  const a = await launchApp({ label: "A-10", cwd: L.STUB, outDir: `${L.OUT}/A-10` });
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 20000 });
    await a.win.waitForTimeout(4500);
    console.log("modal open:", await a.win.evaluate(() => !!document.querySelector('[role="dialog"]')));

    // pointer: the covered Help button cannot be clicked
    const pointer = await a.win
      .click("#ui-help-button", { timeout: 2500 })
      .then(() => "clicked")
      .catch((e) => "blocked: " + String(e).split("\n")[0]);
    console.log("pointer click on the covered Help button:", pointer);

    // keyboard: tab to it and press Enter
    let found = false;
    for (let i = 0; i < 30 && !found; i++) {
      await a.win.keyboard.press("Tab");
      found = await a.win.evaluate(() => document.activeElement?.id === "ui-help-button");
    }
    console.log("Help button reachable by Tab while the modal is open:", found);
    if (found) {
      await a.win.keyboard.press("Enter");
      await a.win.waitForTimeout(800);
      console.log(
        "help drawer opened behind the modal:",
        await a.win.evaluate(() => Boolean(document.getElementById("ui-help-drawer"))),
      );
      console.log(
        "setup checklist reachable while not signed in:",
        await a.win.evaluate(() => {
          const t = document.getElementById("help-setup-toggle");
          t?.click();
          return Boolean(t);
        }),
      );
      await a.win.waitForTimeout(700);
      console.log(
        "checklist rows found:",
        await a.win.evaluate(() => document.querySelectorAll("[data-setup-item]").length),
      );
      console.log("SHOT", await a.shot("help-opened-behind-modal"));
    }

    // Escape, on the drawer and on the modal
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(500);
    console.log(
      "after Escape: drawer =",
      await a.win.evaluate(() => Boolean(document.getElementById("ui-help-drawer"))),
      "| modal =",
      await a.win.evaluate(() => !!document.querySelector('[role="dialog"]')),
    );
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(500);
    console.log(
      "after a second Escape: modal =",
      await a.win.evaluate(() => !!document.querySelector('[role="dialog"]')),
    );
    console.log("SHOT", await a.shot("after-escapes"));
  } finally {
    await a.close();
  }
})();
