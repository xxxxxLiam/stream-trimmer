#!/usr/bin/env node
/**
 * G area, audit-only. Builds a stub root from the shared harness stub and then
 * adds two observation points the shared stub does not have, because area G has
 * to prove how arguments reach the child and what the child does to the cookie
 * file it was handed:
 *
 *   1. argv.log  — one JSON line per invocation: the exact argv array, cwd and
 *      the value of every flag. This is what proves spawn-array vs shell.
 *   2. cookie write-back — real yt-dlp calls YoutubeDL.save_cookies() on close
 *      whenever --cookies was given, rewriting that file. The shared stub does
 *      not, so the clobber hazard cannot be observed with it. With
 *      stub.json.cookieWriteBack set, the stub writes that text to whatever
 *      path it was given as --cookies, which is exactly what real yt-dlp does.
 *
 * Usage: node mk-gstub.cjs <rootDir>
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REPO = "/home/user/stream-trimmer";
const root = path.resolve(process.argv[2] || "");
if (!root) { console.error("usage: mk-gstub.cjs <rootDir>"); process.exit(2); }

fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });
execFileSync("node", [path.join(REPO, "audit", "harness", "make-stub-root.cjs"), root], { stdio: "inherit" });
fs.copyFileSync(path.join(REPO, "audit", "fixtures", "fixture.mp4"), path.join(root, "fixture.mp4"));

const binPath = path.join(root, "resources", "bin", "yt-dlp");
let src = fs.readFileSync(binPath, "utf8");

const OBSERVE = `
// --- area-G observation points (audit) -----------------------------------
const __root = path.join(__dirname, "..", "..");
try {
  fs.appendFileSync(path.join(__root, "argv.log"), JSON.stringify({
    t: Date.now(), pid: process.pid, cwd: process.cwd(), argv: process.argv.slice(2),
  }) + "\\n");
} catch {}
// Real yt-dlp rewrites the jar it was given on close (YoutubeDL.save_cookies).
function __saveCookies() {
  if (!cfg.cookieWriteBack) return;
  const i = argv.indexOf("--cookies");
  if (i < 0) return;
  const file = argv[i + 1];
  if (!file) return;
  try {
    const delay = Number(cfg.cookieWriteDelayMs || 0);
    const text = String(cfg.cookieWriteBack).replace("%PID%", String(process.pid));
    if (delay > 0) {
      // Write in two halves with a pause between, the way a real save that is
      // interrupted or interleaved with another process looks on disk.
      fs.writeFileSync(file, text.slice(0, Math.floor(text.length / 2)));
      const until = Date.now() + delay;
      while (Date.now() < until) { /* spin: keeps the half-written window open */ }
      fs.appendFileSync(file, text.slice(Math.floor(text.length / 2)));
    } else {
      fs.writeFileSync(file, text);
    }
    fs.appendFileSync(path.join(__root, "cookiewrite.log"),
      JSON.stringify({ pid: process.pid, file, bytes: text.length }) + "\\n");
  } catch (e) {
    try { fs.appendFileSync(path.join(__root, "cookiewrite.log"),
      JSON.stringify({ pid: process.pid, error: String(e.message) }) + "\\n"); } catch {}
  }
}
process.on("exit", __saveCookies);

// The shared stub checks cfg.exitCode before it answers --version, so setting
// it makes the version probe fail too and server/index.ts then prefers a
// SYSTEM yt-dlp (which would reach the network). These flags fail only the
// invocations a test means to fail, leaving --version answerable.
{
  const isVersion = argv.includes("--version");
  const isJson = argv.includes("-J") || argv.includes("--dump-json") || argv.includes("--dump-single-json");
  const isDownload = !isVersion && !isJson;
  const code = (isJson && cfg.failJson) || (isDownload && cfg.failDownload) || 0;
  if (code) {
    if (cfg.failStderr) process.stderr.write(String(cfg.failStderr) + "\\n");
    process.exit(Number(code));
  }
}
`;

// Insert right after the stub's own argv helpers are defined.
const anchor = 'const valOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };';
if (!src.includes(anchor)) { console.error("anchor not found in harness stub — refusing to patch"); process.exit(3); }
src = src.replace(anchor, anchor + "\n" + OBSERVE);
fs.writeFileSync(binPath, src);
fs.chmodSync(binPath, 0o755);
console.log(root);
