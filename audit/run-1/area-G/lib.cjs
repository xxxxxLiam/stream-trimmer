/**
 * G area, audit-only shared helpers: launch the real app, call its loopback
 * server from inside the page, and script the stub between calls.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");

const AREA = __dirname;
const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";

function makeStub(name) {
  const root = path.join(SCRATCH, `gstub-${name}`);
  execFileSync("node", [path.join(AREA, "mk-gstub.cjs"), root], { stdio: "pipe" });
  return root;
}

function setStub(root, cfg) {
  const base = {
    info: { id: "stub0000001", title: "Stub video", duration: 3600, uploader: "Stub channel" },
    exitCode: 0, stderr: "", delayMs: 0, progress: [0, 50, 100], writeMedia: true,
  };
  fs.writeFileSync(path.join(root, "stub.json"), JSON.stringify({ ...base, ...cfg }, null, 2));
}

const readLines = (f) => {
  try {
    return fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return { raw: l }; }
    });
  } catch { return []; }
};
const argvLog = (root) => readLines(path.join(root, "argv.log"));
const cookieLog = (root) => readLines(path.join(root, "cookiewrite.log"));
const resetLogs = (root) => {
  for (const f of ["argv.log", "cookiewrite.log"]) fs.rmSync(path.join(root, f), { force: true });
};

/**
 * A live page handle. The app can replace its window (the renderer reloads
 * after the startup session sweep), which kills a captured Playwright Page, so
 * every call re-resolves one instead of holding the first.
 */
function livePage(a) {
  return async () => {
    for (let i = 0; i < 40; i++) {
      for (const w of a.app.windows()) {
        try {
          const u = w.url();
          if (!u.includes("127.0.0.1") && !u.includes("localhost:8080")) continue;
          await w.evaluate(() => 1);
          return w;
        } catch { /* closed or still loading */ }
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("no live app window");
  };
}

/** Raw HTTP from inside the page — reaches this instance's own port. */
async function api(win, method, route, opts = {}) {
  if (typeof win === "function") {
    for (let attempt = 0; attempt < 3; attempt++) {
      const page = await win();
      try { return await api(page, method, route, opts); }
      catch (e) {
        const m = String(e && e.message);
        if (!/closed|destroyed|Execution context/i.test(m) || attempt === 2) {
          return { status: null, contentType: null, body: `HARNESS ERROR: ${m}`, harnessError: m };
        }
      }
    }
  }
  return win.evaluate(async ({ method, route, body, headers, raw }) => {
    const init = { method, headers: headers || {} };
    if (raw !== undefined) init.body = raw;
    else if (body !== undefined) {
      init.headers["content-type"] = init.headers["content-type"] || "application/json";
      init.body = JSON.stringify(body);
    }
    let r, text;
    try {
      r = await fetch(`${window.__API_BASE__}${route}`, init);
      text = await r.text();
    } catch (e) {
      return { fetchError: String(e) };
    }
    const h = {};
    r.headers.forEach((v, k) => { h[k] = v; });
    return { status: r.status, contentType: r.headers.get("content-type"), headers: h, body: text.slice(0, 4000), bodyLen: text.length };
  }, { method, route, body: opts.body, headers: opts.headers, raw: opts.raw });
}

/** Fire a POST without awaiting it; returns a handle the page keeps. */
async function apiAsync(win, route, body, key) {
  await win.evaluate(({ route, body, key }) => {
    window.__g = window.__g || {};
    const ctl = new AbortController();
    window.__g[key] = {
      ctl,
      done: false,
      result: null,
      p: fetch(`${window.__API_BASE__}${route}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      }).then(async (r) => {
        const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
        const t = await r.text();
        window.__g[key].done = true;
        window.__g[key].result = { status: r.status, headers: h, body: t.slice(0, 3000) };
      }).catch((e) => {
        window.__g[key].done = true;
        window.__g[key].result = { aborted: true, error: String(e) };
      }),
    };
  }, { route, body, key });
}

const pollAsync = (win, key) =>
  win.evaluate((key) => (window.__g && window.__g[key]) ? { done: window.__g[key].done, result: window.__g[key].result } : null, key);

const abortAsync = (win, key) =>
  win.evaluate((key) => { try { window.__g[key].ctl.abort(); return true; } catch { return false; } }, key);

const waitAsync = async (win, key, ms = 120000) => {
  const t0 = Date.now();
  for (;;) {
    const s = await pollAsync(win, key);
    if (s && s.done) return s.result;
    if (Date.now() - t0 > ms) return { timeout: true };
    await new Promise((r) => setTimeout(r, 200));
  }
};

/** Read one SSE snapshot for a job id (first event, then close). */
const progressOnce = (win, jobId, ms = 4000) =>
  win.evaluate(async ({ jobId, ms }) => {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(`${window.__API_BASE__}/api/download/progress?jobId=${encodeURIComponent(jobId)}`, { signal: ctl.signal });
      const reader = r.body.getReader();
      const { value } = await reader.read();
      clearTimeout(to);
      ctl.abort();
      return { status: r.status, contentType: r.headers.get("content-type"), first: new TextDecoder().decode(value || new Uint8Array()) };
    } catch (e) { clearTimeout(to); return { error: String(e) }; }
  }, { jobId, ms });

const YT = "https://www.youtube.com/watch?v=stub0000001";

/** Wrap the page-taking helpers so each accepts a livePage() function too. */
function deref(fn) {
  return async (win, ...rest) => {
    if (typeof win === "function") win = await win();
    return fn(win, ...rest);
  };
}

module.exports = {
  launchApp, makeStub, setStub, argvLog, cookieLog, resetLogs, livePage,
  api,
  apiAsync: deref(apiAsync),
  pollAsync: deref(pollAsync),
  abortAsync: deref(abortAsync),
  waitAsync: deref(waitAsync),
  progressOnce: deref(progressOnce),
  YT, SCRATCH, AREA,
};
