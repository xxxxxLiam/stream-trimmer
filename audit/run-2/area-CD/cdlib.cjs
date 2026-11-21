/**
 * File: cdlib.cjs
 * Path: audit/run-2/area-CD/cdlib.cjs
 * Description: Run-2 area C/D harness. Audit-only; imports no product file for
 *   writing and changes no product code.
 *
 * Written for this run rather than reused from run 1, so the evidence does not
 * inherit run 1's stub or its assumptions. Differences from
 * audit/harness/app.cjs that this area needs:
 *   - its own yt-dlp stub, which (a) answers the --simulate auth probe with
 *     yt-dlp's own "Found YouTube account cookies" marker, (b) writes a REAL
 *     WebVTT when asked for subtitles (so D-3 can be checked against a real
 *     transcript rather than the stub's empty one), and (c) cuts the fixture
 *     with real ffmpeg when --download-sections is passed, so a saved clip is
 *     the length the user asked for.
 *   - a synthetic Netscape cookies.txt in the fresh user-data dir, so the
 *     sign-in gate is passed by the product's own cookie path with nothing
 *     hidden in the DOM. The "Continue without signing in (360p)" button is
 *     clicked as a fallback if the gate is still up.
 *   - fsSnap/fsDiff: inode + size + mtime + sha256, because "Clip saved" is a
 *     UI fact and never evidence that bytes survived.
 *
 * Harness traps honoured (audit/run-2/BRIEF.md): fresh --user-data-dir per
 * launch, the stub root is always an explicit directory (never the repo's
 * resources/bin), and suites are run one at a time.
 */
const { _electron: electron } = require("playwright");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO = "/home/user/stream-trimmer";
const ELECTRON_BIN = path.join(REPO, "node_modules", "electron", "dist", "electron");
const FIXTURE = path.join(REPO, "audit", "fixtures", "fixture.mp4");
const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/run2CD";
const DTD = path.join(SCRATCH, "FCPXMLv1_10.dtd");

const FAR = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
const COOKIES_TXT =
  "# Netscape HTTP Cookie File\n" +
  `.youtube.com\tTRUE\t/\tTRUE\t${FAR}\tSID\tsynthetic-run2-value\n` +
  `.youtube.com\tTRUE\t/\tTRUE\t${FAR}\t__Secure-3PSID\tsynthetic-run2-value\n` +
  `.youtube.com\tTRUE\t/\tFALSE\t${FAR}\tPREF\tf1=50000000\n`;

// ---------------------------------------------------------------- filesystem

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function fsSnap(file) {
  try {
    const st = fs.lstatSync(file);
    return {
      exists: true,
      ino: st.ino,
      size: st.size,
      mtimeMs: st.mtimeMs,
      isFile: st.isFile(),
      isDir: st.isDirectory(),
      isLink: st.isSymbolicLink(),
      sha256: st.isFile() ? sha256(file) : null,
      head: st.isFile() && st.size < 8192 ? fs.readFileSync(file, "utf8").slice(0, 300) : null,
    };
  } catch (e) {
    return { exists: false, error: String(e.code || e.message) };
  }
}

function fsDiff(before, after) {
  return {
    before,
    after,
    stillExists: after.exists,
    sameInode: before.exists && after.exists ? before.ino === after.ino : null,
    sameSize: before.exists && after.exists ? before.size === after.size : null,
    sameBytes: before.exists && after.exists ? before.sha256 === after.sha256 : null,
  };
}

/** Every path under root, relative, sorted. */
function treeOf(root) {
  const out = [];
  const walk = (dir, rel) => {
    let items = [];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      const r = rel ? `${rel}/${it.name}` : it.name;
      out.push(it.isDirectory() ? `${r}/` : r);
      if (it.isDirectory() && !it.isSymbolicLink()) walk(path.join(dir, it.name), r);
    }
  };
  walk(root, "");
  return out.sort();
}

// --------------------------------------------------------------- yt-dlp stub

/**
 * Builds a stub root at `root` (NEVER the repo: make-stub-root.cjs with no
 * argument overwrites resources/bin/yt-dlp). cfg is written to stub.json and
 * can be rewritten between calls with writeCfg().
 */
function makeStubRoot(root, cfg = {}) {
  const bin = path.join(root, "resources", "bin");
  fs.mkdirSync(bin, { recursive: true });
  for (const name of ["ffmpeg", "deno"]) {
    const real = path.join(REPO, "resources", "bin", name);
    const link = path.join(bin, name);
    if (fs.existsSync(real) && !fs.existsSync(link)) fs.symlinkSync(real, link);
  }
  fs.copyFileSync(FIXTURE, path.join(root, "fixture.mp4"));
  writeCfg(root, cfg);

  const stub = `#!/usr/bin/env node
// Audit stub for yt-dlp. Offline; YouTube is unreachable in this container.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ROOT = path.join(__dirname, "..", "..");
const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "stub.json"), "utf8")); } catch { return {}; } })();
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const pre = (p) => argv.some((a) => String(a).startsWith(p));
const valOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
try { fs.appendFileSync(path.join(ROOT, "argv.log"), JSON.stringify({ t: Date.now(), argv }) + "\\n"); } catch {}

const info = Object.assign({ id: "stub0000001", title: "Stub video", duration: 3600, uploader: "Stub channel" }, cfg.info || {});

function sections() {
  // "*1.5-8.25" -> {start, end}
  for (const a of argv) {
    const m = /^\\*([0-9.]+)-([0-9.]+)$/.exec(String(a));
    if (m) return { start: Number(m[1]), end: Number(m[2]) };
  }
  return null;
}

async function main() {
  if (has("--version")) { process.stdout.write("2099.12.31\\n"); return; }
  if (cfg.delayMs) await new Promise((r) => setTimeout(r, cfg.delayMs));

  // The auth probe: --simulate with cookies-from-browser. yt-dlp prints this
  // marker, which server/youtubeAuth.ts keys on.
  if (has("--simulate") || has("-s")) {
    if (cfg.authFails) { process.stderr.write("ERROR: could not find cookies\\n"); process.exit(1); }
    process.stdout.write("Extracting cookies from chrome\\nFound YouTube account cookies\\n");
    return;
  }

  // Subtitles: write a real WebVTT where the server asked for it.
  if (has("--write-auto-subs") || has("--write-subs") || has("--skip-download")) {
    const out = valOf("-o") || valOf("--output");
    if (out && cfg.noSubs !== true) {
      const cues = cfg.cues || [
        [0, 4, "Welcome back to the show everyone"],
        [4, 8, "today we are talking about the apology"],
        [8, 12, "and what it means for the campaign"],
        [12, 16, "I think the payoff lands right here"],
        [16, 20, "that is the laugh I was waiting for"],
        [20, 24, "and then we move on to the next thing"],
      ];
      const tc = (s) => {
        const hh = String(Math.floor(s / 3600)).padStart(2, "0");
        const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
        const ss = String(Math.floor(s % 60)).padStart(2, "0");
        return hh + ":" + mm + ":" + ss + ".000";
      };
      let vtt = "WEBVTT\\n\\n";
      cues.forEach((c, i) => { vtt += (i + 1) + "\\n" + tc(c[0]) + " --> " + tc(c[1]) + "\\n" + c[2] + "\\n\\n"; });
      try { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out + ".en.vtt", vtt); } catch (e) { process.stderr.write("stub: " + e.message + "\\n"); }
    }
    if (!has("-J") && !has("--dump-json") && !has("--dump-single-json")) return;
  }

  if (has("-J") || has("--dump-json") || has("--dump-single-json")) {
    if (cfg.failJson) { process.stderr.write((cfg.stderr || "ERROR: probe failed") + "\\n"); process.exit(1); }
    process.stdout.write(JSON.stringify(Object.assign({
      _type: "video", webpage_url: "https://www.youtube.com/watch?v=" + info.id,
      formats: [
        { format_id: "18",  ext: "mp4", height: 360,  vcodec: "avc1", acodec: "mp4a" },
        { format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none" },
        { format_id: "140", ext: "m4a", height: null, vcodec: "none", acodec: "mp4a" },
      ],
      subtitles: {}, automatic_captions: { en: [{ ext: "vtt", url: "http://127.0.0.1/none" }] }, comments: [],
    }, info)) + "\\n");
    return;
  }

  if (cfg.failDownload) { process.stderr.write((cfg.stderr || "ERROR: download failed") + "\\n"); process.exit(1); }
  for (const p of cfg.progress || [0, 50, 100]) {
    process.stdout.write("[download]  " + p + ".0% of 10.00MiB at 1.00MiB/s ETA 00:01\\n");
    await new Promise((r) => setTimeout(r, 20));
  }
  if (cfg.writeMedia !== false) {
    const out = valOf("-o") || valOf("--output");
    const fixture = path.join(ROOT, "fixture.mp4");
    if (out && fs.existsSync(fixture)) {
      const target = String(out).replace(/%\\(.*?\\)s/g, "stub");
      const sec = sections();
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (sec && cfg.realCut !== false) {
          // Real ffmpeg cut, so the saved clip is the length that was asked for.
          const ff = path.join(ROOT, "resources", "bin", "ffmpeg");
          execFileSync(ff, ["-hide_banner", "-loglevel", "error", "-y",
            "-ss", String(sec.start), "-to", String(sec.end), "-i", fixture,
            "-c", "copy", target], { stdio: "ignore" });
        } else {
          fs.copyFileSync(fixture, target);
        }
      } catch (e) { process.stderr.write("stub: " + e.message + "\\n"); try { fs.copyFileSync(fixture, target); } catch {} }
    }
  }
}
main().catch((e) => { process.stderr.write(String(e) + "\\n"); process.exit(1); });
`;
  const p = path.join(bin, "yt-dlp");
  fs.writeFileSync(p, stub);
  fs.chmodSync(p, 0o755);
  return root;
}

function writeCfg(root, cfg) {
  fs.writeFileSync(path.join(root, "stub.json"), JSON.stringify(cfg, null, 2));
}

// ------------------------------------------------------------------- launcher

let launchN = 0;

async function launch(opts = {}) {
  const label = opts.label || `run-${++launchN}`;
  const safe = String(label).replace(/[^\w.-]+/g, "_");
  const outDir = opts.outDir || path.join(REPO, "audit", "run-2", "area-CD", "out", safe);
  fs.mkdirSync(outDir, { recursive: true });
  const userDataDir = opts.userDataDir || fs.mkdtempSync(path.join(os.tmpdir(), `r2cd-${safe}-`));
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
    throw new Error("main window never appeared\n" + logs.stderr.join("").slice(-3000));
  }
  win.on("console", (m) => logs.console.push(`[${m.type()}] ${m.text()}`));
  win.on("pageerror", (e) => logs.pageErrors.push(String(e)));
  await win.waitForLoadState("domcontentloaded");
  await win.waitForSelector("header", { timeout: 40000 });

  let n = 0;
  const shot = async (name) => {
    const f = path.join(outDir, `${String(++n).padStart(2, "0")}-${name}.png`);
    await win.screenshot({ path: f }).catch(() => {});
    return f;
  };
  const state = () => {
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
  const a = { app, win, userDataDir, outDir, logs, shot, state, rawState, close };
  if (opts.passGate !== false) await passGate(a);
  return a;
}

/**
 * Gets past the sign-in gate using product UI only: the cookie file usually
 * means there is no gate; if there is, click the product's own
 * "Continue without signing in (360p)".
 */
async function passGate(a) {
  for (let i = 0; i < 12; i++) {
    const up = await a.win.evaluate(() =>
      /Sign in to YouTube|Connect YouTube|without signing in/i.test(document.body.innerText || ""),
    );
    if (!up) return "no gate";
    const clicked = await a.win.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((x) =>
        /without signing in/i.test(x.textContent || ""),
      );
      if (b) {
        b.click();
        return true;
      }
      return false;
    });
    await a.win.waitForTimeout(500);
    if (clicked) return "clicked continue";
  }
  return "gate still up";
}

// ------------------------------------------------------------------ UI driving

/** Every message the user can see. */
function messages(win) {
  return win.evaluate(() =>
    Array.from(document.querySelectorAll('[role="alert"],[role="status"]'))
      .map((n) => (n.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );
}

async function loadVideo(win, url = "https://www.youtube.com/watch?v=stub0000001") {
  // A stored workspace url auto-loads on boot and replaces the url field with
  // a "Change" button: nothing to type in that case.
  const already = await win
    .waitForFunction(() => !document.querySelector("#ui-mark-in")?.disabled, null, { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (already) {
    await win.waitForTimeout(800);
    return "already loaded";
  }
  await win.waitForSelector('input[type="url"]', { timeout: 90000 });
  await win.fill('input[type="url"]', url);
  await win.press('input[type="url"]', "Enter");
  await win.waitForFunction(() => !document.querySelector("#ui-mark-in")?.disabled, null, {
    timeout: 60000,
  });
  await win.waitForTimeout(1200);
}

async function mark(win, inTc, outTc) {
  for (let i = 0; i < 6; i++) {
    await win.fill("#ui-mark-out", outTc);
    await win.fill("#ui-mark-in", inTc);
    await win.waitForTimeout(350);
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

/** Marks one range, adds it, cuts, waits for a finishing message. */
async function cutOne(win, inTc, outTc, waitMs = 120000) {
  await mark(win, inTc, outTc);
  await win.click("#ui-add-segment");
  await win.waitForTimeout(200);
  // "Use it anyway" if the used-ranges overlap warning blocks the Cut button.
  await win.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      /use it anyway/i.test(x.textContent || ""),
    );
    if (b) b.click();
  });
  await win.waitForTimeout(200);
  await win.click("#ui-cut");
  const ok = await win
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[role="status"],[role="alert"]')).some((n) =>
          /Clip saved|Error|could not|failed|no such file|Unexpected/i.test(n.textContent || ""),
        ),
      null,
      { timeout: waitMs },
    )
    .then(() => true)
    .catch(() => false);
  await win.waitForTimeout(600);
  return ok;
}

async function dismissToast(win) {
  await win
    .evaluate(() => {
      document
        .querySelectorAll('button[aria-label="Dismiss"]')
        .forEach((b) => b.click());
    })
    .catch(() => {});
  await win.waitForTimeout(300);
}

function waitForFile(file, ms = 120000) {
  const deadline = Date.now() + ms;
  return new Promise((resolve) => {
    const tick = () => {
      if (fs.existsSync(file)) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(tick, 300);
    };
    tick();
  });
}

/** A seed campaign in today's (run-1) shape: a slug id. */
function slugCampaign(id, name, clipsDir, dataDir, extra = {}) {
  return {
    id,
    name,
    targetMinSec: 30,
    targetMaxSec: 60,
    hardMaxSec: 90,
    clipIdPattern: "{prefix}-{videoId}-{nn}",
    prefix: name.slice(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, "") || "C",
    format: "mp4",
    quality: "best",
    clipsDir,
    dataDir,
    usedRanges: {},
    ...extra,
  };
}

function bankRow(id, start, end, label, category, tier, status = "banked") {
  const r = { id, label, segments: [{ start, end }], status };
  if (category) r.category = category;
  if (tier) r.tier = tier;
  return r;
}

// ----------------------------------------------------------------- reporting

function mkLogger(file) {
  const lines = [];
  const say = (...parts) => {
    const s = parts
      .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
      .join(" ");
    lines.push(s);
    console.log(s);
  };
  const flush = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, lines.join("\n") + "\n");
  };
  return { say, flush, lines };
}

module.exports = {
  REPO,
  SCRATCH,
  DTD,
  FIXTURE,
  COOKIES_TXT,
  makeStubRoot,
  writeCfg,
  launch,
  passGate,
  messages,
  loadVideo,
  mark,
  cutOne,
  dismissToast,
  waitForFile,
  fsSnap,
  fsDiff,
  treeOf,
  slugCampaign,
  bankRow,
  mkLogger,
};
