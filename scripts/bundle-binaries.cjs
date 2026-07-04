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
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

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
    const file = fs.createWriteStream(destPath);
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
            reject(new Error(`GET ${u} → ${res.statusCode}`));
            return;
          }
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
async function bundleYtDlp() {
  const assetName =
    platform === "win32"
      ? "yt-dlp.exe"
      : platform === "darwin"
        ? "yt-dlp_macos"
        : "yt-dlp";
  const outName = platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName}`;
  const dst = path.join(outDir, outName);
  console.log(`[bundle-binaries] downloading yt-dlp: ${url}`);
  await download(url, dst);
  try {
    fs.chmodSync(dst, 0o755);
  } catch {
    /* windows */
  }
  console.log(`[bundle-binaries] yt-dlp -> ${dst}`);
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

(async () => {
  try {
    await cached(
      platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
      () => null,
      bundleFfmpeg,
    );
    await cached(
      platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
      () => null,
      bundleYtDlp,
    );
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