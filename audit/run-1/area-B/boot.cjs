/**
 * File: boot.cjs
 * Path: audit/run-1/area-B/boot.cjs
 * Description: Area-B boot helper. Launches the real app through the harness,
 *   plants a synthetic Netscape cookies.txt so the app-wide YouTube connect
 *   modal (a hard, undismissable gate owned by area A) is satisfied, reloads,
 *   and waits for the clipping workspace. Also exposes small helpers used by
 *   every area-B script.
 *
 *   Audit-only. Nothing here changes product code.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");

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
 * @param {object} opts
 * @param {string} opts.label
 * @param {string} opts.stub   stub root dir (cwd for the app)
 * @param {object} [opts.seed] extra settings.json keys
 * @param {{width:number,height:number}} [opts.viewport]
 * @param {boolean} [opts.signedOut] skip planting cookies
 */
async function boot(opts) {
  const outDir = path.join(OUT, opts.label);
  const seed = {
    "clipper.dataDirConfirmed": true,
    ...(opts.seed || {}),
  };
  // Other audit helpers share this checkout and rebuild electron/dist/server.cjs
  // and dist/ while we run; a launch that lands inside that window dies with
  // "Bundled server missing". Retry rather than report it as a product defect.
  let a = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 6 && !a; attempt++) {
    try {
      a = await launchApp({ label: opts.label, outDir, cwd: opts.stub, seed });
    } catch (e) {
      lastErr = e;
      if (!/Bundled server missing|main window never appeared/.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  if (!a) throw lastErr;
  if (!opts.signedOut) {
    fs.writeFileSync(path.join(a.userDataDir, "yt-cookies.txt"), cookieText());
    await a.win.reload();
    await a.win.waitForLoadState("domcontentloaded");
  }
  if (opts.viewport) await a.win.setViewportSize(opts.viewport);
  // The connect modal is gone once the workspace's mark bar exists. Every tab
  // mounts its own copy of the pane (and its own #ui-mark-in), so count, not
  // visibility, is the signal here.
  await a.win.waitForFunction(
    () => document.querySelectorAll("#ui-mark-in").length > 0,
    null,
    { timeout: 30000 },
  );
  if (!opts.signedOut) {
    // The connect / "Checking your sign-in…" overlay sits over the workspace.
    await a.win.waitForFunction(
      () => !document.querySelector("div.fixed.inset-0.z-50"),
      null,
      { timeout: 45000 },
    );
  }
  return a;
}

/** Type a URL into the URL bar and wait for /api/info to land. */
async function loadUrl(a, url, { wait = true } = {}) {
  const input = a.win.locator('input[type="url"]');
  await input.click();
  await input.fill("");
  await input.fill(url);
  await a.win.keyboard.press("Enter");
  if (wait) {
    await a.win
      .waitForFunction(
        () => {
          const el = document.querySelector("#ui-mark-out");
          return el && !el.disabled;
        },
        null,
        { timeout: 20000 },
      )
      .catch(() => {});
  }
}

/** Mark a range by typing into the in/out fields. */
async function mark(a, inText, outText) {
  await a.win.fill("#ui-mark-in", inText);
  await a.win.fill("#ui-mark-out", outText);
}

function ffprobe(file) {
  const { execFileSync } = require("node:child_process");
  const ff = "/home/user/stream-trimmer/resources/bin/ffmpeg";
  const out = execFileSync(ff, ["-hide_banner", "-i", file], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();
  return out;
}

/** Real duration in seconds, via ffmpeg's own decode (not container metadata). */
function duration(file) {
  const { spawnSync } = require("node:child_process");
  const ff = "/home/user/stream-trimmer/resources/bin/ffmpeg";
  const r = spawnSync(ff, ["-hide_banner", "-i", file, "-f", "null", "-"], {
    encoding: "utf8",
  });
  const all = `${r.stderr || ""}${r.stdout || ""}`;
  const m = [...all.matchAll(/time=(\d+):(\d+):(\d+\.\d+)/g)].pop();
  const hdr = all.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const header = hdr
    ? Number(hdr[1]) * 3600 + Number(hdr[2]) * 60 + Number(hdr[3])
    : null;
  if (!m) return { seconds: null, header, raw: all.slice(-1500) };
  const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return { seconds, header, raw: all.slice(-1500) };
}

module.exports = { boot, loadUrl, mark, stubRoot, cookieText, ffprobe, duration, OUT, AREA };
