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
  const fd = fs.openSync(p, "r");
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);

  let ok = false;
  let detected = buf.toString("hex");
  if (platform === "linux") {
    // ELF: 7f 45 4c 46
    ok = buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46;
    detected = ok ? "ELF" : detected;
  } else if (platform === "darwin") {
    // Mach-O 64-bit LE (cf fa ed fe) or universal fat (ca fe ba be / be ba fe ca)
    ok =
      (buf[0] === 0xcf && buf[1] === 0xfa && buf[2] === 0xed && buf[3] === 0xfe) ||
      (buf[0] === 0xca && buf[1] === 0xfe && buf[2] === 0xba && buf[3] === 0xbe) ||
      (buf[0] === 0xbe && buf[1] === 0xba && buf[2] === 0xfe && buf[3] === 0xca);
    detected = ok ? "Mach-O" : detected;
  } else if (platform === "win32") {
    // PE: 'MZ' (4d 5a)
    ok = buf[0] === 0x4d && buf[1] === 0x5a;
    detected = ok ? "PE" : detected;
  }
  if (!ok) {
    throw new Error(
      `[bundle-binaries] ${label} at ${p} is not a native ${platform}/${arch} executable ` +
        `(magic=${detected}). Refusing to bundle a wrong-arch binary.`,
    );
  }
  console.log(`[bundle-binaries] verified ${label} is ${detected} for ${platform}/${arch}`);
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
  const exeSuffix = platform === "win32" ? ".exe" : "";
  const assetName = `ffmpeg-${assetPlatform}-${assetArch}${exeSuffix}.gz`;
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
    // Final belt-and-braces verification of every bundled binary.
    for (const name of [
      platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
      platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
      platform === "win32" ? "deno.exe" : "deno",
    ]) {
      assertPlatformExecutable(path.join(outDir, name), name);
    }
    console.log("[bundle-binaries] done");
  } catch (err) {
    console.error("[bundle-binaries] failed:", err.message || err);
    process.exit(1);
  }
})();