/**
 * File: lib.cjs
 * Path: audit/run-2/area-B/lib.cjs
 * Description: Run-2 area-B harness. Same idea as run 1's boot.cjs/live.cjs, with two
 *   additions this run needs:
 *
 *   1. `root` — which app tree to launch. Run 2's highest-value job is a negative control,
 *      so the same script must be runnable against the live tree AND against scratch builds
 *      with a fix reverted. The harness's own app.cjs hard-codes the repo, so this file
 *      launches electron/main.cjs from whichever root it is given (the scratch copies get
 *      their own dist/ and electron/dist/server.cjs; node_modules is symlinked).
 *   2. `crashState()` — the fixed tree now has a top-level ErrorBoundary (T3/F-10), so a
 *      render throw no longer blanks #root; it paints "Something went wrong". A crash check
 *      that only looks for an empty #root would call that a pass. crashState() reports
 *      blank root, the boundary fallback, React errors in the console, and a renderer that
 *      has stopped answering at all.
 *
 *   Audit-only. No product code is touched.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const LIVE = "/home/user/stream-trimmer";
const AREA = __dirname;
const OUT = path.join(AREA, "out");

/** A cookies.txt with a far-future __Secure-3PSID: electron/cookieState.cjs calls this connected. */
function cookieText(expiry = Math.floor(Date.now() / 1000) + 400 * 86400) {
  return [
    "# Netscape HTTP Cookie File",
    `.youtube.com\tTRUE\t/\tTRUE\t${expiry}\t__Secure-3PSID\tsynthetic-audit-value`,
    `.youtube.com\tTRUE\t/\tTRUE\t${expiry}\tSID\tsynthetic-audit-value`,
    "",
  ].join("\n");
}

function stubRoot(dir) {
  return {
    dir,
    write(patch) {
      const file = path.join(dir, "stub.json");
      const cur = JSON.parse(fs.readFileSync(file, "utf8"));
      fs.writeFileSync(file, JSON.stringify({ ...cur, ...patch }, null, 2));
    },
    read() {
      return JSON.parse(fs.readFileSync(path.join(dir, "stub.json"), "utf8"));
    },
    calls() {
      try {
        return fs
          .readFileSync(path.join(dir, "calls.log"), "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l));
      } catch {
        return [];
      }
    },
    clearCalls() {
      try {
        fs.rmSync(path.join(dir, "calls.log"));
      } catch {}
    },
  };
}

/**
 * Launch one app tree.
 * @param {object} o
 * @param {string} o.label
 * @param {string} o.stub            stub root, becomes the app's cwd
 * @param {string} [o.root]          app tree to launch (default: the live repo)
 * @param {object} [o.seed]          settings.json to boot with
 * @param {{width:number,height:number}} [o.viewport]
 * @param {boolean} [o.signedOut]
 */
async function boot(o) {
  const root = o.root || LIVE;
  const outDir = o.outDir || path.join(OUT, o.label);
  fs.mkdirSync(outDir, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `b2-${o.label}-`));
  const seed = { "clipper.dataDirConfirmed": true, ...(o.seed || {}) };
  fs.writeFileSync(path.join(userDataDir, "settings.json"), JSON.stringify(seed, null, 2));

  const logs = { stdout: [], stderr: [], console: [], pageErrors: [] };
  const app = await electron.launch({
    executablePath: path.join(LIVE, "node_modules", "electron", "dist", "electron"),
    args: [
      path.join(root, "electron", "main.cjs"),
      `--user-data-dir=${userDataDir}`,
      "--no-sandbox",
      "--disable-gpu",
    ],
    cwd: o.stub,
    env: { ...process.env },
  });
  app.process().stdout.on("data", (d) => logs.stdout.push(String(d)));
  app.process().stderr.on("data", (d) => logs.stderr.push(String(d)));

  const deadline = Date.now() + (o.timeout || 60000);
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
    throw new Error(`main window never appeared. stderr:\n${logs.stderr.join("")}`);
  }
  win.on("console", (m) => logs.console.push(`[${m.type()}] ${m.text()}`));
  win.on("pageerror", (e) => logs.pageErrors.push(String(e)));
  await win.waitForLoadState("domcontentloaded");

  if (!o.signedOut) {
    fs.writeFileSync(path.join(userDataDir, "yt-cookies.txt"), cookieText());
    await win.reload();
    await win.waitForLoadState("domcontentloaded");
  }
  if (o.viewport) await win.setViewportSize(o.viewport);

  let shotN = 0;
  const shot = async (name) => {
    const file = path.join(outDir, `${String(++shotN).padStart(2, "0")}-${name}.png`);
    await win.screenshot({ path: file }).catch(() => {});
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

  const a = { app, win, userDataDir, outDir, logs, shot, readState, close, root };

  // Past the sign-in gate: either the cookie satisfied it, or use the product's own
  // "Continue without signing in" button rather than suppressing UI.
  await win
    .waitForFunction(() => document.querySelectorAll("#ui-mark-in").length > 0, null, {
      timeout: 30000,
    })
    .catch(() => {});
  const gate = await win.evaluate(() => Boolean(document.querySelector("div.fixed.inset-0.z-50")));
  if (gate) {
    const btn = win.locator("button", { hasText: /Continue without signing in/i }).first();
    if (await btn.count()) await btn.click().catch(() => {});
  }
  await win
    .waitForFunction(() => !document.querySelector("div.fixed.inset-0.z-50"), null, { timeout: 45000 })
    .catch(() => {});
  return a;
}

/**
 * Is the app still drawing? Covers the three shapes a crash takes in this tree:
 * an empty #root (no boundary), the ErrorBoundary fallback (boundary caught it),
 * and a renderer that no longer answers (update loop still spinning).
 */
async function crashState(a, { timeoutMs = 6000 } = {}) {
  const probe = a.win
    .evaluate(() => {
      const root = document.getElementById("root");
      const boundary = document.querySelector("#ui-error-retry");
      const text = document.body.innerText || "";
      return {
        rootChildren: root ? root.children.length : -1,
        bodyLen: text.length,
        boundary: Boolean(boundary),
        boundaryMessage: boundary
          ? (document.querySelector('[role="alert"] pre')?.innerText || "").slice(0, 300)
          : null,
        panes: document.querySelectorAll("#ui-mark-in").length,
      };
    })
    .then((v) => ({ ...v, answering: true }));
  const timeout = new Promise((r) =>
    setTimeout(() => r({ answering: false, rootChildren: null, bodyLen: null, boundary: null, panes: null }), timeoutMs),
  );
  const dom = await Promise.race([probe, timeout]).catch(() => ({ answering: false, error: true }));
  const reactErrors = a.logs.console
    .concat(a.logs.pageErrors)
    .filter((l) => /Minified React error|Maximum update depth|error #185|#185/.test(l));
  const crashed =
    dom.answering === false ||
    dom.rootChildren === 0 ||
    dom.boundary === true ||
    reactErrors.length > 0;
  return { ...dom, reactErrors: reactErrors.slice(0, 4), reactErrorCount: reactErrors.length, crashed };
}

const PANE_JS = `(() => {
  const visible = Array.from(document.querySelectorAll('#ui-mark-in'))
    .find((el) => el.offsetParent !== null || el.getClientRects().length > 0);
  if (!visible) return null;
  const pane = visible.closest('div.absolute.inset-0') || document.body;
  const txt = (sel) => {
    const e = pane.querySelector(sel);
    return e ? (e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim() : null;
  };
  return {
    rows: Array.from(pane.querySelectorAll('ol[aria-label^="Segments"] > li')).map((li) => li.innerText.replace(/\\s+/g, ' ').trim()),
    total: txt('#ui-stitched-total'),
    source: txt('#ui-source-chip'),
    markIn: pane.querySelector('#ui-mark-in')?.value ?? null,
    markOut: pane.querySelector('#ui-mark-out')?.value ?? null,
    timelineSegments: pane.querySelectorAll('[aria-label^="Segment "]').length,
    bankedOnTimeline: pane.querySelectorAll('[title^="Banked"]').length,
    bankRows: pane.querySelectorAll('#clips-tab-bank, [id^="clips-tab-"]').length,
    status: txt('#ui-col-centre [role=status]'),
    alert: txt('#ui-col-centre [role=alert]'),
    transcriptHeader: txt('#ui-col-transcript header span[aria-live="polite"]'),
    transcriptRows: pane.querySelectorAll('[data-line]').length,
    cutDisabled: pane.querySelector('#ui-cut')?.disabled ?? null,
    addDisabled: pane.querySelector('#ui-add-segment')?.disabled ?? null,
    cancelVisible: Array.from(pane.querySelectorAll('button')).some((b) => b.innerText.trim() === 'Cancel'),
  };
})()`;

async function live(a) {
  return a.win.evaluate(PANE_JS).catch((e) => ({ error: String(e).slice(0, 120) }));
}

async function allPanes(a) {
  return a.win
    .evaluate(`(() => Array.from(document.querySelectorAll('#ui-mark-in')).map((el, i) => {
    const pane = el.closest('div.absolute.inset-0');
    const shown = el.offsetParent !== null || el.getClientRects().length > 0;
    return {
      i,
      shown,
      source: pane?.querySelector('#ui-source-chip')?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
      total: pane?.querySelector('#ui-stitched-total')?.innerText.trim() ?? null,
      rows: Array.from(pane?.querySelectorAll('ol[aria-label^="Segments"] > li') ?? []).map((li) => li.innerText.replace(/\\s+/g, ' ').trim()),
    };
  }))()`)
    .catch((e) => ({ error: String(e).slice(0, 120) }));
}

const S = {
  wsTabs: 'div[role="tab"]',
  newTab: 'button[aria-label="New tab"]',
  markIn: "#ui-mark-in:visible",
  markOut: "#ui-mark-out:visible",
  add: "#ui-add-segment:visible",
  cut: "#ui-cut:visible",
  urlInput: 'input[type="url"]:visible',
};

async function loadLive(a, url, waitMs = 2400) {
  if (!(await a.win.locator(S.urlInput).count())) {
    await a.win
      .locator("#ui-source-chip button:has-text('Change')")
      .locator("visible=true")
      .first()
      .click()
      .catch(() => {});
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

/** A campaign + a bank row that is still PLANNED (status "banked") for `videoId`. */
function seedBank({ videoId, campaignId = "auditc", rows } = {}) {
  const segs = rows || [{ id: "A01", label: "hook", segments: [{ start: 60, end: 90 }], status: "banked" }];
  return {
    "clipper.campaigns": [
      {
        id: campaignId,
        name: "Audit campaign",
        targetMinSec: 20,
        targetMaxSec: 60,
        hardMaxSec: 120,
        clipIdPattern: "{prefix}-{videoId}-{nn}",
        prefix: "C",
        format: "mp4",
        quality: "best",
        clipsDir: "",
        dataDir: "",
        usedRanges: {},
      },
    ],
    "clipper.activeCampaign": campaignId,
    "clipper.bank": { [campaignId]: { [videoId]: segs } },
  };
}

function ffDuration(file) {
  const { spawnSync } = require("node:child_process");
  const ff = path.join(LIVE, "resources", "bin", "ffmpeg");
  const r = spawnSync(ff, ["-hide_banner", "-i", file, "-f", "null", "-"], { encoding: "utf8" });
  const all = `${r.stderr || ""}${r.stdout || ""}`;
  const m = [...all.matchAll(/time=(\d+):(\d+):(\d+\.\d+)/g)].pop();
  const hdr = all.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const header = hdr ? Number(hdr[1]) * 3600 + Number(hdr[2]) * 60 + Number(hdr[3]) : null;
  const frames = (all.match(/frame=\s*(\d+)/g) || []).pop();
  return {
    seconds: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null,
    header,
    frames: frames ? Number(frames.replace(/\D/g, "")) : null,
    raw: all.slice(-800),
  };
}

module.exports = {
  boot,
  crashState,
  live,
  allPanes,
  loadLive,
  markLive,
  seedBank,
  stubRoot,
  cookieText,
  ffDuration,
  S,
  OUT,
  AREA,
  LIVE,
};
