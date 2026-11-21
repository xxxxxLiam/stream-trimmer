/** F-07a: debug a failing cut so F-07 can assert on the real error UI. */
const L = require("./lib.cjs");

(async () => {
  L.stub({ exitCode: 0, writeMedia: false, authStderr: null, info: { id: "stub0000001", title: "Stub video", duration: 60 } });
  const a = await L.boot("F-07a-debug-cut", { noStub: true });
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.locator("#ui-source-chip input").fill("https://www.youtube.com/watch?v=stub0000001");
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(5000);
    console.log("after load:", await a.win.evaluate(() => ({
      chip: document.getElementById("ui-source-chip")?.textContent?.slice(0, 60),
      cutDisabled: document.getElementById("ui-cut")?.disabled,
      cutText: document.getElementById("ui-cut")?.textContent,
      saveDir: document.getElementById("ui-footer-clips")?.textContent,
    })));

    L.stub({
      exitCode: 1,
      authStderr: null,
      stderr: "ERROR: Traceback (most recent call last): TypeError: NoneType object is not subscriptable",
      info: { id: "stub0000001", title: "Stub video", duration: 60 },
    });
    await a.win.evaluate(() => {
      [...document.querySelectorAll("button")].find((b) => /Whole video/.test(b.textContent))?.click();
    });
    await a.win.waitForTimeout(500);
    console.log("after whole video:", await a.win.evaluate(() => ({
      cutDisabled: document.getElementById("ui-cut")?.disabled,
      length: document.getElementById("ui-stitched-total")?.textContent,
      status: [...document.querySelectorAll('[role="status"],[role="alert"]')].map((n) => n.textContent.trim().slice(0, 120)),
    })));
    await a.win.evaluate(() => document.getElementById("ui-cut")?.click());
    for (const t of [1000, 2000, 3000, 5000, 8000]) {
      await a.win.waitForTimeout(t === 1000 ? 1000 : 2000);
      const s = await a.win.evaluate(() => ({
        alerts: [...document.querySelectorAll('[role="alert"]')].map((n) => n.textContent.trim().slice(0, 160)),
        status: [...document.querySelectorAll('[role="status"]')].map((n) => n.textContent.trim().slice(0, 120)),
        copyBtn: Boolean([...document.querySelectorAll("button")].find((b) => /Copy diagnostics/.test(b.textContent))),
      }));
      console.log(`t=${t}`, JSON.stringify(s));
    }
    console.log("SHOT", await a.shot("after-failed-cut"));
    console.log("CONSOLE", JSON.stringify(a.logs.console.slice(-15), null, 1));
  } finally {
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
