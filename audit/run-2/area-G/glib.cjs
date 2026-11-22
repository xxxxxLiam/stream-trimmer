/**
 * File: glib.cjs
 * Path: audit/run-2/area-G/glib.cjs
 * Description: Run-2 area-G harness. Boots the REAL server (server/index.ts
 * bundled by esbuild exactly as scripts/build-server.cjs does for the packaged
 * app) as a plain `node` child — no `tsx` wrapper to orphan — on a FREE port,
 * ready only when its own "listening on" line appears, with a PRIVATE TMPDIR
 * and the REAL resources/bin/ffmpeg. Kills the whole process group on stop.
 *
 * My own observation points, disclosed:
 *  - gfake.cjs is launched through a shell wrapper that does NOT `exec`, so the
 *    server's direct child is /bin/sh and the "engine" is a GRANDCHILD. Real
 *    yt-dlp spawns ffmpeg the same way, and it is the only way to prove a
 *    process-GROUP kill rather than a single-pid kill.
 *  - argv log (one JSON line per invocation) proves what reached the child.
 *  - cookie write-back, which real yt-dlp performs on close and which is the
 *    whole reason server/cookieJar.ts exists.
 * No product file is modified.
 */
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const AREA = __dirname;
const REAL_FFMPEG = path.join(repoRoot, "resources", "bin", "ffmpeg");
const FIXTURE = path.join(repoRoot, "audit", "fixtures", "fixture.mp4");
const YT_URL = "https://www.youtube.com/watch?v=stub0000001";

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

let bundleCache = null;
/** Bundles server/index.ts the way the packaged app does. Built once per run. */
function buildBundle(opts = {}) {
  const key = JSON.stringify(opts);
  if (bundleCache && bundleCache.key === key) return bundleCache.file;
  const esbuild = require(path.join(repoRoot, "node_modules", "esbuild"));
  // Inside the repo so the externals (ffmpeg-static, youtube-dl-exec) resolve
  // from node_modules exactly as they do in the packaged bundle's location.
  const dir = path.join(repoRoot, "node_modules", ".cache", "g2-area-G");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "server.cjs");
  esbuild.buildSync({
    entryPoints: [path.join(repoRoot, "server", "index.ts")],
    outfile: file,
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    loader: { ".ts": "ts" },
    external: ["electron", "ffmpeg-static", "youtube-dl-exec"],
    logLevel: "silent",
  });
  bundleCache = { key, file };
  return file;
}

/**
 * Starts one server. Returns a handle with raw-HTTP helpers.
 * opts: { label, cfg, env, cookieFile, port }
 */
async function startServer(opts = {}) {
  const label = opts.label || "srv";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `g2-${label}-`));
  const serverTmp = path.join(root, "tmp");
  const binDir = path.join(root, "bin");
  fs.mkdirSync(serverTmp, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  const fake = path.join(AREA, "gfake.cjs");
  const ytDlp = path.join(binDir, "yt-dlp");
  // Deliberately no `exec`: node runs as a GRANDCHILD of the server, which is
  // what makes a process-group kill distinguishable from child.kill().
  fs.writeFileSync(
    ytDlp,
    `#!/bin/sh\n"${process.execPath}" "${fake}" "$@"\nexit $?\n`,
  );
  fs.chmodSync(ytDlp, 0o755);
  fs.symlinkSync(REAL_FFMPEG, path.join(binDir, "ffmpeg"));

  const cfgFile = path.join(root, "cfg.json");
  const callLog = path.join(root, "argv.log");
  fs.writeFileSync(cfgFile, JSON.stringify(opts.cfg || {}));

  const bundle = buildBundle();
  const port = opts.port || (await freePort());
  const env = {
    ...process.env,
    PORT: String(port),
    ELECTRON_RESOURCES: root,
    ELECTRON_RESOURCES_BIN: binDir,
    VITE_ENABLE_CHANNEL_DATA: "",
    TMPDIR: serverTmp,
    TMP: serverTmp,
    TEMP: serverTmp,
    G_FAKE_CFG: cfgFile,
    G_FAKE_LOG: callLog,
    G_FAKE_FIXTURE: FIXTURE,
    G_FAKE_FFMPEG: REAL_FFMPEG,
    ...(opts.cookieFile ? { YT_CLIPPER_COOKIE_FILE: opts.cookieFile } : {}),
    ...(opts.env || {}),
  };
  delete env.PORT_UNUSED;
  const child = spawn(process.execPath, [bundle], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let output = "";
  child.stdout.on("data", (c) => (output += c.toString()));
  child.stderr.on("data", (c) => (output += c.toString()));

  const stop = async () => {
    try {
      fs.writeFileSync(path.join(AREA, "logs", `${label}.server.log`), output);
    } catch {
      /* ignore */
    }
    if (child.exitCode === null && child.signalCode === null) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          /* gone */
        }
      }
      await new Promise((r) => {
        const t = setTimeout(r, 3000);
        child.once("exit", () => {
          clearTimeout(t);
          r();
        });
      });
    }
  };

  const deadline = Date.now() + 40_000;
  while (!output.includes("listening on")) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode}):\n${output}`);
    }
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`server did not start:\n${output}`);
    }
    await new Promise((r) => setTimeout(r, 40));
  }

  const readLines = (f) => {
    try {
      return fs.readFileSync(f, "utf8").split("\n").filter(Boolean);
    } catch {
      return [];
    }
  };

  return {
    label,
    port,
    pid: child.pid,
    root,
    serverTmp,
    binDir,
    cfgFile,
    callLog,
    baseUrl: `http://127.0.0.1:${port}`,
    configure: (cfg) => fs.writeFileSync(cfgFile, JSON.stringify(cfg)),
    clearCalls: () => {
      fs.writeFileSync(callLog, "");
      try {
        fs.writeFileSync(`${callLog}.pids`, "");
      } catch {
        /* ignore */
      }
    },
    calls: () =>
      readLines(callLog)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter((c) => c && !c.argv.includes("--version")),
    pids: () => readLines(`${callLog}.pids`).map((l) => JSON.parse(l)),
    log: () => output,
    req: (o) => request({ port, ...o }),
    post: (route, body, extra = {}) =>
      request({
        port,
        method: "POST",
        path: route,
        body: typeof body === "string" ? body : JSON.stringify(body),
        ...extra,
        headers: { "content-type": "application/json", ...(extra.headers || {}) },
      }),
    get: (route, extra = {}) =>
      request({ port, method: "GET", path: route, ...extra }),
    stop,
    workFolders: () => {
      try {
        return fs
          .readdirSync(serverTmp)
          .filter((n) => n.startsWith("ytclip-") || n.startsWith("ytchan-"));
      } catch {
        return [];
      }
    },
  };
}

/** Raw HTTP, so bodies and headers a browser refuses to send are possible. */
function request(o) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: o.host || "127.0.0.1",
        port: o.port,
        method: o.method || "GET",
        path: o.path,
        headers: o.headers || {},
        localAddress: o.localAddress,
        setHost: o.setHost === undefined ? true : o.setHost,
        timeout: o.timeout || 120_000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
            json: (() => {
              try {
                return JSON.parse(Buffer.concat(chunks).toString());
              } catch {
                return null;
              }
            })(),
          }),
        );
      },
    );
    req.on("error", (e) => resolve({ error: String(e.message || e) }));
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    if (o.onRequest) o.onRequest(req);
    if (o.body !== undefined && o.body !== null) req.write(o.body);
    req.end();
  });
}

/** LISTEN rows from /proc/net/tcp(6), decoded, with the owning pid. */
function listenRows() {
  const rows = [];
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = text.trim().split("\n").slice(1);
    for (const line of lines) {
      const f = line.trim().split(/\s+/);
      if (f[3] !== "0A") continue; // LISTEN
      const [addrHex, portHex] = f[1].split(":");
      rows.push({
        file,
        localHex: addrHex,
        port: parseInt(portHex, 16),
        inode: f[9],
        raw: line.trim(),
      });
    }
  }
  return rows;
}

function decodeV4(hex) {
  if (hex.length !== 8) return hex;
  const b = hex.match(/../g).map((h) => parseInt(h, 16));
  return `${b[3]}.${b[2]}.${b[1]}.${b[0]}`;
}

function pidForInode(inode) {
  let pids = [];
  try {
    pids = fs.readdirSync("/proc").filter((n) => /^\d+$/.test(n));
  } catch {
    return null;
  }
  for (const pid of pids) {
    let fds = [];
    try {
      fds = fs.readdirSync(`/proc/${pid}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      let link = "";
      try {
        link = fs.readlinkSync(`/proc/${pid}/fd/${fd}`);
      } catch {
        continue;
      }
      if (link === `socket:[${inode}]`) {
        let cmd = "";
        try {
          cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim();
        } catch {
          /* ignore */
        }
        return { pid: Number(pid), cmd };
      }
    }
  }
  return null;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * The process state letter from /proc/<pid>/stat: R/S/D = running, Z = a
 * reaped-but-not-collected zombie (which process.kill(pid,0) still calls
 * alive), null = gone. Needed because a killed grandchild whose shell parent
 * died first lingers as a zombie for a moment, and counting that as "still
 * running" would invent a regression.
 */
function procState(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const after = stat.slice(stat.lastIndexOf(")") + 2);
    return after.split(" ")[0];
  } catch {
    return null;
  }
}

/** True only while the process is really executing (not a zombie, not gone). */
function pidRunning(pid) {
  const st = procState(pid);
  return st !== null && st !== "Z";
}

function psLines(pattern) {
  const r = spawnSync("ps", ["-eo", "pid,ppid,pgid,stat,args"], {
    encoding: "utf8",
  });
  return (r.stdout || "")
    .split("\n")
    .filter((l) => (pattern ? l.includes(pattern) : true));
}

function ffprobeDuration(file) {
  const r = spawnSync(REAL_FFMPEG, ["-hide_banner", "-i", file], {
    encoding: "utf8",
  });
  const text = `${r.stderr || ""}${r.stdout || ""}`;
  const m = text.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!m) return undefined;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + parseFloat(m[3]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function saveResults(label, data) {
  const dir = path.join(AREA, "out");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${label}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

/** A synthetic signed-in Netscape jar — the shape electron/youtubeSession writes. */
function writeCookieJar(file, extra = "") {
  const rows = [
    "# Netscape HTTP Cookie File",
    "# This file is generated by yt-dlp.  Do not edit.",
    "",
    ".youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tG2AUDITSIDVALUE000000",
    ".youtube.com\tTRUE\t/\tTRUE\t2000000000\t__Secure-3PSID\tG2AUDIT3PSIDVALUE0000",
    extra,
  ].filter((l) => l !== undefined);
  fs.writeFileSync(file, rows.join("\n") + "\n");
  return file;
}

module.exports = {
  repoRoot,
  AREA,
  REAL_FFMPEG,
  FIXTURE,
  YT_URL,
  freePort,
  buildBundle,
  startServer,
  request,
  listenRows,
  decodeV4,
  pidForInode,
  pidAlive,
  procState,
  pidRunning,
  psLines,
  ffprobeDuration,
  sleep,
  saveResults,
  writeCookieJar,
};
