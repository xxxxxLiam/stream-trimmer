/**
 * F-07b: does the server actually send per-failure `diagnostics`, and does the
 * renderer keep it? Hits /api/download directly from the page and prints the
 * failure body, then repeats through the UI and prints the clipboard.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const SIGNED_IN = "[debug] Extracted cookies from cookies file\n[debug] Found YouTube account cookies";
const SHORT = { id: "stub0000001", title: "Stub video", duration: 60, uploader: "Stub channel" };

(async () => {
  L.stub({ exitCode: 0, writeMedia: false, authStderr: SIGNED_IN, authExitCode: 1, info: SHORT });
  const a = await L.boot("F-07b-failure-body", { noStub: true });
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });

    L.stub({
      exitCode: 1,
      authStderr: SIGNED_IN,
      authExitCode: 1,
      info: SHORT,
      stderr: [
        "[debug] yt-dlp version 2099.12.31",
        "[debug] Loading cookies",
        "ERROR: Traceback (most recent call last): TypeError: NoneType object is not subscriptable",
      ].join("\n"),
    });

    const body = await a.win.evaluate(async () => {
      const r = await fetch(`${window.__API_BASE__}/api/download?jobId=auditjob1`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://www.youtube.com/watch?v=stub0000001",
          start: 2,
          end: 8,
          format: "mp4",
          quality: "best",
          deliver: "path",
          cookiesFromBrowser: "app",
        }),
      });
      return { status: r.status, text: await r.text() };
    });
    console.log("STATUS", body.status);
    let parsed = null;
    try {
      parsed = JSON.parse(body.text);
    } catch {
      /* not json */
    }
    console.log("BODY KEYS", parsed ? Object.keys(parsed) : body.text.slice(0, 300));
    if (parsed?.diagnostics) {
      const d = parsed.diagnostics;
      console.log("diagnostics keys:", Object.keys(d));
      console.log("  jobId:", d.jobId, " appVersion:", d.appVersion, " homeDir:", d.homeDir);
      console.log("  stderrTail lines:", (d.stderrTail || []).length);
      console.log("  logLines:", (d.logLines || []).length);
      console.log("  logLines sample:", JSON.stringify((d.logLines || []).slice(0, 3)));
    } else {
      console.log("NO diagnostics in failure body. code =", parsed?.code, "error =", String(parsed?.error).slice(0, 160));
    }
    fs.writeFileSync(path.join(a.outDir, "failure-body.json"), body.text);

    // Same thing again but WITHOUT the explicit jobId query param, which is
    // what the UI sends.
    const body2 = await a.win.evaluate(async () => {
      const r = await fetch(`${window.__API_BASE__}/api/download`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://www.youtube.com/watch?v=stub0000001",
          start: 2,
          end: 8,
          format: "mp4",
          quality: "best",
          deliver: "path",
          cookiesFromBrowser: "app",
        }),
      });
      return { status: r.status, text: await r.text() };
    });
    const p2 = JSON.parse(body2.text);
    console.log("\n(no jobId param) keys:", Object.keys(p2), "diagnostics?", Boolean(p2.diagnostics));
    if (p2.diagnostics) {
      console.log("  stderrTail:", (p2.diagnostics.stderrTail || []).length, "logLines:", (p2.diagnostics.logLines || []).length);
      console.log("  stderrTail sample:", JSON.stringify((p2.diagnostics.stderrTail || []).slice(0, 4)));
    }
    fs.writeFileSync(path.join(a.outDir, "failure-body-nojobid.json"), body2.text);
    console.log("PAGE ERRORS", JSON.stringify(a.logs.pageErrors));
  } finally {
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
