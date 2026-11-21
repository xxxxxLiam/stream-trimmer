/**
 * G area, audit-only. Starts the REAL server (server/index.ts, the same file
 * `npm run dev:server` and the Electron bundle run) as a child process on a
 * free port, with the environment Electron gives it, and hands back a raw HTTP
 * client. Nothing is stubbed but yt-dlp, which is what the harness already does.
 *
 * Driving the server directly (instead of through the page) is what lets area G
 * control YT_CLIPPER_COOKIE_FILE, kill children, and send bodies a browser
 * fetch() will not send.
 */
const fs = require("node:fs");
const net = require("node:net");
const http = require("node:http");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");

const REPO = "/home/user/stream-trimmer";
const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.unref(); s.on("error", rej);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

function makeStub(name) {
  const root = path.join(SCRATCH, `gstub-${name}`);
  execFileSync("node", [path.join(__dirname, "mk-gstub.cjs"), root], { stdio: "pipe" });
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
    return fs.readFileSync(f, "utf8").split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } });
  } catch { return []; }
};

/** Start server/index.ts. `env` is merged over the Electron-shaped defaults. */
async function start(opts = {}) {
  const port = await freePort();
  const stub = opts.stub;
  const env = {
    ...process.env,
    PORT: String(port),
    ELECTRON_RESOURCES_BIN: stub ? path.join(stub, "resources", "bin") : undefined,
    VITE_ENABLE_CHANNEL_DATA: "",
    ...(opts.env || {}),
  };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];

  const child = spawn(path.join(REPO, "node_modules", ".bin", "tsx"), [path.join(REPO, "server", "index.ts")], {
    cwd: stub || REPO, env, stdio: ["ignore", "pipe", "pipe"],
  });
  const out = [], err = [];
  child.stdout.on("data", (d) => out.push(String(d)));
  child.stderr.on("data", (d) => err.push(String(d)));

  const deadline = Date.now() + 60000;
  for (;;) {
    if (out.join("").includes("listening on")) break;
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}\n${err.join("")}`);
    if (Date.now() > deadline) throw new Error(`server never listened\nSTDOUT\n${out.join("")}\nSTDERR\n${err.join("")}`);
    await new Promise((r) => setTimeout(r, 150));
  }

  /** One raw HTTP request. body may be a string or Buffer; headers verbatim. */
  const req = (method, route, { body, headers, timeoutMs = 120000, host = "127.0.0.1" } = {}) =>
    new Promise((resolve) => {
      const r = http.request({ host, port, path: route, method, headers: headers || {} }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode, headers: res.headers,
            contentType: res.headers["content-type"],
            body: buf.toString("utf8", 0, Math.min(buf.length, 8000)),
            bytes: buf.length,
          });
        });
      });
      r.setTimeout(timeoutMs, () => { r.destroy(new Error("client timeout")); });
      r.on("error", (e) => resolve({ error: String(e.message) }));
      if (body !== undefined && body !== null) r.end(body); else r.end();
    });

  const json = (method, route, obj, extraHeaders) =>
    req(method, route, {
      body: obj === undefined ? undefined : JSON.stringify(obj),
      headers: { "content-type": "application/json", ...(extraHeaders || {}) },
    });

  /** Fire a request and keep the handle so it can be aborted mid-flight. */
  const open = (method, route, { body, headers } = {}) => {
    const state = { done: false, result: null, aborted: false };
    const r = http.request({ host: "127.0.0.1", port, path: route, method, headers: headers || {} }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        state.done = true;
        state.result = { status: res.statusCode, headers: res.headers, body: buf.toString("utf8", 0, Math.min(buf.length, 8000)), bytes: buf.length };
      });
    });
    r.on("error", (e) => { state.done = true; state.result = { error: String(e.message) }; });
    if (body !== undefined) r.end(body); else r.end();
    state.abort = () => { state.aborted = true; r.destroy(new Error("client aborted")); };
    state.wait = async (ms = 180000) => {
      const t0 = Date.now();
      while (!state.done && Date.now() - t0 < ms) await new Promise((x) => setTimeout(x, 100));
      return state.done ? state.result : { timeout: true };
    };
    return state;
  };

  const stop = async () => {
    child.kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 300));
  };

  return {
    port, child, stdout: out, stderr: err, req, json, open, stop,
    log: () => out.join("") + "\n==STDERR==\n" + err.join(""),
    argvLog: () => readLines(path.join(stub, "argv.log")),
    cookieLog: () => readLines(path.join(stub, "cookiewrite.log")),
    resetLogs: () => { for (const f of ["argv.log", "cookiewrite.log"]) fs.rmSync(path.join(stub, f), { force: true }); },
  };
}

module.exports = { start, makeStub, setStub, freePort, REPO, SCRATCH, YT: "https://www.youtube.com/watch?v=stub0000001" };
