/**
 * A-12: which browser the three-step instructions name, before and after the
 * automatic sweep. The modal's own doc comment promises "The extension is
 * named for the user's browser."
 */
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");
const L = require("./lib.cjs");

const step1 = (win) =>
  win.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const li = d?.querySelectorAll("ol li")[0];
    const sel = d?.querySelector("select");
    return {
      step1: li ? li.innerText.split("\n")[0] : null,
      dropdown: sel ? sel.value : "(collapsed)",
      working: Array.from(d?.querySelectorAll('[role="status"]') ?? []).map((e) => e.textContent.trim()),
    };
  });

(async () => {
  L.stub({ app: { exitCode: 0 }, browser: { exitCode: 0, delayMs: 600 } });
  const a = await launchApp({ label: "A-12", cwd: L.STUB, outDir: `${L.OUT}/A-12` });
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 20000 });
    console.log("default browser reported by main:", JSON.stringify(await L.ipc(a.win, "system:defaultBrowser")));
    console.log("browser order:", JSON.stringify(await L.ipc(a.win, "system:browserOrder", null)));
    console.log("at open    :", JSON.stringify(await step1(a.win)));
    await a.win.waitForTimeout(4000);
    console.log("mid-sweep  :", JSON.stringify(await step1(a.win)));
    for (let i = 0; i < 30; i++) {
      await a.win.waitForTimeout(1000);
      const s = await step1(a.win);
      if (s.working.length === 0) break;
    }
    console.log("after sweep:", JSON.stringify(await step1(a.win)));
    await a.win.click('[role="dialog"] button:has-text("Pick a browser")').catch(() => {});
    await a.win.waitForTimeout(400);
    console.log("dropdown   :", JSON.stringify(await step1(a.win)));
    console.log("SHOT", await a.shot("browser-label-after-sweep"));
  } finally {
    await a.close();
  }
})();
