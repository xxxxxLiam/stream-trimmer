/**
 * Audit run 2, area AF scaffolding. NOT product code.
 * Launches a frozen mirror of the app with a fresh user-data dir per launch.
 */
const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO = "/home/user/stream-trimmer";
const ELECTRON_BIN = path.join(REPO, "node_modules", "electron", "dist", "electron");
const OUT = path.join(REPO, "audit", "run-2", "area-AF", "out");
const STUB = "/tmp/af-stub";

function writeStub(cfg) {
  fs.writeFileSync(path.join(STUB, "stub.json"), JSON.stringify(cfg, null, 2));
}
function clearCalls() {
  try { fs.unlinkSync(path.join(STUB, "calls.log")); } catch {}
}
function calls() {
  try {
    return fs
      .readFileSync(path.join(STUB, "calls.log"), "utf8")
      .split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

async function launch(opts = {}) {
  const label = opts.label || "run";
  const mirror = opts.mirror || "/tmp/af-public";
  const outDir = path.join(OUT, label);
  fs.mkdirSync(outDir, { recursive: true });

  const userDataDir = opts.userDataDir || fs.mkdtempSync(path.join(os.tmpdir(), `af-${label}-`));
  if (opts.seed) {
    fs.writeFileSync(path.join(userDataDir, "settings.json"), JSON.stringify(opts.seed, null, 2));
  }
  if (opts.cookieFile) {
    fs.writeFileSync(path.join(userDataDir, "yt-cookies.txt"), opts.cookieFile, { mode: 0o600 });
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
    cwd: opts.cwd || STUB,
    env: { ...process.env, ...(opts.env || {}) },
  });
  app.process().stdout.on("data", (d) => logs.stdout.push(String(d)));
  app.process().stderr.on("data", (d) => logs.stderr.push(String(d)));

  const deadline = Date.now() + (opts.timeout || 60000);
  let win = null;
  while (!win && Date.now() < deadline) {
    for (const w of app.windows()) {
      let url = "";
      try { url = w.url(); } catch { continue; }
      if (url.includes("127.0.0.1")) { win = w; break; }
    }
    if (!win) await new Promise((r) => setTimeout(r, 200));
  }
  if (!win) {
    await app.close().catch(() => {});
    throw new Error("main window never appeared\n" + logs.stderr.join(""));
  }
  win.on("console", (m) => logs.console.push(`[${m.type()}] ${m.text()}`));
  win.on("pageerror", (e) => logs.pageErrors.push(String(e)));
  await win.waitForLoadState("domcontentloaded");

  let n = 0;
  const shot = async (name) => {
    const file = path.join(outDir, `${String(++n).padStart(2, "0")}-${name}.png`);
    try { await win.screenshot({ path: file }); } catch { return null; }
    return file;
  };
  const readState = () => {
    try { return JSON.parse(fs.readFileSync(path.join(userDataDir, "settings.json"), "utf8")); }
    catch { return {}; }
  };
  const save = (name, data) => {
    const f = path.join(outDir, name);
    fs.writeFileSync(f, typeof data === "string" ? data : JSON.stringify(data, null, 2));
    return f;
  };
  const close = async () => {
    save("logs.json", logs);
    await app.close().catch(() => {});
  };
  return { app, win, userDataDir, outDir, logs, shot, readState, save, close, mirror };
}

/** A valid-looking signed-in Netscape jar. */
function jar(expires = Math.floor(Date.now() / 1000) + 60 * 86400) {
  return [
    "# Netscape HTTP Cookie File",
    `.youtube.com\tTRUE\t/\tTRUE\t${expires}\tSID\tAUDITRUN2SIDVALUE0001`,
    `.youtube.com\tTRUE\t/\tTRUE\t${expires}\t__Secure-3PSID\tAUDITRUN2SECUREVALUE1`,
    `.youtube.com\tTRUE\t/\tTRUE\t${expires}\tHSID\tAUDITRUN2HSIDVALUE01`,
    "",
  ].join("\n");
}

/** Real yt-dlp strings for each classifier verdict. */
const AUTH_TEXT = {
  signed_in: { stdout: "[debug] Found YouTube account cookies\n[youtube] Extracting URL", stderr: "", exitCode: 0 },
  // "confirm you're not a bot" classifies as rate_limited, so a true
  // signed_out needs yt-dlp's age-gate wording instead.
  signed_out: {
    stderr:
      "ERROR: [youtube] jNQXAC9IVRw: Sign in to confirm your age. This video may be inappropriate for some users. Use --cookies-from-browser or --cookies for the authentication.",
    exitCode: 1,
  },
  rate_limited: {
    stderr:
      "ERROR: [youtube] jNQXAC9IVRw: Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies for the authentication.",
    exitCode: 1,
  },
  profile_missing: {
    stderr: 'ERROR: could not find chrome cookies database in "/root/.config/google-chrome"',
    exitCode: 1,
  },
  inconclusive: { stdout: "[download]  100.0% of 1.00MiB", stderr: "", exitCode: 0 },
};

module.exports = { launch, writeStub, clearCalls, calls, jar, AUTH_TEXT, REPO, OUT, STUB };
