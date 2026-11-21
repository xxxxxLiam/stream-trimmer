/**
 * slice-4 verification scaffolding: launch a frozen MIRROR of the app (so a
 * parallel helper's rebuild of the repo's dist/ cannot swap the build under a
 * run), with a fresh user-data dir every time.
 *
 * Built on the same Playwright _electron.launch shape as audit/harness/app.cjs
 * but pointed at a mirror's electron/main.cjs instead of the repo's.
 */
const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO = "/home/user/stream-trimmer";
const SLICE = path.join(REPO, "audit", "run-1", "verify", "slice-4");
const OUT = path.join(SLICE, "out");
const ELECTRON_BIN = path.join(REPO, "node_modules", "electron", "dist", "electron");

async function launch(opts = {}) {
  const mirror = opts.mirror || "/tmp/s4-public";
  const label = opts.label || "run";
  const outDir = path.join(OUT, label);
  fs.mkdirSync(outDir, { recursive: true });

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `s4-${label}-`));
  if (opts.seed) {
    fs.writeFileSync(
      path.join(userDataDir, "settings.json"),
      JSON.stringify(opts.seed, null, 2),
    );
  }
  if (opts.cookieFile) {
    fs.writeFileSync(path.join(userDataDir, "yt-cookies.txt"), opts.cookieFile, { mode: 0o600 });
  }

  const logs = { stdout: [], stderr: [], console: [], pageErrors: [] };
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [
      path.join(mirror, "electron", "main.cjs"),
      `--user-data-dir=${userDataDir}`,
      "--no-sandbox",
      "--disable-gpu",
    ],
    cwd: opts.cwd || mirror,
    env: { ...process.env, ...(opts.env || {}) },
  });
  app.process().stdout.on("data", (d) => logs.stdout.push(String(d)));
  app.process().stderr.on("data", (d) => logs.stderr.push(String(d)));

  const deadline = Date.now() + (opts.timeout || 60000);
  let win = null;
  while (!win && Date.now() < deadline) {
    for (const w of app.windows()) {
      let url = "";
      try { url = w.url(); } catch { continue; }
      if (url.includes("127.0.0.1")) { win = w; break; }
    }
    if (!win) await new Promise((r) => setTimeout(r, 200));
  }
  if (!win) {
    const urls = app.windows().map((w) => { try { return w.url(); } catch { return "<gone>"; } });
    await app.close().catch(() => {});
    throw new Error(`no main window. windows=${JSON.stringify(urls)}\n${logs.stderr.join("")}`);
  }
  win.on("console", (m) => logs.console.push(`[${m.type()}] ${m.text()}`));
  win.on("pageerror", (e) => logs.pageErrors.push(String(e)));
  await win.waitForLoadState("domcontentloaded");

  let n = 0;
  const shot = async (name) => {
    const f = path.join(outDir, `${String(++n).padStart(2, "0")}-${name}.png`);
    await win.screenshot({ path: f });
    return f;
  };
  const readState = () => {
    try { return JSON.parse(fs.readFileSync(path.join(userDataDir, "settings.json"), "utf8")); }
    catch { return {}; }
  };
  const save = (name, data) => {
    const f = path.join(outDir, name);
    fs.writeFileSync(f, typeof data === "string" ? data : JSON.stringify(data, null, 2));
    return f;
  };
  const close = async () => {
    try { fs.writeFileSync(path.join(outDir, "logs.json"), JSON.stringify(logs, null, 2)); } catch {}
    await app.close().catch(() => {});
  };
  return { app, win, userDataDir, outDir, logs, shot, readState, save, close };
}

/** POST/GET the app's own server from inside the page, on that instance's port. */
async function api(win, method, route, body) {
  return win.evaluate(
    async ([m, r, b]) => {
      const res = await fetch(`${window.__API_BASE__}${r}`, {
        method: m,
        headers: b ? { "content-type": "application/json" } : undefined,
        body: b ? JSON.stringify(b) : undefined,
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { status: res.status, json, text: text.slice(0, 4000) };
    },
    [method, route, body ?? null],
  );
}

/** A Netscape cookies.txt with one SID row, expiring at `expires` (epoch s). */
function cookieTxt(expires = Math.floor(Date.now() / 1000) + 86400 * 30) {
  return [
    "# Netscape HTTP Cookie File",
    `.youtube.com\tTRUE\t/\tTRUE\t${expires}\tSID\tSTUBSIDVALUE123`,
    `.youtube.com\tTRUE\t/\tTRUE\t${expires}\tHSID\tSTUBHSID`,
    `.youtube.com\tTRUE\t/\tTRUE\t${expires}\tSSID\tSTUBSSID`,
    "",
  ].join("\n");
}

const SIGNED_IN_STDERR =
  "[debug] Extracting cookies from chrome\n[debug] Found YouTube account cookies\n[debug] Extracted 42 cookies from chrome";

module.exports = { launch, api, cookieTxt, SIGNED_IN_STDERR, REPO, SLICE, OUT };
