// scripts/bundle-binaries.cjs — copies ffmpeg + yt-dlp for the current
// platform into resources/bin/ so electron-builder can extraResources them
// into the packaged app. Runs before `electron-builder`.
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const platform = process.platform; // 'darwin' | 'win32' | 'linux'
const outDir = path.join(__dirname, "..", "resources", "bin");
fs.mkdirSync(outDir, { recursive: true });

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

// yt-dlp via youtube-dl-exec bundled binary, else system PATH.
function findYtDlp() {
  try {
    const mod = require("youtube-dl-exec");
    const bundled = mod.binaryPath || (mod.ytdlp && mod.ytdlp.binaryPath);
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch {
    /* ignore */
  }
  try {
    const lookup = platform === "win32" ? "where yt-dlp" : "command -v yt-dlp";
    const p = execSync(lookup).toString().trim().split("\n")[0];
    if (p && fs.existsSync(p)) return p;
  } catch {
    /* ignore */
  }
  return null;
}

const yt = findYtDlp();
if (!yt) {
  console.error(
    "yt-dlp binary not found. Install it (brew install yt-dlp / winget install yt-dlp.yt-dlp / pipx install yt-dlp) or run `npm install --foreground-scripts` to retry the bundle.",
  );
  process.exit(1);
}
copy(yt, platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

console.log("[bundle-binaries] done");