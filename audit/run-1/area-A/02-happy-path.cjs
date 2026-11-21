/**
 * A-02: happy path. Fresh install -> Choose cookies.txt -> valid file ->
 * signed in -> modal gone -> state persisted. Then disconnect, disconnect
 * twice, re-import. Also: is the app usable at all before signing in?
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

(async () => {
  resetCalls();
  L.stub({ exitCode: 0, writeMedia: false }); // every browser -> inconclusive
  const good = L.writeFixture("good-cookies.txt", L.goodCookies());

  const t0 = Date.now();
  const a = await launchApp({ label: "A-02-happy", cwd: L.STUB, outDir: `${L.OUT}/A-02` });
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 20000 });
    console.log("modal visible after", Date.now() - t0, "ms");

    // --- can anything behind the modal be used? --------------------------
    const blocked = await a.win.evaluate(async () => {
      const input = document.querySelector("header input, input[type=text], input");
      const out = { foundInput: Boolean(input) };
      if (input) {
        const r = input.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        out.topAtInput = top ? top.tagName + "." + String(top.className).slice(0, 50) : null;
        out.inputIsTop = top === input;
      }
      return out;
    });
    console.log("BEHIND-MODAL", JSON.stringify(blocked));
    // real click attempt on the URL field
    const clickErr = await a.win
      .click("header input", { timeout: 2500 })
      .then(() => null)
      .catch((e) => String(e).split("\n").slice(0, 4).join(" | "));
    console.log("CLICK URL FIELD ->", clickErr ? "BLOCKED: " + clickErr.slice(0, 220) : "went through");

    // --- wait for the sweep to finish, count the cost -------------------
    await a.win.waitForTimeout(1000);
    for (let i = 0; i < 60; i++) {
      const busy = await a.win.evaluate(
        () => !!document.querySelector('[role="dialog"] button[disabled]'),
      );
      if (!busy) break;
      await a.win.waitForTimeout(500);
    }
    const sweep = calls().filter((c) => !c.argv.includes("--version"));
    console.log("SWEEP yt-dlp runs:", sweep.length);
    console.log(
      "SWEEP sources:",
      JSON.stringify(
        sweep.map((c) => {
          const i = c.argv.findIndex((x) => x === "--cookies-from-browser" || x === "--cookies");
          return i >= 0 ? `${c.argv[i]}=${c.argv[i + 1]}` : "none";
        }),
      ),
    );
    console.log("sweep wall time ms:", sweep.length ? sweep[sweep.length - 1].t - sweep[0].t : 0);

    // --- happy path: pick a valid cookies.txt ---------------------------
    L.stubSignedIn();
    resetCalls();
    await L.stubPicker(a.app, [good]);
    await a.win.click('[role="dialog"] button:has-text("Choose cookies.txt")');
    await a.win.waitForTimeout(500);
    console.log("DURING IMPORT", JSON.stringify(await L.dump(a.win)));
    console.log("SHOT", await a.shot("during-import"));

    await a.win
      .waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 })
      .then(() => console.log("MODAL CLOSED -> signed in"))
      .catch(() => console.log("MODAL STILL OPEN after import"));
    await a.win.waitForTimeout(1200);
    console.log("SHOT", await a.shot("signed-in"));
    console.log("cookie file on disk:", fs.existsSync(L.cookieFileOf(a)));
    console.log(
      "cookie file mode:",
      (fs.statSync(L.cookieFileOf(a)).mode & 0o777).toString(8),
    );
    console.log("STATE", JSON.stringify(a.readState()));
    console.log("probe ->", JSON.stringify(await L.ipc(a.win, "youtube:probe")));

    const chip = await a.win.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((x) =>
        /signed in|not signed|expired/i.test(x.textContent || ""),
      );
      return b ? b.textContent.trim() : null;
    });
    console.log("STATUS CHIP:", chip);

    // --- disconnect ------------------------------------------------------
    console.log("disconnect ->", JSON.stringify(await L.ipc(a.win, "youtube:disconnect")));
    console.log("cookie file after disconnect:", fs.existsSync(L.cookieFileOf(a)));
    console.log("disconnect again ->", JSON.stringify(await L.ipc(a.win, "youtube:disconnect")));
    console.log("probe after disconnect ->", JSON.stringify(await L.ipc(a.win, "youtube:probe")));
    console.log(
      "auth status after disconnect ->",
      JSON.stringify(await L.authStatus(a.win, "app")),
    );

    // --- re-import the same file ----------------------------------------
    console.log(
      "re-import text ->",
      JSON.stringify(await L.ipc(a.win, "youtube:importCookiesText", L.goodCookies())),
    );
    console.log("cookie file back:", fs.existsSync(L.cookieFileOf(a)));
    console.log("MAIN LOG tail:", a.logs.stdout.join("").split("\n").slice(-25).join("\n"));
  } finally {
    await a.close();
  }
})();
