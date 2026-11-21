/**
 * v-lib.cjs — slice-3 verification helpers. Written for this pass; shares no
 * code with the original area scripts.
 *
 *  launchMirror()  launches a frozen production-shape mirror (built by
 *                  v-build-mirror.cjs) with a FRESH --user-data-dir every
 *                  time, so every run is a cold start.
 *  req()           raw HTTP from outside the renderer: any method, any
 *                  headers, any body, and optionally bound to a chosen local
 *                  source address so the request genuinely leaves loopback.
 *  stub()          rewrites <stubRoot>/stub.json between calls.
 *
 * No product file is read for state and none is written.
 */
const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");

const REPO = path.resolve(__dirname, "..", "..", "..", "..");
const ELECTRON_BIN = path.join(REPO, "node_modules", "electron", "dist", "electron");
const HERE = __dirname;
const OUT = path.join(HERE, "out");

/** Fresh stub root with the argv log and cookie write-back. */
function makeStub(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `v3stub-${label}-`));
  execFileSync(process.execPath, [path.join(HERE, "v-stub.cjs"), root], { stdio: "pipe" });
  return root;
}

function stub(root, cfg) {
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
    fs.rmSync(path.join(root, "writeback.log"), { force: true });
  } catch {}
}

/**
 * @param {object} o
 * @param {"public"|"owner"|"nonowner"} [o.shape]
 * @param {string} [o.label]
 * @param {string} [o.stubRoot]  root holding resources/bin (becomes cwd)
 * @param {object} [o.seed]      settings.json to boot with
 * @param {object} [o.env]
 */
async function launchMirror(o = {}) {
  const shape = o.shape || "public";
  const mirror = `/tmp/v3-app-${shape}`;
  if (!fs.existsSync(path.join(mirror, "electron", "main.cjs"))) {
    throw new Error(`mirror missing: ${mirror} — run v-build-mirror.cjs ${shape}`);
  }
  const label = o.label || "run";
  const outDir = path.join(o.outDir || OUT, label);
  fs.mkdirSync(outDir, { recursive: true });

  // COLD START: a brand new user-data dir every launch. Electron's
  // single-instance lock is per user-data dir, so this also keeps parallel
  // launches from driving each other's window.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `v3-${label}-`));
  if (o.seed) {
    fs.writeFileSync(path.join(userDataDir, "settings.json"), JSON.stringify(o.seed, null, 2));
  }
  // Extra files placed in the user-data dir BEFORE launch, e.g. yt-cookies.txt,
  // so the app boots already holding a saved sign-in.
  for (const [rel, text] of Object.entries(o.userFiles || {})) {
    const p = path.join(userDataDir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
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
    cwd: o.stubRoot || mirror,
    env: { ...process.env, ...(o.env || {}) },
  });
  app.process().stdout.on("data", (d) => logs.stdout.push(String(d)));
  app.process().stderr.on("data", (d) => logs.stderr.push(String(d)));

  const deadline = Date.now() + (o.timeout || 60000);
  let win = null;
  while (!win && Date.now() < deadline) {
    for (const w of app.windows()) {
      let url = "";
      try { url = w.url(); } catch { continue; }
      if (url.includes("127.0.0.1") || url.includes("localhost:8080")) { win = w; break; }
    }
    if (!win) await new Promise((r) => setTimeout(r, 200));
  }
  if (!win) {
    const urls = app.windows().map((w) => { try { return w.url(); } catch { return "<gone>"; } });
    await app.close().catch(() => {});
    throw new Error(`no main window. windows=${JSON.stringify(urls)}\nstderr:\n${logs.stderr.join("")}`);
  }
  win.on("console", (m) => logs.console.push(`[${m.type()}] ${m.text()}`));
  win.on("pageerror", (e) => logs.pageErrors.push(String(e)));
  await win.waitForLoadState("domcontentloaded");

  const apiBase = await win.evaluate(() => window.__API_BASE__ || location.origin);
  const port = Number(new URL(apiBase).port);

  let n = 0;
  const shot = async (name) => {
    const f = path.join(outDir, `${String(++n).padStart(2, "0")}-${name}.png`);
    await win.screenshot({ path: f });
    return f;
  };
  const close = async () => {
    fs.writeFileSync(path.join(outDir, "logs.json"), JSON.stringify(logs, null, 2));
    await app.close().catch(() => {});
  };
  const mainLog = () => {
    try { return fs.readFileSync(path.join(userDataDir, "logs", "main.log"), "utf8"); }
    catch { return ""; }
  };
  const clipboard = () => app.evaluate(({ clipboard }) => clipboard.readText());

  return { app, win, apiBase, port, userDataDir, outDir, logs, shot, close, mainLog, clipboard, mirror };
}

/**
 * Raw HTTP, from this node process — outside the renderer, so no browser
 * restriction on the body or headers applies.
 * @param {object} o host, port, method, path, headers, body, localAddress
 */
function req(o) {
  return new Promise((resolve) => {
    const r = http.request(
      {
        host: o.host || "127.0.0.1",
        port: o.port,
        method: o.method || "GET",
        path: o.path,
        headers: o.headers || {},
        localAddress: o.localAddress,
        timeout: o.timeout || 60000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
            localAddress: r.socket && r.socket.localAddress,
            remoteAddress: r.socket && r.socket.remoteAddress,
          }),
        );
      },
    );
    r.on("timeout", () => { r.destroy(new Error("timeout")); });
    r.on("error", (e) => resolve({ error: String(e && e.message || e) }));
    if (o.body != null) r.write(o.body);
    r.end();
  });
}

function jsonReq(o) {
  return req({ ...o, method: o.method || "POST", headers: { "content-type": "application/json", ...(o.headers || {}) }, body: typeof o.body === "string" ? o.body : JSON.stringify(o.body) });
}

/** Listening sockets from /proc/net/tcp(6), with the owning pid where findable. */
function listeningSockets(port) {
  const rows = [];
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let text = "";
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    for (const line of text.split("\n").slice(1)) {
      const f = line.trim().split(/\s+/);
      if (f.length < 10) continue;
      const [localHex, lport] = f[1].split(":");
      if (parseInt(lport, 16) !== port) continue;
      if (f[3] !== "0A") continue; // 0A = TCP_LISTEN
      rows.push({ file, localHex, port: parseInt(lport, 16), state: f[3], inode: f[9], raw: line.trim() });
    }
  }
  // tie each socket inode to a pid by scanning /proc/<pid>/fd
  for (const row of rows) {
    row.pids = [];
    let pids = [];
    try { pids = fs.readdirSync("/proc").filter((d) => /^\d+$/.test(d)); } catch {}
    for (const pid of pids) {
      let fds = [];
      try { fds = fs.readdirSync(`/proc/${pid}/fd`); } catch { continue; }
      for (const fd of fds) {
        let link = "";
        try { link = fs.readlinkSync(`/proc/${pid}/fd/${fd}`); } catch { continue; }
        if (link === `socket:[${row.inode}]`) {
          let cmd = "";
          try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim(); } catch {}
          row.pids.push({ pid: Number(pid), cmdline: cmd.slice(0, 160) });
          break;
        }
      }
    }
  }
  return rows;
}

/** 00000000 = 0.0.0.0 (every interface); 0100007F = 127.0.0.1 (loopback). */
function decodeHexAddr(hex) {
  if (hex.length === 8) {
    const b = hex.match(/../g).reverse().map((h) => parseInt(h, 16));
    return b.join(".");
  }
  if (hex === "0".repeat(32)) return "::";
  return hex;
}

function save(name, data) {
  fs.mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, name);
  fs.writeFileSync(f, typeof data === "string" ? data : JSON.stringify(data, null, 2));
  return f;
}

/** Netscape cookie jar with a real-shaped (synthetic) signed-in session. */
function cookieJarText(sidValue) {
  const sid = sidValue || "AKxxSYNTHETIC_SID_VALUE_0123456789abcdef";
  return [
    "# Netscape HTTP Cookie File",
    "# This file is generated by yt-dlp.  Do not edit.",
    "",
    `.youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\t${sid}`,
    `#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t2000000000\t__Secure-3PSID\tAKxxSYNTHETIC_3PSID_VALUE_9876543210`,
    `.youtube.com\tTRUE\t/\tFALSE\t2000000000\tPREF\ttz=UTC`,
    "",
  ].join("\n");
}

module.exports = {
  REPO, OUT, HERE, launchMirror, req, jsonReq, makeStub, stub, argvLog, clearArgvLog,
  listeningSockets, decodeHexAddr, save, cookieJarText,
};
