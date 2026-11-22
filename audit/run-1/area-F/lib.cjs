/**
 * Shared helpers for area-F (help, diagnostics, updates) audit scripts.
 * Audit-only. Touches no product code.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const STUB = "/tmp/stub-F";
const OUT = "/home/user/stream-trimmer/audit/out/area-F";
const ELECTRON_BIN = "/home/user/stream-trimmer/node_modules/electron/dist/electron";

/**
 * Same contract as audit/harness/app.cjs launchApp, but points at a frozen
 * mirror of the app (see setup-app-mirror.cjs) so a parallel helper rebuilding
 * the repo's dist/ cannot change what this run measured. `appRoot` selects the
 * mirror. Nothing here touches product code.
 */
async function launchApp(opts = {}) {
  const label = opts.label || "run";
  const appRoot = opts.appRoot || "/tmp/f-app";
  const outDir = opts.outDir || path.join(OUT, label);
  fs.mkdirSync(outDir, { recursive: true });

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `clipperF-${label}-`));
  if (opts.seed) {
    fs.writeFileSync(path.join(userDataDir, "settings.json"), JSON.stringify(opts.seed, null, 2));
  }
  if (opts.files) {
    for (const [name, body] of Object.entries(opts.files)) {
      const target = path.join(userDataDir, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
    }
  }

  const logs = { stdout: [], stderr: [], console: [], pageErrors: [] };
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [
      path.join(appRoot, "electron", "main.cjs"),
      `--user-data-dir=${userDataDir}`,
      "--no-sandbox",
      "--disable-gpu",
    ],
    cwd: opts.cwd || STUB,
    env: { ...process.env, ...(opts.env || {}) },
  });
  app.process().stdout.on("data", (d) => logs.stdout.push(String(d)));
  app.process().stderr.on("data", (d) => logs.stderr.push(String(d)));

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
    await app.close().catch(() => {});
    throw new Error(`main window never appeared.\nstderr:\n${logs.stderr.join("")}\nstdout:\n${logs.stdout.join("")}`);
  }
  win.on("console", (m) => logs.console.push(`[${m.type()}] ${m.text()}`));
  win.on("pageerror", (e) => logs.pageErrors.push(String(e)));
  await win.waitForLoadState("domcontentloaded");

  let shotN = 0;
  const shot = async (name) => {
    const file = path.join(outDir, `${String(++shotN).padStart(2, "0")}-${name}.png`);
    await win.screenshot({ path: file });
    return file;
  };
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

function stub(cfg) {
  const base = {
    info: { id: "stub0000001", title: "Stub video", duration: 3600, uploader: "Stub channel" },
    exitCode: 0,
    stderr: "",
    delayMs: 0,
    progress: [0, 50, 100],
    writeMedia: false,
  };
  fs.writeFileSync(path.join(STUB, "stub.json"), JSON.stringify({ ...base, ...cfg }, null, 2));
}

/**
 * Makes the auth probe read as signed_in while leaving ordinary runs working.
 * The area-F stub (/tmp/stub-F/resources/bin/yt-dlp) answers --version
 * unconditionally and uses `authStderr` only for the auth probe.
 */
function stubSignedIn(extra = {}) {
  stub({
    exitCode: 0,
    authStderr:
      "[debug] Extracted cookies from cookies file\n[debug] Found YouTube account cookies",
    authExitCode: 1,
    ...extra,
  });
}

/** A valid Netscape cookies.txt carrying a YouTube sign-in. */
function goodCookies(expires = 2000000000) {
  return [
    "# Netscape HTTP Cookie File",
    `.youtube.com\tTRUE\t/\tTRUE\t${expires}\tSID\tAbCdEf_sid_value_1234567890`,
    `.youtube.com\tTRUE\t/\tTRUE\t${expires}\tHSID\tAbCdEf_hsid_value_123`,
    `.youtube.com\tTRUE\t/\tTRUE\t${expires}\tSSID\tAbCdEf_ssid_value_123`,
    `.youtube.com\tTRUE\t/\tTRUE\t${expires}\tLOGIN_INFO\tAFmmF2s_login_info_blob`,
    "",
  ].join("\n");
}

const BASE_SEED = {
  "clipper.dataDirConfirmed": true,
  "clipper.dataDir": "/tmp/stub-F/data",
  "clipper.clipsDir": "/tmp/stub-F/clips",
  "clipper.saveDir": "/tmp/stub-F/clips",
};

/**
 * Boots the app, drops a valid cookies.txt into userData, and reloads so the
 * sign-in modal is gone and the workspace is reachable. Returns the harness
 * handle. Nothing here touches product code — it writes the same file the
 * product's own importer writes.
 */
async function boot(label, opts = {}) {
  fs.mkdirSync("/tmp/stub-F/clips", { recursive: true });
  fs.mkdirSync("/tmp/stub-F/data", { recursive: true });
  if (!opts.noStub) stubSignedIn();
  const a = await launchApp({
    label,
    appRoot: opts.appRoot,
    cwd: STUB,
    outDir: opts.outDir || path.join(OUT, label),
    seed: { ...BASE_SEED, ...(opts.seed || {}) },
    files: opts.signedOut ? opts.files : { "yt-cookies.txt": goodCookies(), ...(opts.files || {}) },
    env: opts.env,
  });
  await a.win.waitForSelector("header", { timeout: 25000 }).catch(() => {});
  await a.win.waitForTimeout(1500);
  return a;
}

/** Is the sign-in modal covering the app? */
async function modalOpen(win) {
  return win.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return Boolean(d && /sign|cookies|youtube/i.test(d.textContent || ""));
  });
}

/** Dismiss the sign-in modal if it is open (Escape / any close affordance). */
async function dismissModal(win) {
  for (let i = 0; i < 3; i++) {
    if (!(await modalOpen(win))) return true;
    await win.keyboard.press("Escape");
    await win.waitForTimeout(300);
  }
  return !(await modalOpen(win));
}

/** Pull the help task catalogue out of the running bundle (no product change). */
const TASKS_SRC = path.join("/home/user/stream-trimmer", "src", "lib", "helpTasks.ts");

/** Parse HELP_TASKS + CHANNEL_HELP_TASKS from source: ids, titles, anchors. */
function readCatalogue() {
  const src = fs.readFileSync(TASKS_SRC, "utf8");
  const anchors = {};
  const am = src.match(/export const ANCHORS = \{([\s\S]*?)\} as const;/);
  for (const line of am[1].split("\n")) {
    const m = line.match(/(\w+):\s*"([^"]+)"/);
    if (m) anchors[m[1]] = m[2];
  }
  const tasks = [];
  const blockRe = /\{\s*id:\s*"([^"]+)",\s*title:\s*"([^"]+)",\s*aliases:\s*\[([^\]]*)\],\s*steps:\s*\[([\s\S]*?)\n\s*\],\s*\}/g;
  let m;
  while ((m = blockRe.exec(src))) {
    const steps = [];
    const stepRe = /\{\s*do:\s*"((?:[^"\\]|\\.)*)",\s*why:\s*"((?:[^"\\]|\\.)*)",\s*anchorId:\s*(?:A\.(\w+)|"([^"]+)")\s*\}/g;
    let s;
    while ((s = stepRe.exec(m[4]))) {
      steps.push({ do: s[1], why: s[2], anchorId: s[3] ? anchors[s[3]] : s[4] });
    }
    tasks.push({
      id: m[1],
      title: m[2],
      aliases: m[3].split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean),
      steps,
    });
  }
  return { anchors, tasks };
}

/** Bounding box of an element by selector, or null. */
async function box(win, selector) {
  return win.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, top: r.top };
  }, selector);
}

/** Open the help drawer by clicking the "?" button. */
async function openHelp(win) {
  await win.click("#ui-help-button");
  await win.waitForSelector("#ui-help-drawer", { timeout: 5000 });
  await win.waitForTimeout(250);
}

module.exports = {
  STUB,
  OUT,
  BASE_SEED,
  stub,
  stubSignedIn,
  goodCookies,
  boot,
  modalOpen,
  dismissModal,
  readCatalogue,
  box,
  openHelp,
  launchApp,
};
