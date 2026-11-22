/**
 * E/T4 — export inputs and limit boundaries, through the UI and through the API.
 * owner-star build. The stub returns a 3-video channel unless a case overrides it.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const UI_CASES = [
  { name: "empty", url: "" },
  { name: "video-url", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  { name: "handle", url: "https://www.youtube.com/@stubchannel" },
  { name: "c-url", url: "https://www.youtube.com/c/StubChannel" },
  { name: "user-url", url: "https://www.youtube.com/user/StubChannel" },
  { name: "channel-id", url: "https://www.youtube.com/channel/UCstub0000000000000000" },
  { name: "unicode-handle", url: "https://www.youtube.com/@канал-日本語-🎬" },
  { name: "long-10k", url: "https://www.youtube.com/@" + "a".repeat(9980) },
  { name: "non-youtube", url: "https://vimeo.com/channels/staffpicks" },
  { name: "newline", url: "https://www.youtube.com/@stub\nhttps://evil.invalid" },
  { name: "bare-domain", url: "https://www.youtube.com" },
  { name: "whitespace-only", url: "   " },
  { name: "shorts-tab", url: "https://www.youtube.com/@stubchannel/shorts" },
];

const LIMITS = ["9", "10", "11", "9999", "10000", "10001", "0", "-5", "abc", "", "1e9", "10.7"];

(async () => {
  L.useShape("owner-star");
  const root = L.stubRoot("t4");
  const saveDir = "/tmp/area-E-save/t4";
  fs.rmSync(saveDir, { recursive: true, force: true });
  fs.mkdirSync(saveDir, { recursive: true });
  L.writeStub(root, { info: L.channelInfo({ count: 3 }), vtt: "", exitCode: 0, writeMedia: false });

  const outDir = path.join(L.OUT, "t4-inputs");
  const a = await L.launchApp({
    label: "t4-inputs", outDir, cwd: root,
    seed: { "clipper.dataDirConfirmed": true, "clipper.dataDir": saveDir, "clipper.clipsDir": saveDir },
  });
  const r = { ui: [], limits: [], api: [] };
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    await L.signIn(a);
    await a.win.click("#ui-channel-link");
    await a.win.waitForSelector('button:has-text("Export channel")', { timeout: 15000 });

    const urlBox = a.win.locator('input[placeholder="https://www.youtube.com/@channelhandle"]');
    const numBox = a.win.locator('input[type="number"]');
    const btn = a.win.locator('button:has-text("Export channel")');

    // ---- URL validation, client side only: cancel any run that starts -----
    for (const c of UI_CASES) {
      await urlBox.fill("");
      if (c.url) await urlBox.fill(c.url);
      await numBox.fill("10");
      const row = { case: c.name, len: c.url.length };
      row.valueAfterFill = (await urlBox.inputValue()).slice(0, 60);
      row.btnDisabled = await btn.isDisabled();
      if (!row.btnDisabled) {
        await btn.click();
        // settle: either an error appears or an export starts and finishes
        await a.win.waitForTimeout(250);
        row.alert = await a.win.evaluate(() => {
          const el = document.querySelector('[role="alert"]');
          return el ? el.textContent.trim() : null;
        });
        row.started = await a.win.evaluate(() => document.body.innerText.includes("Stop keeps everything"));
        // wait for whatever happens, bounded
        try {
          await a.win.waitForSelector('text=/Export saved|Partial export saved/', { timeout: 20000 });
          row.outcome = "export ran";
          const dismiss = a.win.locator('button[aria-label="Dismiss"]');
          if (await dismiss.count()) await dismiss.first().click();
        } catch {
          row.outcome = row.alert ? "refused with message" : "no result, no message";
        }
      }
      r.ui.push(row);
    }

    // ---- limit field boundaries ------------------------------------------
    await urlBox.fill("https://www.youtube.com/@stubchannel");
    for (const v of LIMITS) {
      await numBox.fill("");
      if (v) await numBox.fill(v);
      await a.win.waitForTimeout(80);
      const row = { limit: v };
      row.fieldValue = await numBox.inputValue();
      row.estimateText = await a.win.evaluate(() => {
        const t = document.body.innerText;
        const m = t.match(/A run of [^.]*\./) || t.match(/Set how many videos to export above\./) || t.match(/Exporting every video[^.]*\./);
        return m ? m[0] : null;
      });
      row.btnDisabled = await btn.isDisabled();
      if (!row.btnDisabled) {
        await btn.click();
        await a.win.waitForTimeout(250);
        row.alert = await a.win.evaluate(() => {
          const el = document.querySelector('[role="alert"]');
          return el ? el.textContent.trim() : null;
        });
        try {
          await a.win.waitForSelector('text=/Export saved|Partial export saved/', { timeout: 20000 });
          row.outcome = "export ran";
          const dismiss = a.win.locator('button[aria-label="Dismiss"]');
          if (await dismiss.count()) await dismiss.first().click();
        } catch {
          row.outcome = row.alert ? "refused with message" : "no result, no message";
        }
      }
      r.limits.push(row);
    }
    r.shot_limits = await a.shot("limit-field");

    // ---- the same inputs straight at the API ------------------------------
    const apiCases = [
      { n: "empty url", b: { url: "" } },
      { n: "video url", b: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
      { n: "non-youtube", b: { url: "https://vimeo.com/x" } },
      { n: "newline url", b: { url: "https://www.youtube.com/@stub\nhttps://evil.invalid" } },
      { n: "10k url", b: { url: "https://www.youtube.com/@" + "a".repeat(9980) } },
      { n: "limit 0", b: { url: "https://www.youtube.com/@stub", limit: 0 } },
      { n: "limit 10001", b: { url: "https://www.youtube.com/@stub", limit: 10001 } },
      { n: "limit 10000", b: { url: "https://www.youtube.com/@stub", limit: 10000, includeComments: false, includeTranscripts: false } },
      { n: "limit -1", b: { url: "https://www.youtube.com/@stub", limit: -1 } },
      { n: "limit 1.5", b: { url: "https://www.youtube.com/@stub", limit: 1.5 } },
      { n: "limit string", b: { url: "https://www.youtube.com/@stub", limit: "100" } },
      { n: "all parts off", b: { url: "https://www.youtube.com/@stub", includeVideoDetails: false, includeComments: false, includeTranscripts: false } },
      { n: "no body", b: {} },
      { n: "deliver bogus", b: { url: "https://www.youtube.com/@stub", deliver: "ftp" } },
      { n: "cookiesFromBrowser bogus", b: { url: "https://www.youtube.com/@stub", cookiesFromBrowser: "../../etc/passwd" } },
    ];
    for (const c of apiCases) {
      const res = await L.api(a.win, "POST", "/api/channel/export", c.b, 60000);
      r.api.push({ case: c.n, status: res.status, body: (res.body || res.readError || "").slice(0, 300) });
    }

    // ---- zero-video channel ----------------------------------------------
    L.writeStub(root, { info: L.channelInfo({ count: 0 }), exitCode: 0, writeMedia: false });
    r.zeroVideos = await L.api(a.win, "POST", "/api/channel/export", {
      url: "https://www.youtube.com/@emptychannel", limit: 10,
    }, 60000);
    // and through the UI
    await urlBox.fill("https://www.youtube.com/@emptychannel");
    await numBox.fill("10");
    await btn.click();
    await a.win.waitForTimeout(3000);
    r.zeroVideosUi = await a.win.evaluate(() => {
      const el = document.querySelector('[role="alert"]');
      return el ? el.textContent.trim() : document.body.innerText.includes("Stop") ? "still running" : "no message";
    });
    r.shot_zero = await a.shot("zero-videos");

    // ---- yt-dlp failure --------------------------------------------------
    L.writeStub(root, { exitCode: 1, stderr: "ERROR: [youtube:tab] @nope: Not Found", info: L.channelInfo() });
    await a.win.waitForTimeout(100);
    await urlBox.fill("https://www.youtube.com/@nope");
    await btn.click();
    await a.win.waitForTimeout(4000);
    r.failureUi = await a.win.evaluate(() => {
      const el = document.querySelector('[role="alert"]');
      return el ? el.textContent.trim() : "no message";
    });
    r.shot_failure = await a.shot("yt-dlp-failure");
  } catch (e) {
    r.error = String(e).slice(0, 600);
    r.shot_error = await a.shot("error");
  } finally {
    r.pageErrors = a.logs.pageErrors;
    await a.close();
  }
  console.log(JSON.stringify(r, null, 2));
  L.save(outDir, "report.json", r);
})();
