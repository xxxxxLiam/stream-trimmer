/**
 * v-f67-secrets.cjs — VERIFY F-6 and F-7.
 *
 *  F-6: "Copy log" puts raw cookie values, bearer tokens, the user's email and
 *       absolute home paths on the clipboard, under a line promising it does not.
 *  F-7: the on-screen failure alert renders the engine's raw stderr unredacted.
 *
 * Written from the findings' Steps, from scratch. TWO cold starts, because the
 * two sinks live in different app states:
 *
 *  PHASE 1 (no saved sign-in, so the YouTube sign-in modal is up — which is
 *  where src/components/DiagnosticsDisclosure.tsx actually lives):
 *    - make the engine fail with planted stderr,
 *    - expand "Diagnostics", read the promise sentence the UI shows,
 *    - press the REAL "Copy log" button, read Electron's own clipboard,
 *    - read the log file on disk and the <pre> rendered next to the button.
 *
 *  PHASE 2 (a saved sign-in seeded before launch, so the modal is gone and
 *  the workspace is clickable):
 *    - paste a link, mark the whole video, press the REAL "Cut as one file",
 *    - read the real [role="alert"] text and the whole visible body text.
 *
 * Every planted value is a made-up marker, not a credential. Matches are
 * reported by NAME and SHAPE only; the raw values are stripped from every
 * artefact this script writes.
 *
 * Run: xvfb-run -a --server-args="-screen 0 1440x900x24" node v-f67-secrets.cjs [runLabel]
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./v-lib.cjs");

const M = {
  cookieRowValue: "AKxxV3SIDROW000111",
  cookieHeaderValue: "AKxxV3SIDHEADER000222",
  secure3psid: "AKxxV3SECURE3PSID000333",
  bearer: "ya29.V3BEARERTOKEN000444",
  accessToken: "V3ACCESSTOKEN000555",
  sig: "V3SIGNATURE000666",
  streamId: "o-V3STREAMID000777",
  email: "sam.clipper@example.com",
  homePath: "/root/Videos/clips/V3SECRETFOLDER/out.mp4",
};

const STDERR = [
  "[debug] yt-dlp version 2099.12.31",
  `.youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\t${M.cookieRowValue}`,
  `[debug] Cookie: SID=${M.cookieHeaderValue}; __Secure-3PSID=${M.secure3psid}`,
  `[debug] Authorization: Bearer ${M.bearer}`,
  `[debug] token body access_token=${M.accessToken}&grant_type=refresh`,
  `[debug] https://rr3---sn-abc.googlevideo.com/videoplayback?expire=1&id=${M.streamId}&sig=${M.sig}&ip=1.2.3.4`,
  `[debug] signed in as user ${M.email}`,
  `ERROR: unable to write to ${M.homePath}`,
  "ERROR: Postprocessing: ffmpeg exited with code 234",
].join("\n");

const found = (t) => Object.fromEntries(Object.entries(M).map(([k, v]) => [k, String(t || "").includes(v)]));
const nFound = (o) => Object.values(o).filter(Boolean).length;
/** Shows the SHAPE of a match, never the value. */
function shapes(text, pre = 26) {
  const t = String(text || "");
  const o = {};
  for (const [k, v] of Object.entries(M)) {
    const i = t.indexOf(v);
    if (i < 0) continue;
    o[k] = `${t.slice(Math.max(0, i - pre), i + 6).replace(/\n/g, "\\n").replace(/\t/g, "\\t")}…REDACTED(${v.length} chars)`;
  }
  return o;
}
const scrub = (s) => {
  let t = String(s || "");
  for (const [k, v] of Object.entries(M)) t = t.split(v).join(`<<${k}:REDACTED>>`);
  return t;
};

const URL1 = "https://www.youtube.com/watch?v=stub0000001";

async function phase1(runLabel, out) {
  const stubRoot = L.makeStub(`f6-${runLabel}`);
  L.stub(stubRoot, { info: { id: "stub0000001", title: "Stub video", duration: 30 } });
  const a = await L.launchMirror({ shape: "public", label: `v-f6-${runLabel}`, stubRoot, seed: { "clipper.dataDirConfirmed": true } });
  await a.win.waitForSelector("header", { timeout: 20000 });

  // Make the engine fail with the planted stderr and call the endpoint the
  // renderer calls on every URL paste. The server logs the raw stderr.
  L.stub(stubRoot, { failInfo: { exitCode: 1, stderr: STDERR } });
  const r = await L.jsonReq({ port: a.port, path: "/api/info", body: { url: URL1 } });
  out.F6_infoCallStatus = r.status;
  await a.win.waitForTimeout(800);

  // The Diagnostics disclosure lives inside the sign-in modal, which is open
  // because there is no saved sign-in. Expand it with a real click.
  out.F6_modalPresent = await a.win.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')));
  await a.win.getByRole("button", { name: /^Diagnostics$/ }).click({ timeout: 8000 });
  await a.win.waitForTimeout(900);
  out.F6_shots = { diagnostics: await a.shot("diagnostics-open") };

  out.F6_promiseTextOnScreen = await a.win.evaluate(() => {
    const p = Array.from(document.querySelectorAll("p")).find((x) => /records what happened/.test(x.textContent || ""));
    return p ? p.textContent.replace(/\s+/g, " ").trim() : null;
  });
  out.F6_renderedPre = await a.win.evaluate(() => {
    const pres = Array.from(document.querySelectorAll("pre"));
    return pres.map((p) => p.textContent || "").join("\n");
  });
  out.F6_bodyText = await a.win.evaluate(() => document.body.innerText);

  await a.win.getByRole("button", { name: /Copy log/ }).click({ timeout: 8000 });
  await a.win.waitForTimeout(1200);
  out.F6_copyNote = await a.win.evaluate(() => {
    const p = Array.from(document.querySelectorAll("p")).find((x) => /Copied to clipboard|Could not copy/.test(x.textContent || ""));
    return p ? p.textContent.trim() : null;
  });
  out.F6_shots.afterCopy = await a.shot("after-copy-log");

  const clip = await a.clipboard();
  const log = a.mainLog();
  out.F6_clipboardBytes = (clip || "").length;
  out.F6_logFileBytes = log.length;
  out.F6_secretsInClipboard = found(clip);
  out.F6_secretsInLogFile = found(log);
  out.F6_secretsInRenderedPre = found(out.F6_renderedPre);
  out.F6_secretsOnScreenPhase1 = found(out.F6_bodyText);
  out.F6_clipboardShapes = shapes(clip);
  out.F6_logPathInClipboard = /\/tmp\/v3-/.test(clip || "") || /yt-cookies\.txt/.test(clip || "");
  out.F6_absoluteHomePathsInClipboard = (String(clip).match(/(^|[\s"'=])\/(root|home|tmp)\/[^\s"')]+/g) || []).slice(0, 6);

  fs.writeFileSync(path.join(a.outDir, "clipboard.redacted.txt"), scrub(clip));
  fs.writeFileSync(path.join(a.outDir, "main.log.redacted.txt"), scrub(log));
  out.F6_evidenceDir = a.outDir;
  await a.close();
}

async function phase2(runLabel, out) {
  const stubRoot = L.makeStub(`f7-${runLabel}`);
  L.stub(stubRoot, { info: { id: "stub0000001", title: "Stub video", duration: 30 } });
  // A saved sign-in placed before launch, so the sign-in modal is not up and
  // the workspace can really be clicked.
  const a = await L.launchMirror({
    shape: "public",
    label: `v-f7-${runLabel}`,
    stubRoot,
    seed: { "clipper.dataDirConfirmed": true },
    userFiles: { "yt-cookies.txt": L.cookieJarText() },
  });
  await a.win.waitForSelector("header", { timeout: 20000 });
  await a.win.waitForTimeout(1500);
  out.F7_modalPresent = await a.win.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')));

  await a.win.fill('input[type="url"]', URL1);
  await a.win.press('input[type="url"]', "Enter");
  await a.win.waitForSelector("#ui-cut", { timeout: 20000 });
  await a.win.waitForTimeout(1500);
  out.F7_shots = { loaded: await a.shot("video-loaded") };

  // Now make the download stage fail with the planted stderr.
  L.stub(stubRoot, { failDownload: { exitCode: 1, stderr: STDERR } });

  // Mark a range the way a person does: type an in point and an out point.
  // (#ui-mark-in / #ui-mark-out are the two text fields; the button labelled
  // "Whole video" is actually "clear the range".)
  await a.win.fill("#ui-mark-in", "00:00:02");
  await a.win.fill("#ui-mark-out", "00:00:08");
  await a.win.waitForTimeout(600);
  out.F7_rangeText = await a.win.evaluate(() => ({
    in: document.querySelector("#ui-mark-in")?.value,
    out: document.querySelector("#ui-mark-out")?.value,
    length: document.querySelector("#ui-cut")?.closest("div")?.innerText?.slice(0, 80),
  }));
  out.F7_shots.marked = await a.shot("marked-range");

  const disabled = await a.win.evaluate(() => document.querySelector("#ui-cut")?.disabled);
  out.F7_cutDisabled = disabled;
  await a.win.click("#ui-cut", { timeout: 8000 });
  // the engine runs, fails, and the renderer renders the failure
  for (let i = 0; i < 40; i++) {
    const t = await a.win.evaluate(() =>
      Array.from(document.querySelectorAll('[role="alert"]')).map((e) => e.innerText).join("\n--\n"),
    );
    if (t && t.length > 20) break;
    await a.win.waitForTimeout(500);
  }
  out.F7_shots.failed = await a.shot("cut-failed");

  out.F7_alertText = await a.win.evaluate(() =>
    Array.from(document.querySelectorAll('[role="alert"]')).map((e) => e.innerText).join("\n--\n"),
  );
  out.F7_bodyText = await a.win.evaluate(() => document.body.innerText);
  out.F7_secretsInAlert = found(out.F7_alertText);
  out.F7_secretsOnScreen = found(out.F7_bodyText);
  out.F7_alertShapes = shapes(out.F7_alertText);
  out.F7_copyDiagnosticsButtonShown = await a.win.evaluate(() =>
    Array.from(document.querySelectorAll("button")).some((b) => /Copy diagnostics/.test(b.textContent || "")),
  );

  // For the "one defect or two?" question: is the SAME failure text, put
  // through the product's own redactor for the clipboard bundle, clean?
  if (out.F7_copyDiagnosticsButtonShown) {
    await a.win.getByRole("button", { name: /Copy diagnostics/ }).click({ timeout: 8000 });
    await a.win.waitForTimeout(1000);
    const bundle = await a.clipboard();
    out.F7_perFailureBundleSecrets = found(bundle);
    out.F7_perFailureBundleBytes = (bundle || "").length;
    fs.writeFileSync(path.join(a.outDir, "per-failure-bundle.redacted.txt"), scrub(bundle));
  }

  fs.writeFileSync(path.join(a.outDir, "alert.redacted.txt"), scrub(out.F7_alertText));
  fs.writeFileSync(path.join(a.outDir, "body.redacted.txt"), scrub(out.F7_bodyText));
  out.F7_evidenceDir = a.outDir;
  await a.close();
}

(async () => {
  const runLabel = process.argv[2] || "r1";
  const out = { runLabel, startedAt: new Date().toISOString(), markerNames: Object.keys(M) };
  await phase1(runLabel, out);
  await phase2(runLabel, out);

  out.summary = {
    total: Object.keys(M).length,
    F6_logFile: nFound(out.F6_secretsInLogFile),
    F6_clipboard: nFound(out.F6_secretsInClipboard),
    F6_renderedPre: nFound(out.F6_secretsInRenderedPre),
    F6_anywhereOnScreenPhase1: nFound(out.F6_secretsOnScreenPhase1 || {}),
    F7_onScreenAlert: nFound(out.F7_secretsInAlert),
    F7_anywhereOnScreen: nFound(out.F7_secretsOnScreen),
    F7_perFailureBundle: out.F7_perFailureBundleSecrets ? nFound(out.F7_perFailureBundleSecrets) : "n/a",
    promiseText: out.F6_promiseTextOnScreen,
  };
  console.log(JSON.stringify(out.summary, null, 2));
  console.log(L.save(`v-f67-${runLabel}.json`, out));
})();
