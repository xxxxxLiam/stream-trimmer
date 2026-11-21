/**
 * audit/run-1/area-E/scripts/lib.cjs — shared helpers for area E scripts.
 * Audit-only. Touches no product code.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");

const REPO = "/home/user/stream-trimmer";
const AREA = path.join(REPO, "audit/run-1/area-E");
const OUT = path.join(AREA, "out");

function useShape(shape) {
  execFileSync("bash", [path.join(AREA, "scripts/use-shape.sh"), shape], {
    stdio: "pipe",
  });
}

/** Fresh stub root with the area-E subtitle patch. */
function stubRoot(name) {
  const root = path.join("/tmp/area-E-stubs", name);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  execFileSync(process.execPath, [path.join(AREA, "scripts/stub-root.cjs"), root], {
    stdio: "pipe",
  });
  return root;
}

function writeStub(root, cfg) {
  fs.writeFileSync(path.join(root, "stub.json"), JSON.stringify(cfg, null, 2));
}

/** A channel listing the stub will dump for the flat-playlist call. */
function channelInfo(opts = {}) {
  const n = opts.count ?? 3;
  const entries = [];
  for (let i = 0; i < n; i++) {
    entries.push({
      id: `vid${String(i).padStart(7, "0")}`,
      title: opts.titles?.[i] ?? `Video ${i}`,
      duration: opts.durations?.[i] ?? 600,
      view_count: 1000 - i,
    });
  }
  return {
    _type: "playlist",
    id: "UCstub",
    channel: opts.channel ?? "Stub Channel",
    uploader: opts.channel ?? "Stub Channel",
    title: opts.videoTitle ?? "Stub video title",
    channel_follower_count: opts.subs ?? 4242,
    description: opts.description ?? "",
    duration: opts.duration ?? 600,
    view_count: 999,
    like_count: 42,
    comment_count: 7,
    tags: opts.tags ?? ["tag one", "tag two"],
    thumbnail: "https://example.invalid/t.jpg",
    upload_date: "20240101",
    entries,
    comments: opts.comments ?? [],
  };
}

/** Save a JSON artefact and return its path. */
function save(dir, name, value) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name);
  fs.writeFileSync(
    f,
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
  );
  return f;
}

/**
 * POST/GET the instance's own server from inside the page.
 * `timeoutMs` aborts the read — /api/channel/export/progress is an SSE stream
 * that never ends, so reading it to completion would hang forever.
 */
async function api(win, method, apiPath, body, timeoutMs = 30000) {
  return win.evaluate(
    async ([m, p, b, t]) => {
      const base = window.__API_BASE__
        ? window.__API_BASE__.replace(/\/$/, "")
        : "";
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), t);
      const init = { method: m, signal: ctl.signal };
      if (b !== null) {
        init.headers = { "content-type": "application/json" };
        init.body = JSON.stringify(b);
      }
      try {
        const r = await fetch(base + p, init);
        const head = {
          status: r.status,
          ok: r.ok,
          ct: r.headers.get("content-type"),
        };
        // Read with the same abort budget; a stream that never ends shows up as
        // `truncated` rather than hanging the test.
        try {
          const text = await r.text();
          return { ...head, body: text.slice(0, 2000) };
        } catch (e) {
          // Pull whatever bytes arrived before the abort.
          return { ...head, truncated: true, readError: String(e) };
        }
      } catch (e) {
        return { status: 0, ok: false, error: String(e) };
      } finally {
        clearTimeout(timer);
      }
    },
    [method, apiPath, body === undefined ? null : body, timeoutMs],
  );
}

/** Read an SSE stream for `ms`, returning the frames seen. Never hangs. */
async function sse(win, apiPath, ms = 3000) {
  return win.evaluate(
    async ([p, t]) => {
      const base = window.__API_BASE__
        ? window.__API_BASE__.replace(/\/$/, "")
        : "";
      const ctl = new AbortController();
      const frames = [];
      let status = 0;
      let ct = null;
      const timer = setTimeout(() => ctl.abort(), t);
      try {
        const r = await fetch(base + p, { signal: ctl.signal });
        status = r.status;
        ct = r.headers.get("content-type");
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          frames.push(dec.decode(value));
        }
      } catch (e) {
        /* aborted on purpose */
      } finally {
        clearTimeout(timer);
      }
      return { status, ct, frames };
    },
    [apiPath, ms],
  );
}

const SEED_READY = {
  "clipper.dataDirConfirmed": true,
};

/**
 * A synthetic Netscape cookies.txt that the app's own validator accepts.
 * The YouTube sign-in modal has no dismiss, and it sits over the whole window
 * until a session exists, so area-E UI tests import one through the product's
 * own `youtube:importCookiesText` bridge. No network is touched.
 */
function cookieText() {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const row = (name, value) =>
    [".youtube.com", "TRUE", "/", "TRUE", String(exp), name, value].join("\t");
  return [
    "# Netscape HTTP Cookie File",
    row("SID", "audit-sid-value"),
    row("__Secure-3PSID", "audit-3psid-value"),
    row("__Secure-1PSID", "audit-1psid-value"),
    row("HSID", "audit-hsid"),
    row("SSID", "audit-ssid"),
    "",
  ].join("\n");
}

/**
 * Clear the sign-in modal so the rest of the UI is reachable.
 *
 * The modal has no dismiss and covers the window until a session exists. The
 * import paths end in verifyImported(), which runs yt-dlp against YouTube for
 * real, so they cannot settle here. The launch-time path is purely local
 * (`youtube:probe` -> readCookieFileState over userData/yt-cookies.txt), so
 * area E drops a synthetic Netscape file at the canonical path and reloads.
 * Nothing in the product is modified.
 */
async function signIn(a) {
  fs.writeFileSync(path.join(a.userDataDir, "yt-cookies.txt"), cookieText());
  await a.win.reload();
  await a.win.waitForSelector("header", { timeout: 25000 });
  await a.win
    .waitForSelector('[aria-labelledby="youtube-connect-title"]', {
      state: "detached",
      timeout: 25000,
    })
    .catch(() => {});
  return a.win.evaluate(() =>
    window.electronAPI?.probeYouTube ? window.electronAPI.probeYouTube() : null,
  );
}

module.exports = {
  REPO, AREA, OUT,
  launchApp, useShape, stubRoot, writeStub, channelInfo, save, api, sse, SEED_READY, cookieText, signIn,
};
