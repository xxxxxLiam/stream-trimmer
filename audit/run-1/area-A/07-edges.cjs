/**
 * A-07: size limits, binary files, interruptions, error quality, the IPC
 * surface's security, and the connect modal's accessibility.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");
const L = require("./lib.cjs");

(async () => {
  L.stub({ app: { exitCode: 1, stderr: "[debug] Found YouTube account cookies" }, browser: { exitCode: 0 } });

  let a = await launchApp({ label: "A-07", cwd: L.STUB, outDir: `${L.OUT}/A-07` });
  const cookieFile = L.cookieFileOf(a);
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    await a.win.waitForTimeout(3000);

    // ---------- 1. big files, both routes -----------------------------
    console.log("===== 1. a 10 MB cookies.txt =====");
    const pad = ".youtube.com\tTRUE\t/\tFALSE\t2000000000\tPAD%i\t" + "x".repeat(200);
    let big = L.goodCookies();
    const lines = [];
    for (let i = 0; lines.join("\n").length < 10 * 1024 * 1024; i++) {
      for (let j = 0; j < 2000; j++) lines.push(pad.replace("%i", String(i * 2000 + j)));
    }
    big += lines.join("\n");
    const bigPath = L.writeFixture("big-10mb.txt", big);
    console.log("fixture size:", (fs.statSync(bigPath).size / 1048576).toFixed(1), "MB");

    await L.stubPicker(a.app, [bigPath]);
    const viaPicker = await L.ipc(a.win, "youtube:importCookies");
    console.log(
      "picker route ->",
      JSON.stringify({ ok: viaPicker.ok, count: viaPicker.count, error: viaPicker.error }),
    );
    console.log(
      "cookie file on disk now:",
      fs.existsSync(cookieFile) ? (fs.statSync(cookieFile).size / 1048576).toFixed(1) + " MB" : "absent",
    );
    const viaText = await L.ipc(a.win, "youtube:importCookiesText", big);
    console.log("importCookiesText route ->", JSON.stringify({ ok: viaText.ok, error: viaText.error }));
    // and the renderer-side drop guard
    await L.dropCookieText(a.win, big);
    await a.win.waitForTimeout(1500);
    console.log("drop route UI message:", JSON.stringify((await L.dump(a.win)).alert));
    console.log("SHOT", await a.shot("big-file-drop"));

    console.log("\n===== 2. a binary file renamed .txt =====");
    const bin = Buffer.alloc(4096);
    for (let i = 0; i < bin.length; i++) bin[i] = i % 256;
    const binPath = L.writeFixture("image-renamed.txt", bin);
    await L.stubPicker(a.app, [binPath]);
    console.log("picker ->", JSON.stringify(await L.ipc(a.win, "youtube:importCookies")));

    console.log("\n===== 3. error quality: the chosen file is gone / is a folder =====");
    const gone = path.join(L.OUT, "fixtures", "deleted-cookies.txt");
    fs.writeFileSync(gone, L.goodCookies());
    fs.rmSync(gone);
    await L.stubPicker(a.app, [gone]);
    const r = await L.ipc(a.win, "youtube:importCookies");
    console.log("missing file ->", JSON.stringify(r));
    await L.stubPicker(a.app, [path.join(L.OUT, "fixtures")]);
    console.log("a folder ->", JSON.stringify(await L.ipc(a.win, "youtube:importCookies")));
    // and how it reads in the UI
    await L.stubPicker(a.app, [gone]);
    await a.win.evaluate(() => {
      const b = Array.from(document.querySelectorAll('[role="dialog"] button')).find((x) =>
        /Choose cookies|Checking/.test(x.textContent || ""),
      );
      b?.click();
    });
    await a.win.waitForTimeout(2500);
    console.log("UI alert:", JSON.stringify((await L.dump(a.win)).alert));
    console.log("SHOT", await a.shot("missing-file-error"));

    console.log("\n===== 4. the IPC surface: can the renderer steer the cookie path? =====");
    for (const arg of [
      { v: null, name: "null" },
      { v: 12345, name: "a number" },
      { v: { path: "/etc/passwd" }, name: "an object with a path" },
      { v: ["/etc/passwd"], name: "an array" },
      { v: "x".repeat(5_000_001), name: "5,000,001 chars" },
    ]) {
      const out = await a.win.evaluate(
        async (v) => {
          try {
            return await window.electronAPI.importYouTubeCookiesText(v);
          } catch (e) {
            return { __threw: String(e) };
          }
        },
        arg.v,
      );
      console.log(` importCookiesText(${arg.name}) ->`, JSON.stringify(out).slice(0, 160));
    }
    console.log(
      " probe return shape ->",
      JSON.stringify(Object.keys(await L.ipc(a.win, "youtube:probe"))),
    );
    console.log(
      " probe values (must carry no cookie value) ->",
      JSON.stringify(await L.ipc(a.win, "youtube:probe")),
    );
    console.log(
      " does any probe/import return leak the cookie file path?",
      JSON.stringify(
        [
          JSON.stringify(await L.ipc(a.win, "youtube:probe")),
          JSON.stringify(await L.ipc(a.win, "youtube:importCookiesText", L.goodCookies())),
        ].some((s) => s.includes("yt-cookies") || s.includes(a.userDataDir)),
      ),
    );
    for (const body of [
      { browser: "app" },
      { browser: "/etc/passwd" },
      { browser: "../../yt-cookies.txt" },
      { browser: "app", cookies: "/etc/passwd" },
      {},
      { browser: 42 },
    ]) {
      const out = await a.win.evaluate(async (body) => {
        const res = await fetch(`${window.__API_BASE__}/api/auth/youtube/status`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: res.status, body: (await res.text()).slice(0, 180) };
      }, body);
      console.log(` POST status ${JSON.stringify(body)} ->`, JSON.stringify(out));
    }
    console.log(
      " GET /api/auth/youtube/status ->",
      JSON.stringify(
        await a.win.evaluate(async () => {
          const res = await fetch(`${window.__API_BASE__}/api/auth/youtube/status`);
          return { status: res.status, body: (await res.text()).slice(0, 120) };
        }),
      ),
    );

    console.log("\n===== 5. accessibility of the connect modal =====");
    await L.ipc(a.win, "youtube:disconnect");
    await a.win.reload();
    await a.win.waitForSelector('[role="dialog"]', { timeout: 20000 });
    await a.win.waitForTimeout(4000);
    const ax = await a.win.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return {
        role: d.getAttribute("role"),
        ariaModal: d.getAttribute("aria-modal"),
        labelledBy: d.getAttribute("aria-labelledby"),
        labelResolves: Boolean(document.getElementById(d.getAttribute("aria-labelledby") || "")),
        focusOnOpen: document.activeElement?.tagName ?? null,
        focusInsideDialog: Boolean(document.activeElement?.closest('[role="dialog"]')),
        controlsOutsideStillFocusable: Array.from(
          document.querySelectorAll("button, input, select, a[href]"),
        ).filter((el) => !el.closest('[role="dialog"]') && !el.hasAttribute("disabled") && el.tabIndex >= 0).length,
        ariaHiddenOnBackground: Array.from(document.querySelectorAll("[aria-hidden=true]")).filter(
          (el) => el.querySelector("header"),
        ).length,
        stepsTextShownWhileChecking: document.body.innerText.includes("Not found automatically"),
        selectHasLabel: Boolean(document.querySelector('[role="dialog"] select')?.getAttribute("aria-label")),
      };
    });
    console.log(JSON.stringify(ax, null, 2));

    // keyboard-only completion: tab until the import button has focus, Enter
    await L.stubPicker(a.app, [L.writeFixture("kbd.txt", L.goodCookies())]);
    let steps = 0;
    for (; steps < 40; steps++) {
      await a.win.keyboard.press("Tab");
      const onBtn = await a.win.evaluate(() =>
        /Choose cookies|Checking/.test(document.activeElement?.textContent || ""),
      );
      if (onBtn) break;
    }
    console.log("Tab presses needed to reach the import button:", steps + 1);
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(4000);
    const closed = await a.win.evaluate(() => !document.querySelector('[role="dialog"]'));
    console.log("keyboard-only sign-in completed:", closed);
    console.log(
      "focus after the modal closed:",
      await a.win.evaluate(() => document.activeElement?.tagName + "/" + (document.activeElement?.textContent || "").trim().slice(0, 30)),
    );
    console.log("SHOT", await a.shot("after-keyboard-signin"));
  } finally {
    await a.close();
  }

  // ---------- 6. killed mid-verify ------------------------------------
  console.log("\n===== 6. the app is killed while the just-imported file is being verified =====");
  L.stub({ app: { exitCode: 1, stderr: "[debug] Found YouTube account cookies", delayMs: 8000 }, browser: { exitCode: 0 } });
  a = await launchApp({ label: "A-07-kill", cwd: L.STUB, outDir: `${L.OUT}/A-07-kill` });
  const killDir = a.userDataDir;
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 20000 });
    await a.win.waitForTimeout(2500);
    await L.dropCookieText(a.win, L.goodCookies());
    await a.win.waitForTimeout(2500);
    console.log("mid-verify UI:", JSON.stringify((await L.dump(a.win)).statuses));
    console.log("cookie file committed before the kill:", fs.existsSync(path.join(killDir, "yt-cookies.txt")));
    a.app.process().kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 1500));
  } catch (e) {
    console.log("kill phase:", String(e).slice(0, 120));
  }
  console.log(
    "userData after the kill:",
    JSON.stringify(fs.readdirSync(killDir).filter((f) => f.startsWith("yt-cookies"))),
  );
  const survived = path.join(killDir, "yt-cookies.txt");
  console.log("file intact:", fs.existsSync(survived) && fs.readFileSync(survived, "utf8") === L.goodCookies());

  // a relaunch "as the same user": same file, fresh instance
  L.stub({ app: { exitCode: 1, stderr: "[debug] Found YouTube account cookies" }, browser: { exitCode: 0 } });
  const b = await launchApp({ label: "A-07-relaunch", cwd: L.STUB, outDir: `${L.OUT}/A-07-relaunch` });
  try {
    await b.win.waitForSelector("header", { timeout: 20000 });
    fs.copyFileSync(survived, L.cookieFileOf(b));
    await b.win.reload();
    await b.win.waitForSelector("header", { timeout: 20000 });
    await b.win.waitForTimeout(4000);
    console.log(
      "after relaunch: modal =",
      await b.win.evaluate(() => !!document.querySelector('[role="dialog"]')),
      "| chip =",
      await b.win.evaluate(
        () =>
          Array.from(document.querySelectorAll("button")).find((x) => /signed in|not signed|expired/i.test(x.textContent || ""))?.textContent.trim() ?? null,
      ),
    );
    console.log("SHOT", await b.shot("relaunch-after-kill"));
  } finally {
    await b.close();
  }
})();
