/**
 * slice-2 shared helpers. Audit-only; no product file is imported for writing.
 *
 * makeStubRoot() builds its own yt-dlp stub rather than reusing area G's, so
 * the verification does not inherit any behaviour (or mistake) baked into the
 * original author's stub. It is the shared harness stub plus two switches the
 * shared one lacks:
 *   - stub.json.failSectioned : the invocation carrying --download-sections
 *     exits non-zero with a real yt-dlp 403 string, which is what pushes the
 *     server onto the whole-file + local-trim path. `--version` and the
 *     metadata probe keep working, so resolveYtDlp() still prefers this stub
 *     over any system yt-dlp (which would reach the network).
 *   - stub.json.argvLog : append one JSON line per invocation.
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO = "/home/user/stream-trimmer";
const FIXTURE = path.join(REPO, "audit", "fixtures", "fixture.mp4");

function makeStubRoot(root, cfg = {}) {
  const bin = path.join(root, "resources", "bin");
  fs.mkdirSync(bin, { recursive: true });
  for (const name of ["ffmpeg", "deno"]) {
    const real = path.join(REPO, "resources", "bin", name);
    const link = path.join(bin, name);
    if (fs.existsSync(real) && !fs.existsSync(link)) fs.symlinkSync(real, link);
  }
  fs.copyFileSync(FIXTURE, path.join(root, "fixture.mp4"));
  writeStubCfg(root, cfg);

  const stub = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "stub.json"), "utf8")); } catch { return {}; } })();
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const hasPrefix = (p) => argv.some((a) => String(a).startsWith(p));
const valOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
if (cfg.argvLog) { try { fs.appendFileSync(path.join(ROOT, "argv.log"), JSON.stringify({ t: Date.now(), argv }) + "\\n"); } catch {} }

const info = Object.assign({ id: "stub0000001", title: "Stub video", duration: 3600, uploader: "Stub channel" }, cfg.info || {});

async function main() {
  if (has("--version")) { process.stdout.write("2099.12.31\\n"); return; }
  if (cfg.delayMs) await new Promise((r) => setTimeout(r, cfg.delayMs));
  if (has("-J") || has("--dump-json") || has("--dump-single-json")) {
    if (cfg.failJson) { process.stderr.write((cfg.stderr || "ERROR: probe failed") + "\\n"); process.exit(1); }
    process.stdout.write(JSON.stringify(Object.assign({
      _type: "video", webpage_url: "https://www.youtube.com/watch?v=" + info.id,
      formats: [
        { format_id: "18",  ext: "mp4", height: 360,  vcodec: "avc1", acodec: "mp4a" },
        { format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none" },
        { format_id: "140", ext: "m4a", height: null, vcodec: "none", acodec: "mp4a" },
      ],
      subtitles: {}, automatic_captions: {}, comments: [],
    }, info)) + "\\n");
    return;
  }
  const sectioned = hasPrefix("--download-sections") || has("--download-sections");
  if (sectioned && cfg.failSectioned) {
    process.stderr.write("ERROR: unable to download video data: HTTP Error 403: Forbidden\\n");
    process.exit(1);
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
      try { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(fixture, target); }
      catch (e) { process.stderr.write("stub: " + e.message + "\\n"); }
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

function writeStubCfg(root, cfg) {
  fs.writeFileSync(path.join(root, "stub.json"), JSON.stringify(cfg, null, 2));
}

/** A port nothing is listening on right now. */
function freePort() {
  return new Promise((resolve, reject) => {
    const net = require("node:net");
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

/**
 * Starts `tsx server/index.ts` with cwd = stub root, so it resolves the stub.
 *
 * Two things learned the hard way: `tsx` is a WRAPPER that spawns the real
 * node process, so killing the wrapper orphans the server and a later run on
 * the same port silently talks to the previous run's server. The child is
 * therefore its own process group, killed as a group, and the port is picked
 * fresh for every server rather than being a constant.
 */
async function startServer(stubRoot, port, extraEnv = {}) {
  const lines = [];
  if (!port) port = await freePort();
  const child = spawn(
    path.join(REPO, "node_modules", ".bin", "tsx"),
    [path.join(REPO, "server", "index.ts")],
    {
      cwd: stubRoot,
      env: { ...process.env, PORT: String(port), ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  child.stdout.on("data", (d) => String(d).split(/\n/).forEach((l) => l && lines.push(l)));
  child.stderr.on("data", (d) => String(d).split(/\n/).forEach((l) => l && lines.push(l)));
  const base = `http://127.0.0.1:${port}`;
  const killGroup = () => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {}
    }
  };
  const deadline = Date.now() + 40000;
  let listening = false;
  for (;;) {
    // The log line proves it is OUR process answering, not a leftover one.
    if (lines.some((l) => l.includes(`listening on http://localhost:${port}`))) listening = true;
    if (listening) {
      try {
        const r = await fetch(`${base}/api/cache/usage`);
        if (r.ok) break;
      } catch {}
    }
    if (Date.now() > deadline) {
      killGroup();
      throw new Error("server never came up:\n" + lines.join("\n"));
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return {
    base,
    port,
    pid: child.pid,
    lines,
    stop: () =>
      new Promise((res) => {
        child.on("exit", () => setTimeout(res, 300));
        killGroup();
        setTimeout(res, 2000);
      }),
  };
}

async function post(base, route, body, headers = {}) {
  const r = await fetch(base + route, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, headers: Object.fromEntries(r.headers.entries()), text, json };
}

module.exports = { REPO, FIXTURE, makeStubRoot, writeStubCfg, startServer, post };
