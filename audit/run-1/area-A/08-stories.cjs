/**
 * A-08: realistic user stories for onboarding and sign-in, run end to end.
 * Each story is driven through the real UI unless the comment says otherwise.
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
const reset = () => fs.writeFileSync(CALLS, "");

const snap = (win) =>
  win.evaluate(() => ({
    modal: !!document.querySelector('[role="dialog"]'),
    heading: document.getElementById("youtube-connect-title")?.textContent ?? null,
    alert: document.querySelector('[role="alert"]')?.textContent ?? null,
    notice: Array.from(document.querySelectorAll('[role="status"]')).map((e) => e.textContent.trim()).filter((t) => t && !/Paste a YouTube link/.test(t)),
    chip:
      Array.from(document.querySelectorAll("button")).find((x) =>
        /signed in|not signed|expired|checking/i.test(x.textContent || ""),
      )?.textContent.trim() ?? null,
  }));

const SIGNED_IN = { exitCode: 1, stderr: "[debug] Found YouTube account cookies" };
const NO_BROWSER = { exitCode: 0 };

(async () => {
  // ---- Story 1: exports from a signed-out browser profile, then fixes it --
  console.log("=== S1 exports cookies from a signed-out browser profile, then re-exports ===");
  L.stub({ app: SIGNED_IN, browser: NO_BROWSER });
  let a = await launchApp({ label: "A-08-s1", cwd: L.STUB, outDir: `${L.OUT}/A-08-s1` });
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 20000 });
    await a.win.waitForTimeout(3500);
    const signedOutFile = L.writeFixture(
      "s1-signed-out.txt",
      "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tFALSE\t2000000000\tPREF\tf6=40000000\n.youtube.com\tTRUE\t/\tFALSE\t2000000000\tVISITOR_INFO1_LIVE\tabc\n",
    );
    await L.stubPicker(a.app, [signedOutFile]);
    await a.win.click('[role="dialog"] button:has-text("Choose cookies.txt")');
    await a.win.waitForTimeout(2000);
    console.log(" after the wrong file:", JSON.stringify(await snap(a.win)));
    console.log(" SHOT", await a.shot("s1-signed-out-file"));
    // re-export, this time signed in
    await L.stubPicker(a.app, [L.writeFixture("s1-good.txt", L.goodCookies())]);
    await a.win.click('[role="dialog"] button:has-text("Choose cookies.txt")');
    await a.win.waitForTimeout(4000);
    console.log(" after the right file:", JSON.stringify(await snap(a.win)));
    console.log(" SHOT", await a.shot("s1-recovered"));
  } finally {
    await a.close();
  }

  // ---- Story 2: JSON by mistake, then the Netscape export ---------------
  console.log("\n=== S2 picks the extension's JSON export by mistake ===");
  a = await launchApp({ label: "A-08-s2", cwd: L.STUB, outDir: `${L.OUT}/A-08-s2` });
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 20000 });
    await a.win.waitForTimeout(3500);
    await L.stubPicker(a.app, [
      L.writeFixture("s2.json.txt", '[{"domain":".youtube.com","name":"SID","value":"abc","expirationDate":2000000000}]'),
    ]);
    await a.win.click('[role="dialog"] button:has-text("Choose cookies.txt")');
    await a.win.waitForTimeout(2000);
    console.log(" ", JSON.stringify(await snap(a.win)));
    console.log(" SHOT", await a.shot("s2-json"));
  } finally {
    await a.close();
  }

  // ---- Story 3: returning user, session expired overnight ---------------
  console.log("\n=== S3 returning user whose sign-in expired overnight ===");
  L.stub({ app: SIGNED_IN, browser: { exitCode: 0, delayMs: 700 } });
  a = await launchApp({ label: "A-08-s3", cwd: L.STUB, outDir: `${L.OUT}/A-08-s3` });
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    fs.writeFileSync(L.cookieFileOf(a), L.goodCookies({ expires: 1000000000 }), { mode: 0o600 });
    await a.win.reload();
    await a.win.waitForSelector('[role="dialog"]', { timeout: 20000 });
    for (const t of [700, 1500, 3000, 6000, 10000, 16000]) {
      await a.win.waitForTimeout(t === 700 ? 700 : 0);
      if (t !== 700) await a.win.waitForTimeout(t - 700 > 0 ? 0 : 0);
      console.log(`  sample:`, JSON.stringify(await snap(a.win)));
      await a.win.waitForTimeout(2500);
    }
    console.log(" SHOT", await a.shot("s3-expired-message-overwritten"));
    // fix it with a fresh export
    await L.stubPicker(a.app, [L.writeFixture("s3-fresh.txt", L.goodCookies())]);
    await a.win.click('[role="dialog"] button:has-text("Choose cookies.txt")').catch((e) => console.log("  click:", String(e).slice(0, 60)));
    await a.win.waitForTimeout(4000);
    console.log(" after a fresh import:", JSON.stringify(await snap(a.win)));
  } finally {
    await a.close();
  }

  // ---- Story 4: YouTube rate-limits the network, file is good -----------
  console.log("\n=== S4 YouTube answers 'confirm you are not a bot' with a good file on disk ===");
  L.stub({
    app: {
      exitCode: 1,
      stderr:
        "ERROR: [youtube] jNQXAC9IVRw: Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies for the authentication. See https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp for how to manually pass cookies.",
    },
    browser: NO_BROWSER,
  });
  a = await launchApp({ label: "A-08-s4", cwd: L.STUB, outDir: `${L.OUT}/A-08-s4` });
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    fs.writeFileSync(L.cookieFileOf(a), L.goodCookies(), { mode: 0o600 });
    await a.win.reload();
    await a.win.waitForSelector("header", { timeout: 20000 });
    await a.win.waitForTimeout(6000);
    console.log(" ", JSON.stringify(await snap(a.win)));
    console.log(" SHOT", await a.shot("s4-rate-limited"));
  } finally {
    await a.close();
  }

  // ---- Story 5: "Forget this sign-in", then import again ----------------
  console.log("\n=== S5 forgets the sign-in from the chip menu, then imports again ===");
  L.stub({ app: SIGNED_IN, browser: NO_BROWSER });
  a = await launchApp({ label: "A-08-s5", cwd: L.STUB, outDir: `${L.OUT}/A-08-s5` });
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    fs.writeFileSync(L.cookieFileOf(a), L.goodCookies(), { mode: 0o600 });
    await a.win.reload();
    await a.win.waitForSelector("header", { timeout: 20000 });
    await a.win.waitForTimeout(4000);
    console.log(" signed in:", JSON.stringify(await snap(a.win)));
    await a.win.evaluate(() => {
      Array.from(document.querySelectorAll("button"))
        .find((x) => /signed in/i.test(x.textContent || ""))
        ?.click();
    });
    await a.win.waitForTimeout(500);
    console.log(" SHOT", await a.shot("s5-chip-menu"));
    await a.win.evaluate(() => {
      Array.from(document.querySelectorAll('[role="menuitem"]'))
        .find((x) => /Forget this sign-in/i.test(x.textContent || ""))
        ?.click();
    });
    await a.win.waitForTimeout(2500);
    console.log(" after forgetting:", JSON.stringify(await snap(a.win)));
    console.log(" cookie file gone:", !fs.existsSync(L.cookieFileOf(a)));
    console.log(" authSource in store:", JSON.stringify(a.readState()["clipper.authSource"] ?? null));
    console.log(" SHOT", await a.shot("s5-forgotten"));
    // forget twice: the menu item should be gone, and nothing should break
    await a.win.evaluate(() => {
      Array.from(document.querySelectorAll("button"))
        .find((x) => /not signed in|expired/i.test(x.textContent || ""))
        ?.click();
    });
    await a.win.waitForTimeout(400);
    console.log(
      " menu items while signed out:",
      JSON.stringify(await a.win.evaluate(() => Array.from(document.querySelectorAll('[role="menuitem"]')).map((e) => e.textContent.trim()))),
    );
    // re-import
    await L.stubPicker(a.app, [L.writeFixture("s5-again.txt", L.goodCookies())]);
    await a.win.click('[role="dialog"] button:has-text("Choose cookies.txt")').catch(() => {});
    await a.win.waitForTimeout(4000);
    console.log(" re-imported:", JSON.stringify(await snap(a.win)));
  } finally {
    await a.close();
  }

  // ---- Story 6: presses "Check browsers again" three times -------------
  console.log("\n=== S6 presses 'Check browsers again' three times on first run ===");
  L.stub({ app: SIGNED_IN, browser: NO_BROWSER });
  a = await launchApp({ label: "A-08-s6", cwd: L.STUB, outDir: `${L.OUT}/A-08-s6` });
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 20000 });
    await a.win.waitForTimeout(4000);
    reset();
    for (let i = 0; i < 3; i++) {
      await a.win.click('[role="dialog"] button:has-text("Check browsers again")').catch((e) => console.log("  click", i, String(e).slice(0, 50)));
      await a.win.waitForTimeout(4000);
    }
    const c = calls().filter((x) => x.mode === "browser");
    console.log(" yt-dlp browser probes spawned by three presses:", c.length);
    console.log(" SHOT", await a.shot("s6-repeat-sweep"));
  } finally {
    await a.close();
  }
})();
