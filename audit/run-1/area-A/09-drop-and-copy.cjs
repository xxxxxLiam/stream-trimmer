/**
 * A-09: the drag-and-drop route outside the modal, and the modal's copy.
 */
const fs = require("node:fs");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");
const L = require("./lib.cjs");

(async () => {
  // (c) first: what the modal claims before and during the automatic sweep
  console.log("=== modal copy before and during the sweep ===");
  L.stub({ app: { exitCode: 1, stderr: "[debug] Found YouTube account cookies" }, browser: { exitCode: 0, delayMs: 1200 } });
  let a = await launchApp({ label: "A-09-copy", cwd: L.STUB, outDir: `${L.OUT}/A-09` });
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 20000 });
    for (const t of [0, 1500, 4000]) {
      if (t) await a.win.waitForTimeout(t);
      console.log(
        ` t=${t}ms`,
        JSON.stringify(
          await a.win.evaluate(() => {
            const d = document.querySelector('[role="dialog"]');
            const txt = d.innerText;
            return {
              working: Array.from(d.querySelectorAll('[role="status"]')).map((e) => e.textContent.trim()),
              saysNotFoundAutomatically: txt.includes("Not found automatically"),
              primaryButton: Array.from(d.querySelectorAll("button"))[0]?.textContent.trim(),
            };
          }),
        ),
      );
    }
    console.log(" SHOT", await a.shot("copy-during-sweep"));

    // the drag overlay
    await a.win.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["x"], "cookies.txt", { type: "text/plain" }));
      window.dispatchEvent(Object.assign(new Event("dragover", { bubbles: true, cancelable: true }), { dataTransfer: dt }));
    });
    await a.win.waitForTimeout(400);
    console.log(
      " drag overlay shown:",
      await a.win.evaluate(() => document.body.innerText.includes("Drop cookies.txt to sign in")),
    );
    console.log(" SHOT", await a.shot("drag-overlay"));
  } finally {
    await a.close();
  }

  // (a) a signed-in user drops a fresh cookies.txt on the window
  console.log("\n=== a signed-in user drops a fresh cookies.txt on the window ===");
  L.stub({ app: { exitCode: 1, stderr: "[debug] Found YouTube account cookies" }, browser: { exitCode: 0 } });
  a = await launchApp({ label: "A-09-drop-signedin", cwd: L.STUB, outDir: `${L.OUT}/A-09-drop` });
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    fs.writeFileSync(L.cookieFileOf(a), L.goodCookies({ value: "OLD_value_000000" }), { mode: 0o600 });
    await a.win.reload();
    await a.win.waitForSelector("header", { timeout: 20000 });
    await a.win.waitForTimeout(4000);
    console.log(" modal open:", await a.win.evaluate(() => !!document.querySelector('[role="dialog"]')));
    const before = fs.readFileSync(L.cookieFileOf(a), "utf8");
    await L.dropCookieText(a.win, L.goodCookies({ value: "NEW_value_111111" }));
    await a.win.waitForTimeout(2500);
    const after = fs.readFileSync(L.cookieFileOf(a), "utf8");
    console.log(" cookie file changed by the drop:", before !== after);
    console.log(
      " any message shown to the user:",
      JSON.stringify(
        await a.win.evaluate(() => ({
          alert: document.querySelector('[role="alert"]')?.textContent ?? null,
          statuses: Array.from(document.querySelectorAll('[role="status"]')).map((e) => e.textContent.trim()),
          overlay: document.body.innerText.includes("Drop cookies.txt"),
        })),
      ),
    );
    console.log(" SHOT", await a.shot("drop-while-signed-in"));

    // is there any navigation guard if Chromium's default drop takes over?
    const nav = await a.win.evaluate(async () => {
      const before = location.href;
      try {
        location.href = "file:///etc/hostname";
      } catch (e) {
        return { blockedByThrow: String(e), href: location.href, before };
      }
      await new Promise((r) => setTimeout(r, 800));
      return { href: location.href, before };
    });
    console.log(" renderer navigation to file:// ->", JSON.stringify(nav));
    console.log(" console tail:", JSON.stringify(a.logs.console.slice(-4)));
  } finally {
    await a.close();
  }
})();
