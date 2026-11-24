/**
 * File: app.cjs
 * Path: audit/harness/app.cjs
 * Description: Launches the real packaged-shape Electron app for audit runs and
 *   hands back a driveable Playwright page. Audit-only; no product code is
 *   touched or imported.
 *
 * Isolation, which is what makes parallel helpers safe:
 *   - Each launch gets a fresh `--user-data-dir`. Electron holds a
 *     single-instance lock per user-data dir, so without this a second helper
 *     silently hands its work to the first one's window.
 *   - The app picks its own free HTTP port (src/main/modules/engineHost/engineHost.ts: pickFreePort),
 *     so nothing needs coordinating ports.
 *   - `cwd` decides where the server finds yt-dlp/ffmpeg
 *     (server/index.ts: resolveBinDir falls back to `<cwd>/resources/bin`).
 *     Point it at a stub root to script yt-dlp's behaviour offline.
 *
 * Seeding: state lives in `<userData>/settings.json` (src/renderer/src/shared/utils/persist.ts reads
 * it through the preload snapshot), so `seed` is written before launch and the
 * app boots already in that state.
 */
const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..", "..");
const ELECTRON_BIN = path.join(REPO, "node_modules", "electron", "dist", "electron");

/**
 * @param {object} [opts]
 * @param {Record<string, unknown>} [opts.seed]  settings.json contents to boot with
 * @param {string} [opts.cwd]      root holding resources/bin (defaults to the repo)
 * @param {Record<string,string>} [opts.env]     extra env for the main process
 * @param {string} [opts.label]    used in screenshot filenames
 * @param {string} [opts.outDir]   where screenshots and logs go
 * @param {number} [opts.timeout]  ms to wait for the main window
 */
async function launchApp(opts = {}) {
  const label = opts.label || "run";
  const outDir = opts.outDir || path.join(REPO, "audit", "out", label);
  fs.mkdirSync(outDir, { recursive: true });

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `clipper-${label}-`));
  if (opts.seed) {
    fs.writeFileSync(
      path.join(userDataDir, "settings.json"),
      JSON.stringify(opts.seed, null, 2),
    );
  }

  const logs = { stdout: [], stderr: [], console: [], pageErrors: [] };

  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [
      path.join(REPO, "out", "main", "index.cjs"),
      `--user-data-dir=${userDataDir}`,
      "--no-sandbox",
      "--disable-gpu",
    ],
    cwd: opts.cwd || REPO,
    env: { ...process.env, ...(opts.env || {}) },
  });

  app.process().stdout.on("data", (d) => logs.stdout.push(String(d)));
  app.process().stderr.on("data", (d) => logs.stderr.push(String(d)));

  // The splash window opens first; the real one is served over 127.0.0.1.
  const deadline = Date.now() + (opts.timeout || 45000);
  let win = null;
  while (!win && Date.now() < deadline) {
    for (const w of app.windows()) {
      let url = "";
      try {
        url = w.url();
      } catch {
        continue;
      }
      if (url.includes("127.0.0.1") || url.includes("localhost:8080")) {
        win = w;
        break;
      }
    }
    if (!win) await new Promise((r) => setTimeout(r, 250));
  }
  if (!win) {
    const urls = app.windows().map((w) => {
      try {
        return w.url();
      } catch {
        return "<gone>";
      }
    });
    await app.close().catch(() => {});
    throw new Error(
      `main window never appeared. windows=${JSON.stringify(urls)}\n` +
        `stderr:\n${logs.stderr.join("")}`,
    );
  }

  win.on("console", (m) => logs.console.push(`[${m.type()}] ${m.text()}`));
  win.on("pageerror", (e) => logs.pageErrors.push(String(e)));

  await win.waitForLoadState("domcontentloaded");

  let shotN = 0;
  /** Screenshot as evidence. Returns the path to cite in a bug report. */
  const shot = async (name) => {
    const file = path.join(outDir, `${String(++shotN).padStart(2, "0")}-${name}.png`);
    await win.screenshot({ path: file });
    return file;
  };

  /** Read the app's current settings.json — what actually got persisted. */
  const readState = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(userDataDir, "settings.json"), "utf8"));
    } catch {
      return {};
    }
  };

  const close = async () => {
    fs.writeFileSync(path.join(outDir, "logs.json"), JSON.stringify(logs, null, 2));
    await app.close().catch(() => {});
  };

  return { app, win, userDataDir, outDir, logs, shot, readState, close };
}

module.exports = { launchApp, REPO, ELECTRON_BIN };
