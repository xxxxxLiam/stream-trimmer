#!/usr/bin/env node
/**
 * audit/run-2/area-E/lib.cjs — run-2 area-E scaffolding.
 *
 * Launches a FROZEN MIRROR of the app (see mirror.cjs) rather than the repo's
 * dist/, because other audit areas rebuild the repo's build output while this
 * run is in flight. Otherwise it is the same shape as audit/harness/app.cjs:
 * real Electron main process, real preload, real bundled server, fresh
 * --user-data-dir per launch, stub yt-dlp resolved from `cwd`.
 */
const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REPO = "/home/user/stream-trimmer";
const ELECTRON_BIN = path.join(REPO, "node_modules", "electron", "dist", "electron");
const OUT = path.join(__dirname, "out");

function stubRoot(name) {
  const root = path.join("/tmp", `r2e-stub-${name}`);
  fs.rmSync(root, { recursive: true, force: true });
  execFileSync("node", [path.join(__dirname, "stub.cjs"), root], { stdio: "pipe" });
  return root;
}

function setStub(root, cfg) {
  const file = path.join(root, "stub.json");
  const cur = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ ...cur, ...cfg }, null, 2));
}

function argvLog(root) {
  try {
    return fs
      .readFileSync(path.join(root, "argv.log"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function clearArgvLog(root) {
  try {
    fs.rmSync(path.join(root, "argv.log"), { force: true });
  } catch {
    /* ignore */
  }
}

async function launch(opts) {
  const shape = opts.shape;
  const mirror = `/tmp/r2e-${shape}`;
  if (!fs.existsSync(path.join(mirror, "electron", "main.cjs"))) {
    throw new Error(`mirror ${mirror} not built — run: node audit/run-2/area-E/mirror.cjs ${shape}`);
  }
  const label = opts.label || shape;
  const outDir = opts.outDir || path.join(OUT, label);
  fs.mkdirSync(outDir, { recursive: true });

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `r2e-${label}-`));
  if (opts.seed) {
    fs.writeFileSync(path.join(userDataDir, "settings.json"), JSON.stringify(opts.seed, null, 2));
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
      try {
        url = w.url();
      } catch {
        continue;
      }
      if (url.includes("127.0.0.1")) {
        win = w;
        break;
      }
    }
    if (!win) await new Promise((r) => setTimeout(r, 200));
  }
  if (!win) {
    await app.close().catch(() => {});
    throw new Error(`main window never appeared.\nstderr:\n${logs.stderr.join("")}`);
  }
  win.on("console", (m) => logs.console.push(`[${m.type()}] ${m.text()}`));
  win.on("pageerror", (e) => logs.pageErrors.push(String(e)));
  await win.waitForLoadState("domcontentloaded");

  let n = 0;
  const shot = async (name) => {
    const file = path.join(outDir, `${String(++n).padStart(2, "0")}-${name}.png`);
    try {
      await win.screenshot({ path: file });
    } catch {
      return null;
    }
    return file;
  };
  const readState = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(userDataDir, "settings.json"), "utf8"));
    } catch {
      return {};
    }
  };
  const apiBase = () => win.evaluate(() => window.__API_BASE__);

  /** Raw HTTP from inside the page, so we reach THIS instance's port. */
  const api = (method, route, body, extra) =>
    win.evaluate(
      async ([m, r, b, x]) => {
        const res = await fetch(`${window.__API_BASE__}${r}`, {
          method: m,
          headers: b === null ? (x && x.headers) || {} : { "content-type": "application/json", ...((x && x.headers) || {}) },
          body: b === null ? undefined : typeof b === "string" ? b : JSON.stringify(b),
        });
        const text = await res.text();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          /* html */
        }
        return {
          status: res.status,
          contentType: res.headers.get("content-type"),
          json,
          text: text.slice(0, 1200),
        };
      },
      [method, route, body === undefined ? null : body, extra || null],
    );

  const close = async () => {
    try {
      fs.writeFileSync(path.join(outDir, "logs.json"), JSON.stringify(logs, null, 2));
    } catch {
      /* ignore */
    }
    await app.close().catch(() => {});
  };

  return { app, win, mirror, userDataDir, outDir, logs, shot, readState, api, apiBase, close };
}

function save(name, value) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  console.log(`[saved] ${file}`);
  return file;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { launch, stubRoot, setStub, argvLog, clearArgvLog, save, sleep, REPO, OUT };
