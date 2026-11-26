// scripts/bundle-binaries.cjs — copies ffmpeg + yt-dlp for the current
// platform into resources/bin/ so electron-builder can extraResources them
// into the packaged app. Runs before `electron-builder`.
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const https = require("node:https");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const platform = process.platform; // 'darwin' | 'win32' | 'linux'
const arch = process.arch; // 'x64' | 'arm64'
const outDir = path.join(__dirname, "..", "resources", "bin");
const cacheDir = path.join(outDir, ".cache");
const potProviderDir = path.join(__dirname, "..", "resources", "pot-provider");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });
// Always present, even empty, so electron-builder's extraResources entry for it never fails on a
// platform `--pot` was never run on (see bundlePotProvider() below) — an empty folder packages fine.
fs.mkdirSync(potProviderDir, { recursive: true });

function copy(src, dstName) {
  const dst = path.join(outDir, dstName);
  fs.copyFileSync(src, dst);
  try {
    fs.chmodSync(dst, 0o755);
  } catch {
    /* windows */
  }
  console.log(`[bundle-binaries] ${src} -> ${dst}`);
}

// ffmpeg is downloaded explicitly per target platform below, mirroring the
// yt-dlp / deno pattern. We do NOT rely on the ffmpeg-static npm package
// resolving to the correct arch, because it caches whichever binary was
// installed on the host and has silently shipped wrong-arch builds before.

// -------- HTTP download helper (follows redirects) --------
function download(url, destPath) {
  return new Promise((resolve, reject) => {
    // The write stream is opened only once a 200 is in hand. Opening it up
    // front truncates whatever is already at destPath, so a failed fetch used
    // to replace a good binary with a zero-byte file before anyone saw the
    // status code — the build then exits non-zero but leaves the husk behind
    // for a later packaging step to pick up.
    const req = (u) =>
      https
        .get(u, { headers: { "User-Agent": "yt-clipper-bundler" } }, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            return req(new URL(res.headers.location, u).toString());
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`GET ${u} → ${res.statusCode}`));
            return;
          }
          const file = fs.createWriteStream(destPath);
          file.on("error", reject);
          res.on("error", reject);
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve()));
        })
        .on("error", reject);
    req(url);
  });
}

// -------- Platform-arch guard --------
// Assert the file at `p` is a native executable for the current platform.
// Fails loudly (throws) so a wrong-arch binary can never ship silently.
function assertPlatformExecutable(p, label) {
  // Read enough header for PE lookups (PE offset lives at 0x3C, then +24
  // bytes to the machine field of the optional header — 512 is plenty).
  const fd = fs.openSync(p, "r");
  const head = Buffer.alloc(512);
  const read = fs.readSync(fd, head, 0, 512, 0);
  fs.closeSync(fd);

  const wantArch = arch === "arm64" ? "arm64" : "x64";
  let container = null;
  let detectedArch = null;

  if (platform === "linux") {
    // ELF: 7f 45 4c 46, then e_machine at offset 0x12 (2 bytes LE)
    if (head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) {
      container = "ELF";
      const eMachine = head.readUInt16LE(0x12);
      if (eMachine === 0x3e) detectedArch = "x64"; // EM_X86_64
      else if (eMachine === 0xb7) detectedArch = "arm64"; // EM_AARCH64
      else detectedArch = `elf-machine-0x${eMachine.toString(16)}`;
    }
  } else if (platform === "darwin") {
    // Universal / fat: accept as-is (contains all arches).
    const isFat =
      (head[0] === 0xca && head[1] === 0xfe && head[2] === 0xba && head[3] === 0xbe) ||
      (head[0] === 0xbe && head[1] === 0xba && head[2] === 0xfe && head[3] === 0xca);
    if (isFat) {
      container = "Mach-O (universal)";
      detectedArch = wantArch; // universal → treat as satisfying any arch
    } else if (head[0] === 0xcf && head[1] === 0xfa && head[2] === 0xed && head[3] === 0xfe) {
      // Thin 64-bit LE Mach-O; cputype is uint32 LE at offset 4.
      container = "Mach-O";
      const cputype = head.readUInt32LE(4);
      if (cputype === 0x01000007) detectedArch = "x64"; // CPU_TYPE_X86_64
      else if (cputype === 0x0100000c) detectedArch = "arm64"; // CPU_TYPE_ARM64
      else detectedArch = `macho-cputype-0x${cputype.toString(16)}`;
    }
  } else if (platform === "win32") {
    // PE: 'MZ' at 0, e_lfanew (uint32 LE) at 0x3C points to 'PE\0\0' + COFF header.
    // COFF Machine field is the 2 bytes immediately after 'PE\0\0'.
    if (head[0] === 0x4d && head[1] === 0x5a) {
      container = "PE";
      const peOff = head.readUInt32LE(0x3c);
      if (peOff + 6 <= read && head[peOff] === 0x50 && head[peOff + 1] === 0x45) {
        const machine = head.readUInt16LE(peOff + 4);
        if (machine === 0x8664) detectedArch = "x64"; // IMAGE_FILE_MACHINE_AMD64
        else if (machine === 0xaa64) detectedArch = "arm64"; // IMAGE_FILE_MACHINE_ARM64
        else detectedArch = `pe-machine-0x${machine.toString(16)}`;
      } else {
        detectedArch = "pe-header-missing";
      }
    }
  }

  if (!container) {
    throw new Error(
      `[bundle-binaries] ${label} at ${p} is not a native ${platform} executable ` +
        `(magic=${head.slice(0, 4).toString("hex")}). Refusing to bundle.`,
    );
  }
  if (detectedArch !== wantArch) {
    throw new Error(
      `[bundle-binaries] ${label} at ${p} is ${container} for arch=${detectedArch}, ` +
        `but this runner is ${platform}/${wantArch}. Refusing to bundle a wrong-arch binary.`,
    );
  }
  console.log(
    `[bundle-binaries] verified ${label}: ${container} ${detectedArch} for ${platform}/${wantArch}`,
  );
}

function cached(name, urlFactory, install) {
  const marker = path.join(cacheDir, `${name}.ok`);
  const dst = path.join(outDir, name);
  if (fs.existsSync(marker) && fs.existsSync(dst)) {
    console.log(`[bundle-binaries] ${name} cached`);
    return Promise.resolve();
  }
  return install(urlFactory()).then(() => {
    fs.writeFileSync(marker, new Date().toISOString());
  });
}

// -------- yt-dlp: fetch latest release binary --------
// We track the NIGHTLY channel, not stable. YouTube breaks extraction roughly
// monthly and yt-dlp's stable tags trail the fix by weeks: as of 2026-10-14
// stable is 2026.08.19 while nightly is 2026.10.10.233141, an eight-week gap
// that predates tv_samsung becoming a default player client (the 1080p
// regression) and the UNPLAYABLE fixes for #17389 / #17788. Upstream's own
// standing answer on those issues is `yt-dlp --update-to nightly`, so a build
// pinned to stable ships a binary its maintainers already consider broken —
// and since we have no runtime self-update, whatever we bundle is what users
// are stuck with until the next release.
//
// Nightly lives in a separate repo but publishes identical asset names, so
// only the repo changes. Set YTDLP_CHANNEL=stable to pin a release back to
// stable if a nightly is ever broken; that is a deliberate opt-in, never an
// automatic fallback — silently reverting to an eight-week-old build is the
// exact failure this tracks away from.
const YTDLP_CHANNELS = {
  nightly: "yt-dlp/yt-dlp-nightly-builds",
  stable: "yt-dlp/yt-dlp",
};

// Smallest real asset is the ~3 MB Linux zipapp. download() resolves on stream
// 'finish', which also fires for a connection dropped mid-transfer, so without
// a floor a truncated fetch would pass as success and ship a corrupt binary.
const YTDLP_MIN_BYTES = 1_000_000;

async function bundleYtDlp() {
  const channel = process.env.YTDLP_CHANNEL || "nightly";
  const repo = YTDLP_CHANNELS[channel];
  if (!repo) {
    throw new Error(
      `YTDLP_CHANNEL="${channel}" is not a known channel ` +
        `(${Object.keys(YTDLP_CHANNELS).join(" | ")}). Refusing to guess.`,
    );
  }

  const assetName =
    platform === "win32"
      ? "yt-dlp.exe"
      : platform === "darwin"
        ? "yt-dlp_macos"
        : "yt-dlp";
  const outName = platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const url = `https://github.com/${repo}/releases/latest/download/${assetName}`;
  const dst = path.join(outDir, outName);
  // Fetch beside the target and move it into place only once the download
  // succeeded. download() opens its write stream before it has seen the status
  // code, so fetching straight to dst would truncate a previously-good binary
  // to zero bytes on a 404 and leave that husk behind for electron-builder.
  const tmp = `${dst}.download`;

  console.log(`[bundle-binaries] downloading yt-dlp (${channel}): ${url}`);
  try {
    await download(url, tmp);
    const bytes = fs.statSync(tmp).size;
    if (bytes < YTDLP_MIN_BYTES) {
      throw new Error(
        `yt-dlp (${channel}) downloaded only ${bytes} bytes from ${url} — ` +
          `truncated or an error page. Refusing to bundle.`,
      );
    }
    try {
      fs.rmSync(dst, { force: true }); // win32 rename won't clobber
    } catch {
      /* fall through to rename, which fails loudly if dst is really stuck */
    }
    fs.renameSync(tmp, dst);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }

  try {
    fs.chmodSync(dst, 0o755);
  } catch {
    /* windows */
  }
  console.log(`[bundle-binaries] yt-dlp -> ${dst}`);
  reportYtDlpVersion(dst, channel);
}

// Record which yt-dlp actually shipped. The binary's own --version is ground
// truth where a release tag is only what we asked for, and it pins every
// release to an exact build — so a later "it stopped working" report can be
// matched against a known yt-dlp instead of guessed at.
function reportYtDlpVersion(binPath, channel) {
  // The Linux asset is a Python zipapp behind a `#!` shebang, so it only
  // answers on a host with python3; the macOS/Windows assets are standalone.
  let res = spawnSync(binPath, ["--version"], { encoding: "utf8" });
  if (res.error || res.status !== 0) {
    res = spawnSync("python3", [binPath, "--version"], { encoding: "utf8" });
  }
  const version = res.status === 0 ? (res.stdout || "").trim() : "";
  if (version) {
    console.log(`[bundle-binaries] yt-dlp version ${version} (${channel})`);
    // Shipped beside the binary so the app knows which version it has without running it at start-up (a Mac's first
    // run of an unsigned yt-dlp is slow, and the window waits for the main process).
    fs.writeFileSync(path.join(path.dirname(binPath), "yt-dlp.version"), `${version}\n`);
  } else {
    // Not fatal: the binary is downloaded and verified, we just can't name it
    // (a build host with no python3 can't run the zipapp). Losing the audit
    // trail shouldn't break a release, but it must not pass unnoticed either.
    console.warn(
      `[bundle-binaries] WARNING: bundled yt-dlp (${channel}) would not report ` +
        `--version on this host; shipping it without a recorded version.`,
    );
  }
}

// -------- ffmpeg: fetch static build for the current platform+arch --------
// Source: eugeneware/ffmpeg-static GitHub releases (same upstream the npm
// package uses). Assets are gzip'd single binaries named
// `ffmpeg-<platform>-<arch>[.exe].gz`.
async function bundleFfmpeg() {
  const tag = "b6.0"; // pinned static build
  let assetPlatform;
  if (platform === "darwin") assetPlatform = "darwin";
  else if (platform === "win32") assetPlatform = "win32";
  else assetPlatform = "linux";
  const assetArch = arch === "arm64" ? "arm64" : "x64";
  // NOTE: eugeneware/ffmpeg-static assets have NO ".exe" in the remote name
  // on any platform — the file is always `ffmpeg-<platform>-<arch>.gz`.
  // The local output filename still gets `.exe` on win32 below.
  const assetName = `ffmpeg-${assetPlatform}-${assetArch}.gz`;
  const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${tag}/${assetName}`;
  const gzPath = path.join(cacheDir, assetName);
  const outName = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const dst = path.join(outDir, outName);

  console.log(`[bundle-binaries] downloading ffmpeg: ${url}`);
  await download(url, gzPath);

  // gunzip → dst
  const gz = fs.readFileSync(gzPath);
  const bin = zlib.gunzipSync(gz);
  fs.writeFileSync(dst, bin);
  try {
    fs.chmodSync(dst, 0o755);
  } catch {
    /* windows */
  }
  assertPlatformExecutable(dst, "ffmpeg");
  console.log(`[bundle-binaries] ffmpeg -> ${dst}`);
}

// -------- deno: fetch latest release for yt-dlp's JS challenge solver --------
async function bundleDeno() {
  const arch = process.arch; // 'x64' | 'arm64'
  const target =
    platform === "darwin"
      ? arch === "arm64"
        ? "aarch64-apple-darwin"
        : "x86_64-apple-darwin"
      : platform === "win32"
        ? "x86_64-pc-windows-msvc"
        : arch === "arm64"
          ? "aarch64-unknown-linux-gnu"
          : "x86_64-unknown-linux-gnu";
  const zipName = `deno-${target}.zip`;
  const url = `https://github.com/denoland/deno/releases/latest/download/${zipName}`;
  const zipPath = path.join(cacheDir, zipName);
  const outName = platform === "win32" ? "deno.exe" : "deno";
  const dst = path.join(outDir, outName);
  console.log(`[bundle-binaries] downloading deno: ${url}`);
  await download(url, zipPath);
  // Unzip using system tools (unzip on unix, tar/PowerShell on windows).
  const unzipRes =
    platform === "win32"
      ? spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            `Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${outDir}'`,
          ],
          { stdio: "inherit" },
        )
      : spawnSync("unzip", ["-o", "-q", zipPath, "-d", outDir], {
          stdio: "inherit",
        });
  if (unzipRes.status !== 0) {
    throw new Error(`Failed to unzip deno (${unzipRes.status})`);
  }
  try {
    fs.chmodSync(dst, 0o755);
  } catch {
    /* windows */
  }
  console.log(`[bundle-binaries] deno -> ${dst}`);
}

// -------- PO token provider: build bgutil-ytdlp-pot-provider from source --------
// Never run as part of an ordinary build (see the main() guard below): this clones and compiles
// GPL-3.0 code (see docs/pot-provider.md), which this project has not yet cleared with Liam to
// ship. It only runs when explicitly asked for with `--pot`, and even then refuses without
// POT_PROVIDER_LICENSE_ACK=1. Output goes to resources/pot-provider/, which is gitignored: it is
// never committed to this repo, and the download path (potTokenProvider.ts) only uses it once this
// has actually been run on the machine building the release.
const POT_PROVIDER_REPO = "https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git";
// Pin a tag rather than tracking a moving branch, so "the monthly refresh" is a deliberate,
// reviewable version bump (edit this line) rather than whatever happens to be on master that day.
const POT_PROVIDER_REF = process.env.POT_PROVIDER_REF || "2.0.2";

async function bundlePotProvider() {
  if (process.env.POT_PROVIDER_LICENSE_ACK !== "1") {
    throw new Error(
      "Refusing to build the PO token provider: set POT_PROVIDER_LICENSE_ACK=1 once the GPL-3.0 " +
        "bundling question has been cleared (see docs/pot-provider.md). Nothing else here runs " +
        "without that — this command is the one place that gate lives.",
    );
  }
  const vendorDir = path.join(__dirname, "..", "resources", "pot-provider");
  const cloneDir = path.join(cacheDir, "bgutil-src");
  fs.rmSync(cloneDir, { recursive: true, force: true });
  console.log(`[bundle-binaries] cloning bgutil-ytdlp-pot-provider @ ${POT_PROVIDER_REF}`);
  let res = spawnSync(
    "git",
    ["clone", "--depth", "1", "--branch", POT_PROVIDER_REF, POT_PROVIDER_REPO, cloneDir],
    { stdio: "inherit" },
  );
  if (res.status !== 0) {
    throw new Error(`git clone of the PO token provider failed (${res.status})`);
  }
  const serverDir = path.join(cloneDir, "server");
  res = spawnSync("npm", ["ci"], { cwd: serverDir, stdio: "inherit", shell: platform === "win32" });
  if (res.status !== 0) throw new Error(`npm ci failed in ${serverDir} (${res.status})`);
  res = spawnSync("npx", ["tsc"], { cwd: serverDir, stdio: "inherit", shell: platform === "win32" });
  if (res.status !== 0) throw new Error(`npx tsc failed in ${serverDir} (${res.status})`);
  // Only runtime deps are needed from here; typescript, @types/*, etc. nearly triples the folder
  // size for nothing this process ever runs.
  res = spawnSync("npm", ["prune", "--omit=dev"], { cwd: serverDir, stdio: "inherit", shell: platform === "win32" });
  if (res.status !== 0) throw new Error(`npm prune failed in ${serverDir} (${res.status})`);

  // main.js is not self-contained: it imports sibling files under build/ and, via plain Node-style
  // specifiers, the node_modules beside it (confirmed by actually running the vendored build — see
  // potTokenProvider.ts and docs/pot-provider.md). Both are copied whole, not cherry-picked.
  const builtDir = path.join(serverDir, "build");
  const builtEntry = path.join(builtDir, "main.js");
  if (!fs.existsSync(builtEntry)) {
    throw new Error(`Expected ${builtEntry} after the build but it is not there.`);
  }
  fs.rmSync(vendorDir, { recursive: true, force: true });
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.cpSync(builtDir, path.join(vendorDir, "build"), {
    recursive: true,
    // .map files point back at this build host's absolute paths and are never read at runtime.
    filter: (src) => !src.endsWith(".map"),
  });
  fs.cpSync(path.join(serverDir, "node_modules"), path.join(vendorDir, "node_modules"), { recursive: true });
  fs.writeFileSync(path.join(vendorDir, "pot-provider.version"), `${POT_PROVIDER_REF}\n`);
  console.log(`[bundle-binaries] PO token provider ${POT_PROVIDER_REF} -> ${vendorDir}`);
  await smokeTestPotProvider(path.join(vendorDir, "build", "main.js"));
  console.log(
    `[bundle-binaries] NOT verified: that the \`canvas\` native dependency has a prebuilt binary ` +
      `on any OTHER platform than this one (${platform}/${arch}) — this command has to be run again, ` +
      "separately, on each platform's own build host; copying this folder between platforms will " +
      "not work for a native module.",
  );
}

/** Actually starts the vendored server and confirms it answers, rather than trusting the build to have worked. */
async function smokeTestPotProvider(entry) {
  const deno = path.join(outDir, process.platform === "win32" ? "deno.exe" : "deno");
  if (!fs.existsSync(deno)) {
    console.warn("[bundle-binaries] WARNING: no bundled deno to smoke-test the PO token provider with — skipping.");
    return;
  }
  const port = 14400 + Math.floor(Math.random() * 1000);
  const { spawn: spawnProc } = require("node:child_process");
  const proc = spawnProc(
    deno,
    ["run", "--allow-net", "--allow-env", "--allow-read", entry, "--port", String(port), "--host", "127.0.0.1"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const deadline = Date.now() + 10_000;
  try {
    while (Date.now() < deadline) {
      const ok = await new Promise((resolve) => {
        const req = require("node:http").get({ host: "127.0.0.1", port, path: "/ping", timeout: 1000 }, (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        });
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });
      });
      if (ok) {
        console.log(`[bundle-binaries] PO token provider smoke test: answered /ping on 127.0.0.1:${port}`);
        return;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error("the vendored PO token provider never answered /ping within 10s");
  } finally {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
  }
}

(async () => {
  try {
    if (process.argv.includes("--pot")) {
      // A separate, explicit mode: `node scripts/bundle-binaries.cjs --pot` only builds the PO
      // token provider, never yt-dlp/ffmpeg/deno, so running it can't accidentally touch the
      // binaries an ordinary build already refreshes.
      await bundlePotProvider();
      console.log("[bundle-binaries] done (--pot)");
      return;
    }
    await cached(
      platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
      () => null,
      bundleFfmpeg,
    );
    // yt-dlp is NOT cached: YouTube changes often and a stale binary is the
    // most common cause of download failures, so always fetch the latest.
    await bundleYtDlp();
    await cached(
      platform === "win32" ? "deno.exe" : "deno",
      () => null,
      bundleDeno,
    );
    // (ffmpeg is arch-verified inside bundleFfmpeg. yt-dlp on Linux is a
    // Python zipapp with a `#!` shebang — not an ELF — so we don't run the
    // native-executable check on it.)
    console.log("[bundle-binaries] done");
  } catch (err) {
    console.error("[bundle-binaries] failed:", err.message || err);
    process.exit(1);
  }
})();