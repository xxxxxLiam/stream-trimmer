/**
 * E/T9 — the input edges T4 could not reach, plus the error paths.
 *   a) API input matrix (the server's own validation)
 *   b) a channel with zero videos
 *   c) yt-dlp failure: what the user is told
 *   d) a cleared / non-numeric count field
 *   e) no data folder chosen
 *   f) an "Everything" run
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const CHANNEL = "https://www.youtube.com/@stubchannel";

(async () => {
  L.useShape("owner-star");
  const root = L.stubRoot("t9");
  const saveDir = "/tmp/area-E-save/t9";
  const outDir = path.join(L.OUT, "t9-edges");
  const r = {};

  const info3 = L.channelInfo({
    count: 3,
    comments: [{ id: "c1", parent: "root", text: "hi", author: "A", author_id: "UC1", like_count: 1 }],
  });
  L.writeStub(root, { info: info3, vtt: "", exitCode: 0, delayMs: 0, writeMedia: false });

  // ---------- e) no data folder chosen (seeded empty) -------------------
  {
    fs.rmSync(saveDir, { recursive: true, force: true });
    fs.mkdirSync(saveDir, { recursive: true });
    const a = await L.launchApp({
      label: "t9-nofolder", outDir, cwd: root,
      seed: { "clipper.dataDirConfirmed": true },
    });
    await a.win.waitForSelector("header", { timeout: 20000 });
    await L.signIn(a);
    await a.win.click("#ui-channel-link");
    await a.win.waitForSelector('button:has-text("Export channel")', { timeout: 15000 });
    await a.win.locator('input[placeholder="https://www.youtube.com/@channelhandle"]').fill(CHANNEL);
    r.noFolder = {
      dataFolderText: await a.win.evaluate(() => {
        const t = document.body.innerText;
        const m = t.match(/Data folder[\s\S]{0,80}/);
        return m ? m[0] : null;
      }),
      exportDisabled: await a.win.locator('button:has-text("Export channel")').isDisabled(),
    };
    r.noFolder.shot = await a.shot("no-data-folder");
    await a.close();
  }

  const seed = { "clipper.dataDirConfirmed": true, "clipper.dataDir": saveDir, "clipper.clipsDir": saveDir };
  const a = await L.launchApp({ label: "t9-main", outDir, cwd: root, seed });
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    await L.signIn(a);
    await a.win.click("#ui-channel-link");
    await a.win.waitForSelector('button:has-text("Export channel")', { timeout: 15000 });
    const urlBox = a.win.locator('input[placeholder="https://www.youtube.com/@channelhandle"]');
    const numBox = a.win.locator('input[type="number"]');
    const btn = a.win.locator('button:has-text("Export channel")');
    const alert = () => a.win.evaluate(() => {
      const el = document.querySelector('[role="alert"]');
      return el ? el.textContent.trim() : null;
    });
    const settle = async () => {
      try {
        await a.win.waitForSelector("text=/Export saved|Partial export saved/", { timeout: 60000 });
        const d = a.win.locator('button[aria-label="Dismiss"]');
        if (await d.count()) await d.first().click();
        return "export ran";
      } catch { return "no result"; }
    };

    // ---------- a) API input matrix --------------------------------------
    const apiCases = [
      { n: "empty url", b: { url: "" } },
      { n: "missing url", b: {} },
      { n: "video url", b: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
      { n: "non-youtube", b: { url: "https://vimeo.com/x" } },
      { n: "newline inside url", b: { url: "https://www.youtube.com/@stub\nhttps://evil.invalid" } },
      { n: "url is 10k chars", b: { url: "https://www.youtube.com/@" + "a".repeat(9980), includeComments: false, includeTranscripts: false } },
      { n: "limit 0", b: { url: CHANNEL, limit: 0 } },
      { n: "limit -1", b: { url: CHANNEL, limit: -1 } },
      { n: "limit 1.5", b: { url: CHANNEL, limit: 1.5 } },
      { n: "limit 10001", b: { url: CHANNEL, limit: 10001 } },
      { n: 'limit "100" as string', b: { url: CHANNEL, limit: "100" } },
      { n: "limit 1 (under the UI floor of 10)", b: { url: CHANNEL, limit: 1, includeComments: false, includeTranscripts: false } },
      { n: "all parts off", b: { url: CHANNEL, includeVideoDetails: false, includeComments: false, includeTranscripts: false } },
      { n: "deliver bogus", b: { url: CHANNEL, deliver: "ftp" } },
      { n: "cookiesFromBrowser path traversal", b: { url: CHANNEL, cookiesFromBrowser: "../../etc/passwd" } },
      { n: "contentType bogus", b: { url: CHANNEL, contentType: "livestreams" } },
      { n: "extra unknown field", b: { url: CHANNEL, limit: 10, outputDir: "/etc", includeComments: false, includeTranscripts: false } },
    ];
    r.api = [];
    for (const c of apiCases) {
      const res = await L.api(a.win, "POST", "/api/channel/export", c.b, 90000);
      r.api.push({ case: c.n, status: res.status, body: (res.body || res.readError || "").slice(0, 220) });
    }

    // ---------- d) cleared / non-numeric count field ---------------------
    await urlBox.fill(CHANNEL);
    r.count = {};
    await numBox.evaluate((el) => {
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await a.win.waitForTimeout(150);
    r.count.clearedField = {
      value: await numBox.inputValue(),
      estimate: await a.win.evaluate(() => {
        const m = document.body.innerText.match(/Set how many videos to export above\.|A run of [^.]*\./);
        return m ? m[0] : null;
      }),
      disabled: await btn.isDisabled(),
    };
    await btn.click();
    await a.win.waitForTimeout(400);
    r.count.clearedField.alert = await alert();
    r.count.clearedShot = await a.shot("count-cleared");

    // the field is type=number, so a browser throws away "abc" — show what the
    // user is actually left with
    await numBox.evaluate((el) => {
      el.value = "abc";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await a.win.waitForTimeout(150);
    r.count.nonNumeric = {
      valueSeenByReact: await numBox.inputValue(),
      estimate: await a.win.evaluate(() => {
        const m = document.body.innerText.match(/Set how many videos to export above\.|A run of [^.]*\./);
        return m ? m[0] : null;
      }),
    };
    await numBox.fill("10");

    // ---------- b) a channel with zero videos ----------------------------
    L.writeStub(root, { info: L.channelInfo({ count: 0 }), vtt: "", exitCode: 0, writeMedia: false });
    await a.win.waitForTimeout(100);
    await urlBox.fill("https://www.youtube.com/@emptychannel");
    await btn.click();
    await a.win.waitForTimeout(3500);
    r.zeroVideos = { alert: await alert(), outcome: await settle() };
    r.zeroVideos.shot = await a.shot("zero-videos");
    r.zeroVideos.api = (await L.api(a.win, "POST", "/api/channel/export",
      { url: "https://www.youtube.com/@emptychannel", limit: 10 }, 60000)).body;

    // ---------- c) yt-dlp failure ----------------------------------------
    L.writeStub(root, {
      info: info3, exitCode: 1,
      stderr: "ERROR: [youtube:tab] @nope: YouTube said: This channel does not exist.",
      writeMedia: false,
    });
    await a.win.waitForTimeout(100);
    await urlBox.fill("https://www.youtube.com/@nope");
    await btn.click();
    await a.win.waitForTimeout(5000);
    r.ytFailure = { alert: await alert() };
    r.ytFailure.shot = await a.shot("yt-dlp-failure");
    r.ytFailure.stillShowsForm = await a.win.evaluate(() => ({
      urlKept: document.querySelector('input[placeholder="https://www.youtube.com/@channelhandle"]').value,
      exportButtonBack: document.body.innerText.includes("Export channel"),
    }));
    r.ytFailure.api = (await L.api(a.win, "POST", "/api/channel/export",
      { url: "https://www.youtube.com/@nope", limit: 10 }, 60000)).body;

    // ---------- f) an "Everything" run -----------------------------------
    L.writeStub(root, { info: info3, vtt: "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\ncap\n", exitCode: 0, writeMedia: false });
    await a.win.waitForTimeout(100);
    await urlBox.fill(CHANNEL);
    await a.win.locator('button:has-text("Everything")').click();
    await a.win.waitForTimeout(200);
    r.everything = {
      numberDisabled: await numBox.isDisabled(),
      pressed: await a.win.locator('button:has-text("Everything")').getAttribute("aria-pressed"),
      estimate: await a.win.evaluate(() => {
        const m = document.body.innerText.match(/Exporting every video[^.]*\./);
        return m ? m[0] : null;
      }),
      heavyWarning: await a.win.evaluate(() =>
        document.body.innerText.includes("A run this size takes hours")),
    };
    r.everything.shotForm = await a.shot("everything-form");
    await btn.click();
    r.everything.outcome = await settle();
    r.everything.result = await a.win.evaluate(() => {
      const m = document.body.innerText.match(/(Partial export saved|Export saved)[\s\S]{0,140}/);
      return m ? m[0] : null;
    });
    r.everything.shotDone = await a.shot("everything-done");
  } catch (e) {
    r.error = String(e).slice(0, 700);
    r.shotError = await a.shot("error");
  } finally {
    r.pageErrors = a.logs.pageErrors;
    await a.close();
  }
  r.savedFolders = fs.existsSync(saveDir) ? fs.readdirSync(saveDir) : [];
  console.log(JSON.stringify(r, null, 2));
  L.save(outDir, "report.json", r);
})();
