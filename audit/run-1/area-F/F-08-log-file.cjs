/**
 * F-08: the whole-log diagnostics disclosure under interruptions.
 *   - no log file at all
 *   - an empty log file
 *   - a 50 MB log file (does the app hang?)
 *   - a log file holding invalid UTF-8
 * Drives diagnostics:read / diagnostics:copy / diagnostics:reveal through the
 * preload bridge and, for one case, through the real disclosure UI.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const SIGNED_OUT =
  "ERROR: [youtube] jNQXAC9IVRw: Sign in to confirm your age. This video may be inappropriate for some users.";

async function drive(label, { logBody, deleteLog } = {}) {
  // Signed out so the connect modal (the only host of DiagnosticsDisclosure)
  // is on screen.
  L.stub({ exitCode: 0, authStderr: SIGNED_OUT, authExitCode: 1 });
  const a = await L.boot(`F-08-${label}`, { signedOut: true, noStub: true });
  const logPath = path.join(a.userDataDir, "logs", "main.log");
  try {
    if (deleteLog) {
      fs.rmSync(logPath, { force: true });
    } else if (logBody !== undefined) {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.writeFileSync(logPath, logBody);
    }
    const sizeBefore = fs.existsSync(logPath) ? fs.statSync(logPath).size : -1;

    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.waitForTimeout(1500);

    const t0 = Date.now();
    const read = await a.win.evaluate(async () => {
      const t = performance.now();
      try {
        const r = await window.electronAPI.readDiagnostics();
        return { ok: true, ms: Math.round(performance.now() - t), path: r.path, textLen: (r.text || "").length, head: (r.text || "").slice(0, 120) };
      } catch (e) {
        return { ok: false, ms: Math.round(performance.now() - t), error: String(e) };
      }
    });
    const readWall = Date.now() - t0;

    const t1 = Date.now();
    const copied = await a.win.evaluate(async () => {
      const t = performance.now();
      try {
        const r = await window.electronAPI.copyDiagnostics();
        return { ...r, ms: Math.round(performance.now() - t) };
      } catch (e) {
        return { ok: false, error: String(e), ms: Math.round(performance.now() - t) };
      }
    });
    const copyWall = Date.now() - t1;
    const clipLen = await a.app.evaluate(({ clipboard }) => clipboard.readText().length);

    const revealed = await a.win.evaluate(async () => {
      try {
        return await window.electronAPI.revealDiagnostics();
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    });

    // Does the window still respond after all that?
    const responsive = await a.win.evaluate(() => {
      const t = performance.now();
      document.title = document.title;
      return Math.round(performance.now() - t) < 50;
    });

    const row = { label, sizeBefore, read, readWall, copied, copyWall, clipLen, revealed, responsive };
    console.log(JSON.stringify(row, null, 1));

    // And through the real UI, once.
    const uiOpened = await a.win.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Diagnostics");
      if (!b) return false;
      b.click();
      return true;
    });
    await a.win.waitForTimeout(1500);
    const ui = await a.win.evaluate(() => {
      const pre = document.querySelector("pre");
      return {
        preText: (pre?.textContent || "").slice(0, 160),
        preLen: (pre?.textContent || "").length,
        pathShown: [...document.querySelectorAll("p")].map((p) => p.textContent).find((t) => /main\.log/.test(t || "")) ?? null,
      };
    });
    row.uiOpened = uiOpened;
    row.ui = ui;
    console.log("UI:", JSON.stringify(ui));
    row.shot = await a.shot(`diagnostics-${label}`);
    console.log("SHOT", row.shot);
    return row;
  } finally {
    await a.close();
  }
}

(async () => {
  const rows = [];
  rows.push(await drive("no-log-file", { deleteLog: true }));
  rows.push(await drive("empty-log", { logBody: "" }));
  rows.push(
    await drive("invalid-utf8", {
      logBody: Buffer.concat([
        Buffer.from("2026-01-01T00:00:00.000Z [app] start\n"),
        Buffer.from([0xff, 0xfe, 0xfd, 0x80, 0x81, 0x0a]),
        Buffer.from("2026-01-01T00:00:01.000Z [app] after bad bytes\n"),
      ]),
    }),
  );
  const big = Buffer.alloc(0);
  const line = "2026-01-01T00:00:00.000Z [log] filler line to make the diagnostic log large enough to matter\n";
  const chunk = Buffer.from(line.repeat(1000));
  const parts = [];
  while (Buffer.concat(parts).length < 50 * 1024 * 1024 && parts.length < 600) parts.push(chunk);
  rows.push(await drive("50mb-log", { logBody: Buffer.concat([big, ...parts]) }));

  const out = path.join(L.OUT, "F-08-log-file.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log("\nREPORT", out);
  console.log("\nlabel          size        read ms  text len  copy ms  clip len  responsive  reveal");
  for (const r of rows) {
    console.log(
      `${r.label.padEnd(14)} ${String(r.sizeBefore).padEnd(11)} ${String(r.readWall).padEnd(8)} ${String(r.read.textLen ?? "-").padEnd(9)} ${String(r.copyWall).padEnd(8)} ${String(r.clipLen).padEnd(9)} ${String(r.responsive).padEnd(11)} ${JSON.stringify(r.revealed)}`,
    );
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
