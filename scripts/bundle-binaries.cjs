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

// ffmpeg via ffmpeg-static
const ffmpegStatic = require("ffmpeg-static");
if (!ffmpegStatic || !fs.existsSync(ffmpegStatic)) {
  console.error("ffmpeg-static binary missing. Reinstall ffmpeg-static.");
  process.exit(1);
}
copy(ffmpegStatic, platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

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
      platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
      () => null,
      bundleYtDlp,
    );
    await cached(
      platform === "win32" ? "deno.exe" : "deno",
      () => null,
      bundleDeno,
    );
    console.log("[bundle-binaries] done");
  } catch (err) {
    console.error("[bundle-binaries] failed:", err.message || err);
    process.exit(1);
  }
})();