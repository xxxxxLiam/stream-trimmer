/**
 * v-f5-f8-diagnostics.cjs — VERIFY F-5 and F-8.
 *
 *  F-5: Copy diagnostics copies an EMPTY report for any failure during the
 *       metadata pre-flight — no job id, no engine stderr, no log lines.
 *  F-8: Copy diagnostics is OFFERED next to a plainly user-fixable error,
 *       because that failure path sends no `code`.
 *
 * Written from the findings' Steps, from scratch. One cold start, a saved
 * sign-in seeded before launch so the sign-in modal is out of the way and the
 * renderer really sends `cookiesFromBrowser`, then four cases driven through
 * the real UI (paste link, type in/out, press "Cut as one file"):
 *
 *   A  pre-flight (-J) fails   -> F-5: what does Copy diagnostics copy?
 *   B  download stage fails    -> the contrast case the finding says is good
 *   C  "cookies" + "no such file" in the engine's stderr -> F-8
 *   D  controls that DO carry a code (disk full, private video)
 *      -> Copy diagnostics must be ABSENT
 *
 * Each case also records the raw /api/download response body fetched over
 * HTTP, so "the server sent no `diagnostics` / no `code`" is read off the
 * wire rather than inferred.
 *
 * Run: xvfb-run -a --server-args="-screen 0 1440x900x24" node v-f5-f8-diagnostics.cjs [runLabel]
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./v-lib.cjs");

const URL1 = "https://www.youtube.com/watch?v=stub0000001";

const STDERR = {
  preflight:
    "ERROR: Traceback (most recent call last):\n" +
    "  File \"yt_dlp/YoutubeDL.py\", line 1620, in wrapper\n" +
    "TypeError: 'NoneType' object is not subscriptable",
  downloadStage:
    "[debug] yt-dlp version 2099.12.31\n" +
    "[download] Destination: seg-01.mp4\n" +
    "ERROR: Postprocessing: ffmpeg exited with code 234",
  // F-8's case: the save folder is gone. Real `yt-dlp -v` always names the
  // cookies file in its debug output, and isCookieError only needs the words
  // "cookies" and "no such file" to appear anywhere in that text.
  saveFolderGone:
    "[debug] Loading cookies from /root/.config/stream-trimmer/yt-cookies.txt\n" +
    "ERROR: unable to open for writing: [Errno 2] No such file or directory: '/root/gone/clip.mp4'",
  diskFull:
    "ERROR: unable to write data: [Errno 28] No space left on device\n" +
    "OSError: [Errno 28] ENOSPC: no space left on device",
  privateVideo:
    "ERROR: [youtube] abc: Join this channel to get access to members-only content like this video, and other exclusive perks.",
};

(async () => {
  const runLabel = process.argv[2] || "r1";
  const out = { runLabel, startedAt: new Date().toISOString(), cases: [] };

  const stubRoot = L.makeStub(`f58-${runLabel}`);
  L.stub(stubRoot, { info: { id: "stub0000001", title: "Stub video", duration: 30 } });
  const a = await L.launchMirror({
    shape: "public",
    label: `v-f58-${runLabel}`,
    stubRoot,
    seed: { "clipper.dataDirConfirmed": true },
    userFiles: { "yt-cookies.txt": L.cookieJarText() },
  });
  await a.win.waitForSelector("header", { timeout: 20000 });
  await a.win.waitForTimeout(1500);
  out.signInModalPresent = await a.win.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')));

  await a.win.fill('input[type="url"]', URL1);
  await a.win.press('input[type="url"]', "Enter");
  await a.win.waitForSelector("#ui-cut", { timeout: 20000 });
  await a.win.waitForTimeout(1200);
  await a.win.fill("#ui-mark-in", "00:00:02");
  await a.win.fill("#ui-mark-out", "00:00:08");
  await a.win.waitForTimeout(400);

  const clearStub = () => L.stub(stubRoot, { failInfo: null, failDownload: null, failAuth: null });

  async function runCase(name, stubCfg) {
    clearStub();
    L.stub(stubRoot, stubCfg);

    // 1. the raw wire response for the same request, so the body shape is read
    //    off the wire, not inferred.
    const wire = await L.jsonReq({
      port: a.port,
      path: `/api/download?jobId=v_f58_${name}`,
      body: { url: URL1, quality: "360", format: "mp4", deliver: "stream", cookiesFromBrowser: "app", segments: [{ start: 2, end: 8 }] },
      timeout: 120000,
    });
    let wireBody = null;
    try { wireBody = JSON.parse(wire.body); } catch { wireBody = { raw: (wire.body || "").slice(0, 200) }; }

    // 2. the same failure through the real UI
    // DOM click: the sign-in modal can reappear and swallow a real click,
    // which is a different finding (F-3) and not what is under test here.
    await a.win.evaluate(() => document.querySelector("#ui-cut")?.click());
    let alert = "";
    for (let i = 0; i < 40; i++) {
      alert = await a.win.evaluate(() =>
        Array.from(document.querySelectorAll('[role="alert"]')).map((e) => e.innerText).join("\n--\n"),
      );
      if (alert && alert.length > 15) break;
      await a.win.waitForTimeout(500);
    }
    const shot = await a.shot(`case-${name}`);
    const copyButton = await a.win.evaluate(() =>
      Array.from(document.querySelectorAll("button")).some((b) => /Copy diagnostics/.test(b.textContent || "")),
    );
    let clipboard = null;
    if (copyButton) {
      await a.win.evaluate(() => {
        const b = Array.from(document.querySelectorAll("button")).find((x) => /Copy diagnostics/.test(x.textContent || ""));
        b?.click();
      });
      await a.win.waitForTimeout(1000);
      clipboard = await a.clipboard();
      fs.writeFileSync(path.join(a.outDir, `bundle-${name}.txt`), clipboard || "");
    }

    const row = {
      name,
      wireStatus: wire.status,
      wireKeys: Object.keys(wireBody || {}),
      wireCode: wireBody && wireBody.code,
      wireHasDiagnostics: Boolean(wireBody && wireBody.diagnostics),
      wireDiagnosticsKeys: wireBody && wireBody.diagnostics ? Object.keys(wireBody.diagnostics) : [],
      wireError: String((wireBody && wireBody.error) || "").slice(0, 160),
      alertText: alert.slice(0, 300),
      copyDiagnosticsButtonShown: copyButton,
      clipboardBytes: (clipboard || "").length,
      shot,
    };
    if (clipboard) {
      row.bundle = {
        jobLine: (clipboard.match(/Job:\s*(.*)/) || [])[1] || null,
        appLine: (clipboard.match(/App:\s*(.*)/) || [])[1] || null,
        stderrHeader: (clipboard.match(/engine stderr[^\n]*/) || [])[0] || null,
        logHeader: (clipboard.match(/log lines[^\n]*/) || [])[0] || null,
        saysNoneCaptured: (clipboard.match(/\(none captured\)/g) || []).length,
      };
    }
    out.cases.push(row);
    // reset the UI for the next case
    await a.win.fill("#ui-mark-in", "00:00:02");
    await a.win.fill("#ui-mark-out", "00:00:08");
    await a.win.waitForTimeout(400);
    return row;
  }

  await runCase("A-preflight-crash", { failInfo: { exitCode: 1, stderr: STDERR.preflight } });
  await runCase("B-download-stage", { failDownload: { exitCode: 1, stderr: STDERR.downloadStage } });
  await runCase("C-save-folder-gone", { failDownload: { exitCode: 1, stderr: STDERR.saveFolderGone } });
  await runCase("D1-disk-full", { failDownload: { exitCode: 1, stderr: STDERR.diskFull } });
  await runCase("D2-private-video", { failDownload: { exitCode: 1, stderr: STDERR.privateVideo } });

  // ---- E: is F-8's branch reachable WITHOUT a planted `-v` line? --------
  // The download path never passes `verbose` (only the auth probe at
  // server/index.ts:960 does), so real yt-dlp would not print
  // "Loading cookies from ..." there. Case C's trigger is therefore an
  // artefact of the planted stderr. This case uses a REAL yt-dlp cookie
  // error with a browser source, which needs no -v at all.
  clearStub();
  L.stub(stubRoot, { failDownload: { exitCode: 1, stderr: 'ERROR: could not find chrome cookies database in "/root/.config/google-chrome"' } });
  const wireE = await L.jsonReq({
    port: a.port, path: "/api/download?jobId=v_f58_E",
    body: { url: URL1, quality: "360", format: "mp4", deliver: "stream", cookiesFromBrowser: "chrome", segments: [{ start: 2, end: 8 }] },
    timeout: 120000,
  });
  let eb = null; try { eb = JSON.parse(wireE.body); } catch { eb = { raw: (wireE.body || "").slice(0, 200) }; }
  out.E_genuineCookieError = {
    status: wireE.status,
    keys: Object.keys(eb || {}),
    code: eb && eb.code,
    hasCode: Object.prototype.hasOwnProperty.call(eb || {}, "code"),
    error: String((eb && eb.error) || "").slice(0, 200),
  };
  // F-5's workaround question: does the whole-log route carry what the
  // per-failure bundle dropped?
  out.F5_preflightStderrInMainLog = a.mainLog().includes("NoneType' object is not subscriptable");
  out.F5_mainLogBytes = a.mainLog().length;

  out.evidenceDir = a.outDir;
  await a.close();

  out.summary = out.cases.map((c) => ({
    case: c.name,
    status: c.wireStatus,
    code: c.wireCode === undefined ? "(absent)" : c.wireCode,
    diagnostics: c.wireHasDiagnostics,
    copyButton: c.copyDiagnosticsButtonShown,
    bundleBytes: c.clipboardBytes,
    noneCaptured: c.bundle ? c.bundle.saysNoneCaptured : null,
    job: c.bundle ? c.bundle.jobLine : null,
    alert: c.alertText.slice(0, 90),
  }));
  out.summaryExtra = { E_genuineCookieError: out.E_genuineCookieError, F5_preflightStderrInMainLog: out.F5_preflightStderrInMainLog };
  console.log(JSON.stringify(out.summary, null, 2));
  console.log(JSON.stringify(out.summaryExtra, null, 2));
  console.log(L.save(`v-f58-${runLabel}.json`, out));
})();
