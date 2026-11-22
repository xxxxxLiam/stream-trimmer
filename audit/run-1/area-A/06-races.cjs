/**
 * A-06: order of actions, repetition and races.
 *  (a) drop a valid cookies.txt while the automatic browser sweep is running
 *  (b) double-click "Choose cookies.txt"
 *  (c) import the same file twice
 *  (d) press "Check browser" and then drop a file while that probe is in flight
 */
const fs = require("node:fs");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");
const L = require("./lib.cjs");

const CALLS = "/tmp/stub-A/calls.log";
const calls = () => {
  try {
    return fs.readFileSync(CALLS, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  } catch {
    return [];
  }
};
const resetCalls = () => fs.writeFileSync(CALLS, "");

const snap = async (win) =>
  win.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return {
      modal: Boolean(d),
      heading: document.getElementById("youtube-connect-title")?.textContent ?? null,
      working: Array.from(document.querySelectorAll('[role="status"]')).map((e) => e.textContent.trim()).join(" | "),
      alert: document.querySelector('[role="alert"]')?.textContent ?? null,
      chip:
        Array.from(document.querySelectorAll("button")).find((x) =>
          /signed in|not signed|expired|checking/i.test(x.textContent || ""),
        )?.textContent.trim() ?? null,
    };
  });

(async () => {
  // ---------- (a) drop during the sweep --------------------------------
  console.log("===== (a) a valid cookies.txt dropped DURING the automatic sweep =====");
  resetCalls();
  L.stub({
    app: { exitCode: 1, stderr: "[debug] Found YouTube account cookies", delayMs: 0 },
    browser: { exitCode: 0, delayMs: 900 },
  });
  let a = await launchApp({ label: "A-06-a", cwd: L.STUB, outDir: `${L.OUT}/A-06-a` });
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 20000 });
    await a.win.waitForTimeout(3000);
    console.log("mid-sweep:", JSON.stringify(await snap(a.win)));
    console.log("SHOT", await a.shot("mid-sweep"));
    const chooseDisabled = await a.win.evaluate(
      () =>
        Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) =>
          /Choose cookies/.test(b.textContent || ""),
        )?.disabled ?? null,
    );
    console.log("'Choose cookies.txt' disabled mid-sweep:", chooseDisabled);

    await L.dropCookieText(a.win, L.goodCookies());
    for (let i = 0; i < 8; i++) {
      await a.win.waitForTimeout(1000);
      console.log(`  t+${i + 1}s`, JSON.stringify(await snap(a.win)));
    }
    console.log("SHOT", await a.shot("after-drop-during-sweep"));
    // let the sweep run its full course
    for (let i = 0; i < 25; i++) {
      await a.win.waitForTimeout(1000);
      const s = await snap(a.win);
      if (!s.working && s.alert) break;
    }
    const end = await snap(a.win);
    console.log("END OF SWEEP:", JSON.stringify(end));
    console.log("cookie file still on disk:", fs.existsSync(L.cookieFileOf(a)));
    console.log("store:", JSON.stringify(a.readState()["clipper.authSource"]));
    console.log("SHOT", await a.shot("sweep-finished"));
  } finally {
    await a.close();
  }

  // ---------- (b)(c)(d) ------------------------------------------------
  console.log("\n===== (b) double-click Choose cookies.txt =====");
  resetCalls();
  L.stub({
    app: { exitCode: 1, stderr: "[debug] Found YouTube account cookies", delayMs: 1500 },
    browser: { exitCode: 0, delayMs: 0 },
  });
  a = await launchApp({ label: "A-06-b", cwd: L.STUB, outDir: `${L.OUT}/A-06-b` });
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 20000 });
    await a.win.waitForTimeout(4000); // let the sweep finish
    const good = L.writeFixture("good-2.txt", L.goodCookies());
    await L.stubPicker(a.app, [good]);
    let opens = 0;
    await a.app.evaluate(({ dialog }) => {
      dialog.__auditOpens = 0;
      const prev = dialog.showOpenDialog;
      dialog.showOpenDialog = async (...args) => {
        dialog.__auditOpens += 1;
        return prev(...args);
      };
    });
    resetCalls();
    const btn = '[role="dialog"] button:has-text("Choose cookies.txt")';
    await a.win.dblclick(btn, { delay: 20 }).catch((e) => console.log("dblclick:", String(e).slice(0, 90)));
    await a.win.waitForTimeout(600);
    await a.win.click(btn, { force: true, timeout: 1500 }).catch(() => {});
    await a.win.waitForTimeout(6000);
    opens = await a.app.evaluate(({ dialog }) => dialog.__auditOpens);
    console.log("file dialogs opened:", opens);
    console.log("probe runs triggered:", calls().filter((c) => c.mode === "app").length);
    console.log("after:", JSON.stringify(await snap(a.win)));
    console.log("SHOT", await a.shot("after-double-click"));

    console.log("\n===== (c) import the same file twice =====");
    resetCalls();
    const r1 = await L.ipc(a.win, "youtube:importCookiesText", L.goodCookies());
    const r2 = await L.ipc(a.win, "youtube:importCookiesText", L.goodCookies());
    console.log("first:", JSON.stringify(r1), "second:", JSON.stringify(r2));
    console.log("leftover temp files in userData:",
      JSON.stringify(fs.readdirSync(a.userDataDir).filter((f) => f.includes("yt-cookies"))));

    console.log("\n===== (d) drop a file while a browser check is in flight =====");
    L.stub({
      app: { exitCode: 1, stderr: "[debug] Found YouTube account cookies", delayMs: 0 },
      browser: { exitCode: 0, delayMs: 2500 },
    });
    await L.ipc(a.win, "youtube:disconnect");
    await a.win.reload();
    await a.win.waitForSelector('[role="dialog"]', { timeout: 20000 });
    await a.win.waitForTimeout(1500);
    // open the secondary route and start a single-browser check
    await a.win.click('[role="dialog"] button:has-text("Pick a browser")').catch(() => {});
    await a.win.waitForTimeout(300);
    await a.win.click('[role="dialog"] button:has-text("Check browser")', { timeout: 3000 }).catch((e) =>
      console.log("check browser click:", String(e).slice(0, 80)),
    );
    await a.win.waitForTimeout(800);
    console.log("while checking:", JSON.stringify(await snap(a.win)));
    await L.dropCookieText(a.win, L.goodCookies());
    for (let i = 0; i < 14; i++) {
      await a.win.waitForTimeout(1000);
      console.log(`  t+${i + 1}s`, JSON.stringify(await snap(a.win)));
    }
    console.log("SHOT", await a.shot("drop-during-browser-check"));
    console.log("final store:", JSON.stringify(a.readState()["clipper.authSource"]));
  } finally {
    await a.close();
  }
})();
