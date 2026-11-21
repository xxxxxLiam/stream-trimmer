/**
 * File: lib.cjs
 * Path: audit/run-2/area-B/lib.cjs
 * Description: Area-B (run 2) shared harness. Audit-only; changes no product code.
 *
 *   Differs from audit/harness/app.cjs in exactly one way: the Electron app it
 *   launches is taken from a TREE root passed in, not hard-wired to the repo.
 *   Run 2 needs that because the only honest way to settle C-1 and B-2 is a
 *   negative control: the same script driven against a build of the PRE-FIX
 *   commit (26ea7ab, "docs(audit): run 1 report and action plan") and against the real
 *   tree at HEAD. Everything else (fresh --user-data-dir per launch, the app's
 *   own free port, seeding settings.json, screenshots, logs) is the harness's.
 *
 *   Trees are built once by prep.sh into the scratchpad:
 *     wtB    = HEAD                     (the real tree)
 *     wtRev0 = 26ea7ab                  (run-1 code, before any fix)
 *     wtRev1 = HEAD + ONLY the C-1 call site reverted
 *              (ClipsColumn: seg.setBanked(planned) -> setBankedRanges(planned))
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const SP = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";
const AREA = __dirname;
const OUT = path.join(AREA, "out");
const TREES = { head: path.join(SP, "wtB"), rev0: path.join(SP, "wtRev0"), rev1: path.join(SP, "wtRev1") };

/** A cookies.txt with a far-future __Secure-3PSID: electron/cookieState.cjs calls this connected. */
function cookieText(expiry = Math.floor(Date.now() / 1000) + 400 * 86400) {
  return [
    "# Netscape HTTP Cookie File",
    `.youtube.com\tTRUE\t/\tTRUE\t${expiry}\t__Secure-3PSID\tsynthetic-audit-value`,
    `.youtube.com\tTRUE\t/\tTRUE\t${expiry}\tSID\tsynthetic-audit-value`,
    "",
  ].join("\n");
}

async function launch({ tree, label, cwd, seed, outDir, timeout = 60000, env }) {
  const dir = outDir || path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `b2-${label}-`));
  if (seed) fs.writeFileSync(path.join(userDataDir, "settings.json"), JSON.stringify(seed, null, 2));

  const logs = { stdout: [], stderr: [], console: [], pageErrors: [] };
  const app = await electron.launch({
    executablePath: path.join("/home/user/stream-trimmer", "node_modules", "electron", "dist", "electron"),
    args: [path.join(tree, "electron", "main.cjs"), `--user-data-dir=${userDataDir}`, "--no-sandbox", "--disable-gpu"],
    cwd: cwd || tree,
    env: { ...process.env, ...(env || {}) },
  });
  app.process().stdout.on("data", (d) => logs.stdout.push(String(d)));
  app.process().stderr.on("data", (d) => logs.stderr.push(String(d)));

  const deadline = Date.now() + timeout;
  let win = null;
  while (!win && Date.now() < deadline) {
    for (const w of app.windows()) {
      let u = "";
      try { u = w.url(); } catch { continue; }
      if (u.includes("127.0.0.1") || u.includes("localhost:8080")) { win = w; break; }
    }
    if (!win) await new Promise((r) => setTimeout(r, 250));
  }
  if (!win) {
    await app.close().catch(() => {});
    throw new Error(`main window never appeared\nstderr:\n${logs.stderr.join("")}`);
  }
  win.on("console", (m) => logs.console.push(`[${m.type()}] ${m.text()}`));
  win.on("pageerror", (e) => logs.pageErrors.push(String(e)));
  await win.waitForLoadState("domcontentloaded");

  let n = 0;
  const shot = async (name) => {
    const f = path.join(dir, `${String(++n).padStart(2, "0")}-${name}.png`);
    await win.screenshot({ path: f }).catch(() => {});
    return f;
  };
  const readState = () => {
    try { return JSON.parse(fs.readFileSync(path.join(userDataDir, "settings.json"), "utf8")); } catch { return {}; }
  };
  const close = async () => {
    fs.writeFileSync(path.join(dir, "logs.json"), JSON.stringify(logs, null, 2));
    await app.close().catch(() => {});
  };
  return { app, win, userDataDir, outDir: dir, logs, shot, readState, close, tree };
}

/**
 * Launch + get past the sign-in gate + wait for the workspace.
 * @param {object} o
 * @param {"head"|"rev0"|"rev1"} [o.tree]
 */
async function boot(o) {
  const tree = TREES[o.tree || "head"];
  if (!fs.existsSync(path.join(tree, "dist", "index.html"))) throw new Error(`tree not built: ${tree}`);
  const seed = { "clipper.dataDirConfirmed": true, ...(o.seed || {}) };
  const a = await launch({ tree, label: o.label, cwd: o.stub, seed, outDir: o.outDir });
  if (!o.signedOut) {
    fs.writeFileSync(path.join(a.userDataDir, "yt-cookies.txt"), cookieText());
    await a.win.reload();
    await a.win.waitForLoadState("domcontentloaded");
  }
  if (o.viewport) await a.win.setViewportSize(o.viewport);
  await a.win.waitForFunction(() => document.querySelectorAll("#ui-mark-in").length > 0, null, { timeout: 40000 });
  // The connect / "Checking your sign-in…" overlay sits over the workspace. If the
  // cookie route did not satisfy it, use the product's own escape hatch.
  await a.win
    .waitForFunction(() => !document.querySelector("div.fixed.inset-0.z-50"), null, { timeout: 20000 })
    .catch(async () => {
      const b = a.win.locator('button:has-text("Continue without signing in")');
      if (await b.count()) await b.first().click().catch(() => {});
      await a.win
        .waitForFunction(() => !document.querySelector("div.fixed.inset-0.z-50"), null, { timeout: 15000 })
        .catch(() => {});
    });
  return a;
}

function stubRoot(dir) {
  return {
    dir,
    write(patch) {
      const f = path.join(dir, "stub.json");
      fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, "utf8")), ...patch }, null, 2));
    },
    read() { return JSON.parse(fs.readFileSync(path.join(dir, "stub.json"), "utf8")); },
    calls() {
      try {
        return fs.readFileSync(path.join(dir, "calls.log"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      } catch { return []; }
    },
    clearCalls() { try { fs.rmSync(path.join(dir, "calls.log")); } catch {} },
  };
}

// ---- reading the UI ------------------------------------------------------------------

const S = {
  wsTabs: 'div[role="tab"]',
  newTab: 'button[aria-label="New tab"]',
  markIn: "#ui-mark-in:visible",
  markOut: "#ui-mark-out:visible",
  add: "#ui-add-segment:visible",
  cut: "#ui-cut:visible",
  urlInput: 'input[type="url"]:visible',
};

const PANE_JS = `(() => {
  const visible = Array.from(document.querySelectorAll('#ui-mark-in'))
    .find((el) => el.offsetParent !== null || el.getClientRects().length > 0);
  if (!visible) return null;
  const pane = visible.closest('div.absolute.inset-0') || document.body;
  const txt = (sel) => { const e = pane.querySelector(sel); return e ? (e.innerText || e.textContent || '').replace(/\\s+/g,' ').trim() : null; };
  return {
    rows: Array.from(pane.querySelectorAll('ol[aria-label^="Segments"] > li')).map((li) => li.innerText.replace(/\\s+/g,' ').trim()),
    total: txt('#ui-stitched-total'),
    source: txt('#ui-source-chip'),
    markIn: pane.querySelector('#ui-mark-in')?.value ?? null,
    markOut: pane.querySelector('#ui-mark-out')?.value ?? null,
    timelineSegments: pane.querySelectorAll('[aria-label^="Segment "]').length,
    banked: pane.querySelectorAll('[aria-label^="Planned"], [title^="Planned"]').length,
    status: txt('#ui-col-centre [role=status]'),
    alert: txt('#ui-col-centre [role=alert]'),
    cutDisabled: pane.querySelector('#ui-cut')?.disabled ?? null,
    addDisabled: pane.querySelector('#ui-add-segment')?.disabled ?? null,
    cancelVisible: Array.from(pane.querySelectorAll('button')).some((b) => b.innerText.trim() === 'Cancel'),
  };
})()`;

const ALL_PANES_JS = `(() => Array.from(document.querySelectorAll('#ui-mark-in')).map((el, i) => {
  const pane = el.closest('div.absolute.inset-0');
  return {
    i,
    shown: el.offsetParent !== null || el.getClientRects().length > 0,
    source: pane?.querySelector('#ui-source-chip')?.innerText.replace(/\\s+/g,' ').trim() ?? null,
    total: pane?.querySelector('#ui-stitched-total')?.innerText.trim() ?? null,
    rows: Array.from(pane?.querySelectorAll('ol[aria-label^="Segments"] > li') ?? []).map((li) => li.innerText.replace(/\\s+/g,' ').trim()),
  };
}))()`;

const live = (a) => a.win.evaluate(PANE_JS);
const allPanes = (a) => a.win.evaluate(ALL_PANES_JS);

/** Is the app still rendering anything at all? React #185 / a thrown render leaves #root empty. */
async function alive(a) {
  return a.win.evaluate(() => ({
    rootChildren: document.querySelector("#root")?.children.length ?? -1,
    header: !!document.querySelector("header"),
    bodyLen: (document.body.innerText || "").trim().length,
    marks: document.querySelectorAll("#ui-mark-in").length,
  })).catch((e) => ({ error: String(e) }));
}

function reactErrors(a) {
  return [...a.logs.console, ...a.logs.pageErrors].filter((l) => /React error|Maximum update depth|Minified React/i.test(l));
}

async function loadLive(a, url, waitMs = 2500) {
  if (!(await a.win.locator(S.urlInput).count())) {
    await a.win.locator("#ui-source-chip button:has-text('Change')").locator("visible=true").first().click();
  }
  const input = a.win.locator(S.urlInput).first();
  await input.click();
  await input.fill("");
  await input.fill(url);
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(waitMs);
}

async function markLive(a, i, o) {
  await a.win.fill(S.markIn, i);
  await a.win.fill(S.markOut, o);
}

// ---- seeds ---------------------------------------------------------------------------

function campaign(id, name, over = {}) {
  return {
    id, name,
    targetMinSec: 1, targetMaxSec: 600, hardMaxSec: 900,
    clipIdPattern: "{prefix}-{videoId}-{nn}",
    prefix: name.slice(0, 2).toUpperCase(),
    format: "mp4", quality: "best",
    clipsDir: `/tmp/clips-${id}`, dataDir: `/tmp/data-${id}`,
    usedRanges: {},
    ...over,
  };
}
function bankClip(id, start, end, over = {}) {
  return { id, label: `${id} label`, segments: [{ start, end }], status: "banked", ...over };
}

// ---- media ---------------------------------------------------------------------------

/** Real duration in seconds, by decoding (not container metadata). */
function duration(file) {
  const { spawnSync } = require("node:child_process");
  const r = spawnSync("/usr/bin/ffmpeg", ["-hide_banner", "-i", file, "-f", "null", "-"], { encoding: "utf8" });
  const all = `${r.stderr || ""}${r.stdout || ""}`;
  const m = [...all.matchAll(/time=(\d+):(\d+):(\d+\.\d+)/g)].pop();
  const hdr = all.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  return {
    seconds: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null,
    header: hdr ? Number(hdr[1]) * 3600 + Number(hdr[2]) * 60 + Number(hdr[3]) : null,
  };
}

module.exports = {
  boot, launch, stubRoot, cookieText, live, allPanes, alive, reactErrors,
  loadLive, markLive, campaign, bankClip, duration, S, OUT, AREA, SP, TREES,
};
