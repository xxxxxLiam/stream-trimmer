/**
 * slice-2 app launcher. Same shape as audit/harness/app.cjs (fresh
 * --user-data-dir per launch, so Electron's single-instance lock keeps this
 * helper off every other helper's window), with three things that harness
 * cannot do and that this slice needs:
 *
 *   - rawSettings: write settings.json as arbitrary TEXT, so a file that does
 *     not parse can be put in front of the real app (G-12).
 *   - cookies: write <userData>/yt-cookies.txt before launch, so the app boots
 *     with connection.connected true and the YouTube modal never covers the
 *     workspace. electron/cookieState.cjs is the only thing that reads it, and
 *     a far-future SID row is all it asks for. No real session is used.
 *   - fsSnapshot/fsCompare: inode + size + mtime + sha256 of a path before and
 *     after, because "the UI said saved" is not proof that bytes were lost.
 */
const { _electron: electron } = require("playwright");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO = "/home/user/stream-trimmer";
const ELECTRON_BIN = path.join(REPO, "node_modules", "electron", "dist", "electron");

const FAR_FUTURE = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
const COOKIES_TXT =
  "# Netscape HTTP Cookie File\n" +
  `.youtube.com\tTRUE\t/\tTRUE\t${FAR_FUTURE}\tSID\tsynthetic-audit-value\n` +
  `.youtube.com\tTRUE\t/\tTRUE\t${FAR_FUTURE}\t__Secure-3PSID\tsynthetic-audit-value\n` +
  `.youtube.com\tTRUE\t/\tFALSE\t${FAR_FUTURE}\tPREF\tf1=50000000\n`;

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** inode, size, mtime, sha256 — everything needed to prove a file survived. */
function fsSnapshot(file) {
  try {
    const st = fs.statSync(file);
    return {
      exists: true,
      ino: st.ino,
      size: st.size,
      mtimeMs: st.mtimeMs,
      sha256: st.isFile() ? sha256(file) : null,
      isFile: st.isFile(),
      head: st.isFile() && st.size < 4096 ? fs.readFileSync(file, "utf8").slice(0, 200) : null,
    };
  } catch (e) {
    return { exists: false, error: String(e.code || e.message) };
  }
}

function fsCompare(before, after) {
  return {
    before,
    after,
    stillExists: after.exists,
    sameInode: before.exists && after.exists ? before.ino === after.ino : null,
    sameBytes: before.exists && after.exists ? before.sha256 === after.sha256 : null,
    sizeChange: before.exists && after.exists ? after.size - before.size : null,
  };
}

async function launch(opts = {}) {
  const label = opts.label || "run";
  const outDir = opts.outDir || path.join(REPO, "audit", "run-1", "verify", "slice-2", "out", label);
  fs.mkdirSync(outDir, { recursive: true });
  const safeLabel = String(label).replace(/[^\w.-]+/g, "_");
  const userDataDir =
    opts.userDataDir || fs.mkdtempSync(path.join(os.tmpdir(), `v2-${safeLabel}-`));
  fs.mkdirSync(userDataDir, { recursive: true });

  if (opts.rawSettings != null) {
    fs.writeFileSync(path.join(userDataDir, "settings.json"), opts.rawSettings);
  } else if (opts.seed) {
    fs.writeFileSync(path.join(userDataDir, "settings.json"), JSON.stringify(opts.seed, null, 2));
  }
  if (opts.cookies !== false) {
    fs.writeFileSync(path.join(userDataDir, "yt-cookies.txt"), COOKIES_TXT);
  }

  const logs = { stdout: [], stderr: [], console: [], pageErrors: [] };
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [
      path.join(REPO, "electron", "main.cjs"),
      `--user-data-dir=${userDataDir}`,
      "--no-sandbox",
      "--disable-gpu",
    ],
    cwd: opts.cwd || REPO,
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
      if (url.includes("127.0.0.1") || url.includes("localhost:8080")) {
        win = w;
        break;
      }
    }
    if (!win) await new Promise((r) => setTimeout(r, 200));
  }
  if (!win) {
    await app.close().catch(() => {});
    throw new Error("main window never appeared\n" + logs.stderr.join(""));
  }
  win.on("console", (m) => logs.console.push(`[${m.type()}] ${m.text()}`));
  win.on("pageerror", (e) => logs.pageErrors.push(String(e)));
  await win.waitForLoadState("domcontentloaded");
  await win.waitForSelector("header", { timeout: 30000 });

  let n = 0;
  const shot = async (name) => {
    const f = path.join(outDir, `${String(++n).padStart(2, "0")}-${name}.png`);
    await win.screenshot({ path: f }).catch(() => {});
    return f;
  };
  const readState = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(userDataDir, "settings.json"), "utf8"));
    } catch {
      return null;
    }
  };
  const rawState = () => {
    try {
      return fs.readFileSync(path.join(userDataDir, "settings.json"), "utf8");
    } catch {
      return null;
    }
  };
  const close = async () => {
    try {
      fs.writeFileSync(path.join(outDir, "logs.json"), JSON.stringify(logs, null, 2));
    } catch {}
    await app.close().catch(() => {});
  };
  return { app, win, userDataDir, outDir, logs, shot, readState, rawState, close };
}

/** Every message the user can see: alerts, statuses and the saved toast. */
async function visibleMessages(win) {
  return win.evaluate(() =>
    Array.from(document.querySelectorAll('[role="alert"],[role="status"]'))
      .map((n) => (n.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );
}

/** Loads the video and waits for the mark fields to come alive. */
async function loadVideo(win, url) {
  await win.waitForSelector('input[type="url"]', { timeout: 90000 });
  await win.fill('input[type="url"]', url);
  await win.press('input[type="url"]', "Enter");
  await win.waitForFunction(() => !document.querySelector("#ui-mark-in")?.disabled, null, {
    timeout: 40000,
  });
  // The app clamps the out point once `info` lands, which can land after a
  // fill and wipe it; settle first, then write the marks.
  await win.waitForTimeout(1200);
}

/**
 * Writes the in/out marks and makes sure they stuck (the clamp effect can
 * overwrite a fill that lands too early). Returns the values that are in the
 * fields when it gives up.
 */
async function mark(win, inTc, outTc) {
  for (let i = 0; i < 5; i++) {
    await win.fill("#ui-mark-out", outTc);
    await win.fill("#ui-mark-in", inTc);
    await win.waitForTimeout(400);
    const v = await win.evaluate(() => ({
      inV: document.querySelector("#ui-mark-in")?.value,
      outV: document.querySelector("#ui-mark-out")?.value,
    }));
    if (v.inV === inTc && v.outV === outTc) return v;
  }
  return win.evaluate(() => ({
    inV: document.querySelector("#ui-mark-in")?.value,
    outV: document.querySelector("#ui-mark-out")?.value,
  }));
}

/** Loads a video, marks one range, adds it, cuts, waits for the saved toast. */
async function cutOne(win, { url, inTc, outTc, waitMs = 90000, skipLoad = false }) {
  if (!skipLoad) await loadVideo(win, url);
  await mark(win, inTc, outTc);
  await win.click("#ui-add-segment");
  await win.click("#ui-cut");
  const sawToast = await win
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[role="status"],[role="alert"]')).some((n) =>
          /Clip saved|Error|could not|failed|no such file/i.test(n.textContent || ""),
        ),
      null,
      { timeout: waitMs },
    )
    .then(() => true)
    .catch(() => false);
  return sawToast;
}

/** Screenshot + DOM dump, so a driver failure is diagnosable rather than a mystery. */
async function describeScreen(a, name) {
  const info = {};
  try {
    info.url = a.win.url();
    info.body = (await a.win.evaluate(() => document.body.innerText)).slice(0, 1200);
    info.urlInputs = await a.win.evaluate(() => document.querySelectorAll('input[type="url"]').length);
    info.modalOpen = await a.win.evaluate(
      () => !!document.querySelector('[role="dialog"]') ||
        /Connect YouTube|Sign in to YouTube/i.test(document.body.innerText),
    );
    info.shot = await a.shot(name);
  } catch (e) {
    info.error = String(e).slice(0, 300);
  }
  return info;
}

/** Waits for a file to appear, so pacing does not depend on a toast. */
function waitForFile(file, ms = 120000) {
  const deadline = Date.now() + ms;
  return new Promise((resolve) => {
    const tick = () => {
      if (fs.existsSync(file)) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(tick, 400);
    };
    tick();
  });
}

/** Closes the sticky "Clip saved" toast if it is up. */
async function dismissToast(win) {
  await win
    .evaluate(() => {
      const b = document.querySelector('button[aria-label="Dismiss"]');
      if (b) b.click();
    })
    .catch(() => {});
  await win.waitForTimeout(300);
}

module.exports = {
  REPO,
  COOKIES_TXT,
  launch,
  describeScreen,
  waitForFile,
  dismissToast,
  fsSnapshot,
  fsCompare,
  visibleMessages,
  loadVideo,
  mark,
  cutOne,
};
