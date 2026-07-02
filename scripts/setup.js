// scripts/setup.js — verifies yt-dlp + ffmpeg, guides per-OS if missing
import { execSync } from 'node:child_process'
import ffmpegStatic from 'ffmpeg-static'
import { existsSync } from 'node:fs'

const platform = process.platform // 'darwin' | 'win32' | 'linux'

const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`)
const bad = (m) => console.log(`\x1b[31m✗\x1b[0m ${m}`)

function has(cmd) {
  try {
    execSync(platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`, {
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

const installHints = {
  'yt-dlp': {
    darwin: 'brew install yt-dlp',
    win32: 'winget install yt-dlp.yt-dlp   (or: scoop install yt-dlp)',
    linux: 'sudo apt install yt-dlp   (or: pipx install yt-dlp)',
  },
}

let allGood = true

// ffmpeg: bundled via ffmpeg-static, just confirm the binary resolved
if (ffmpegStatic && existsSync(ffmpegStatic)) {
  ok('ffmpeg (bundled)')
} else if (has('ffmpeg')) {
  ok('ffmpeg (system)')
} else {
  allGood = false
  bad('ffmpeg not found')
  const hints = {
    darwin: 'brew install ffmpeg',
    win32: 'winget install Gyan.FFmpeg',
    linux: 'sudo apt install ffmpeg',
  }
  console.log(`  Install: ${hints[platform] ?? 'see https://ffmpeg.org/download.html'}`)
}

// yt-dlp: youtube-dl-exec tries to bundle it, but verify + fall back to system
if (has('yt-dlp')) {
  ok('yt-dlp')
} else {
  allGood = false
  bad('yt-dlp not found (bundled download may have failed)')
  console.log(`  Install: ${installHints['yt-dlp'][platform] ?? 'https://github.com/yt-dlp/yt-dlp/wiki/Installation'}`)
  console.log('  Or retry the bundle: npm install --foreground-scripts')
}

if (allGood) {
  ok('All set — run `npm run dev` to start.')
} else {
  console.log('\n\x1b[33mInstall the missing tool(s) above, then run `npm run setup` to re-check.\x1b[0m')
  // Do NOT exit non-zero on postinstall — that would fail `npm install` entirely.
}
