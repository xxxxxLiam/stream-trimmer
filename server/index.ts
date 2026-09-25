/**
 * File: index.ts
 * Path: server/index.ts
 * Description: Local Express backend — /api/info, /api/download, /api/transcript.
 * Uses bundled yt-dlp (with PATH fallback) and ffmpeg-static. Runs via `tsx`.
 */
import express, { type Request, type Response } from "express";
import cors from "cors";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  execSync,
  spawn,
  spawnSync,
  type ChildProcess,
} from "node:child_process";
import { z } from "zod";
// We don't use youtube-dl-exec's runner: its underlying `tinyspawn` splits the
// binary path on spaces (breaks `/Applications/YouTube Clipper.app/...`). We
// spawn yt-dlp directly with node's child_process, and use `dargs` (already a
// transitive dep) to convert the same option-object shape into CLI flags.
import dargs from "dargs";
import ffmpegPath from "ffmpeg-static";
import {
  classifyYouTubeAuthOutput,
  type YouTubeAuthProbeStatus,
} from "./youtubeAuth";
import {
  COMMENT_COLUMNS,
  STATUS_COLUMNS,
  SUMMARY_COLUMNS,
  TRANSCRIPT_COLUMNS,
  VIDEO_COLUMNS,
  describeParts,
  writeCsv,
  writeCsvFromJsonl,
} from "./csv";
import {
  CLIP_PREFIX,
  EXPORT_PREFIX,
  appendJsonl,
  cacheUsage,
  clearCache,
  partialBytes,
  readJson,
  readJsonl,
  sweepStaleCache,
  workDir,
  writeJson,
} from "./resumeCache";


const PORT = Number(process.env.PORT || 5174);
const MAX_CLIP_SECONDS = 600;

// When running inside a packaged Electron app, binaries live under
// `<resources>/bin/`. Prefer those over the dev-time bundled/PATH locations.
function packagedBinary(name: string): string | null {
  const base = process.env.ELECTRON_RESOURCES;
  if (!base) return null;
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const candidate = path.join(base, "bin", exe);
  return fs.existsSync(candidate) ? candidate : null;
}

// Defense in depth: also prepend resources/bin to PATH here so yt-dlp's
// [jsc:deno] step can locate the bundled `deno` runtime.
if (process.env.ELECTRON_RESOURCES) {
  const binDir = path.join(process.env.ELECTRON_RESOURCES, "bin");
  const sep = process.platform === "win32" ? ";" : ":";
  const cur = process.env.PATH || "";
  if (!cur.split(sep).includes(binDir)) {
    process.env.PATH = `${binDir}${sep}${cur}`;
  }
}

// Resolve the bundled bin directory once. Packaged: <resources>/bin.
// Dev: repo `resources/bin`. Used to build an authoritative child env so
// spawned yt-dlp reliably sees `deno` for the [jsc:deno] step.
function resolveBinDir(): string | null {
  const fromMain = process.env. ELECTRON_RESOURCES_BIN;
  if (fromMain && fs.existsSync(fromMain)) return fromMain;
  if (process.env.ELECTRON_RESOURCES) {
    const p = path.join(process.env.ELECTRON_RESOURCES, "bin");
    if (fs.existsSync(p)) return p;
  }
  const devPath = path.resolve(process.cwd(), "resources", "bin");
  if (fs.existsSync(devPath)) return devPath;
  return null;
}

const BIN_DIR = resolveBinDir();

function childEnv(): NodeJS.ProcessEnv {
  const base = { ...process.env };
  if (BIN_DIR) {
    const sep = path.delimiter;
    const cur = base.PATH || "";
    const parts = cur.split(sep);
    if (!parts.includes(BIN_DIR)) {
      base.PATH = `${BIN_DIR}${sep}${cur}`;
    }
  }
  return base;
}

// Log the effective PATH prefix once so packaged-app runs are verifiable.
{
  const exe = (n: string) => (process.platform === "win32" ? `${n}.exe` : n);
  const check = (n: string) =>
    BIN_DIR && fs.existsSync(path.join(BIN_DIR, exe(n))) ? "ok" : "MISSING";
  console.log(
    `[server] binDir=${BIN_DIR ?? "(none)"} (yt-dlp=${check("yt-dlp")}, ffmpeg=${check("ffmpeg")}, deno=${check("deno")})`,
  );
  console.log(`[server] child PATH prefix=${BIN_DIR ?? "(unchanged)"}`);
}

type YtRunner = (
  url: string,
  opts: Record<string, unknown>,
  execaOpts?: Record<string, unknown>,
) => Promise<any>;
type YtExec = (
  url: string,
  opts: Record<string, unknown>,
  execaOpts?: Record<string, unknown>,
) => ChildProcess;

interface YtResolved {
  run: YtRunner;
  exec: YtExec;
  source: string;
  binary: string;
}

// Build a runner around a resolved yt-dlp binary that spawns it directly.
// This is the authoritative fix for the space-in-path spawn bug: node's
// `spawn(executable, args)` treats `executable` as an atomic path — no shell
// interpretation, no split-on-space.
function makeRunner(binary: string, source: string): YtResolved {
  const toArgs = (url: string, opts: Record<string, unknown>): string[] => {
    // dargs turns { dumpSingleJson: true, subLangs: "en" } into
    // ["--dump-single-json", "--sub-langs", "en"]. useEquals:false matches
    // yt-dlp's expected flag style.
    const flags = dargs(opts as any, { useEquals: false }).filter(Boolean);
    return [url, ...flags];
  };
  const exec: YtExec = (url, opts, execaOpts) => {
    const args = toArgs(url, opts);
    const env = (execaOpts?.env as NodeJS.ProcessEnv | undefined) ?? childEnv();
    return spawn(binary, args, {
      env,
      windowsHide: true,
      // shell:false is the default — explicit for clarity.
      shell: false,
    });
  };
  const run: YtRunner = (url, opts, execaOpts) =>
    new Promise((resolve, reject) => {
      const child = exec(url, opts, execaOpts);
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      child.stdout?.on("data", (c: Buffer) => stdoutChunks.push(c));
      child.stderr?.on("data", (c: Buffer) => stderrChunks.push(c));
      child.on("error", (err) => {
        // ENOENT / EACCES etc. from spawn itself.
        (err as any).stderr = Buffer.concat(stderrChunks).toString();
        (err as any).stdout = Buffer.concat(stdoutChunks).toString();
        (err as any).command = `${binary} ${toArgs(url, opts).join(" ")}`;
        reject(err);
      });
      child.on("close", (code, signal) => {
        const stdout = Buffer.concat(stdoutChunks).toString();
        const stderr = Buffer.concat(stderrChunks).toString();
        if (code === 0) {
          // yt-dlp with --dump-single-json prints JSON to stdout.
          try {
            resolve(
              stdout.trim().startsWith("{") ? JSON.parse(stdout) : stdout,
            );
          } catch {
            resolve(stdout);
          }
        } else {
          const err: any = new Error(stderr.trim() || `yt-dlp exited ${code}`);
          err.exitCode = code;
          err.signal = signal;
          err.stdout = stdout;
          err.stderr = stderr;
          err.command = `${binary} ${toArgs(url, opts).join(" ")}`;
          reject(err);
        }
      });
    });
  return { run, exec, source, binary };
}

// Read `yt-dlp --version` (e.g. "2026.07.04"). Null when the binary won't run.
function ytDlpVersion(binary: string): string | null {
  try {
    const out = execSync(`"${binary}" --version`, {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

// yt-dlp versions are date-based (YYYY.MM.DD[.N]) so a numeric component
// compare is a correct ordering.
function isNewer(a: string, b: string): boolean {
  const pa = a.split(/[.\-]/).map((n) => Number(n) || 0);
  const pb = b.split(/[.\-]/).map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

function systemYtDlp(): string | null {
  try {
    const lookup =
      process.platform === "win32" ? "where yt-dlp" : "command -v yt-dlp";
    const sysPath = execSync(lookup).toString().trim().split("\n")[0];
    return sysPath && fs.existsSync(sysPath) ? sysPath : null;
  } catch {
    return null;
  }
}

// Resolve yt-dlp: prefer the bundled binary, but defer to a system install when
// it reports a newer version (YouTube breaks often; a fresher binary wins).
function resolveYtDlp(): YtResolved | null {
  const packaged = packagedBinary("yt-dlp");
  const devBundled = BIN_DIR
    ? path.join(BIN_DIR, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp")
    : null;
  const bundled =
    packaged ?? (devBundled && fs.existsSync(devBundled) ? devBundled : null);
  const system = systemYtDlp();

  if (bundled && system && system !== bundled) {
    const bv = ytDlpVersion(bundled);
    const sv = ytDlpVersion(system);
    if (sv && (!bv || isNewer(sv, bv))) {
      console.log(
        `[server] system yt-dlp ${sv} is newer than bundled ${bv ?? "(unknown)"} — using system binary`,
      );
      return makeRunner(system, `system (${system})`);
    }
  }
  if (bundled) {
    const label = packaged ? "packaged" : "bundled";
    return makeRunner(bundled, `${label} (${bundled})`);
  }
  if (system) return makeRunner(system, `system (${system})`);
  return null;
}

const yt = resolveYtDlp();
const packagedFfmpeg = packagedBinary("ffmpeg");
const resolvedFfmpeg = packagedFfmpeg || ffmpegPath;
const ffmpegOk = Boolean(resolvedFfmpeg && fs.existsSync(resolvedFfmpeg));

// Read the actual video height / audio bitrate of a produced file by parsing
// `ffmpeg -i <file>` stream info (ffprobe is not part of the bundled binaries).
function probeDelivered(
  filePath: string,
  ffmpegBin: string,
): { height?: number; audioKbps?: number } {
  try {
    const out = spawnSync(ffmpegBin, ["-hide_banner", "-i", filePath], {
      encoding: "utf8",
      windowsHide: true,
    });
    const text = `${out.stderr ?? ""}${out.stdout ?? ""}`;
    const video = text.match(/Video:.*?,\s*(\d{2,5})x(\d{2,5})/);
    const audio = text.match(/Audio:[^\n]*?,\s*(\d+)\s*kb\/s/);
    return {
      height: video ? Number(video[2]) : undefined,
      audioKbps: audio ? Number(audio[1]) : undefined,
    };
  } catch {
    return {};
  }
}

function preflight(): boolean {
  const problems: string[] = [];
  if (!yt) problems.push("yt-dlp");
  if (!ffmpegOk) problems.push("ffmpeg");

  if (problems.length === 0) {
    console.log(`[server] yt-dlp ready: ${yt!.source}`);
    console.log(`[server] ffmpeg ready: ${resolvedFfmpeg}`);
    return true;
  }

  console.error(`[server] Missing binaries: ${problems.join(", ")}`);
  const platform = process.platform;
  const hints: Record<string, Record<string, string>> = {
    "yt-dlp": {
      darwin: "brew install yt-dlp",
      win32: "winget install yt-dlp.yt-dlp   (or: scoop install yt-dlp)",
      linux: "sudo apt install yt-dlp   (or: pipx install yt-dlp)",
    },
    ffmpeg: {
      darwin: "brew install ffmpeg",
      win32: "winget install Gyan.FFmpeg",
      linux: "sudo apt install ffmpeg",
    },
  };
  for (const p of problems) {
    const hint = hints[p]?.[platform] ?? `see the ${p} install docs`;
    console.error(`[server]   ${p}: ${hint}`);
  }
  console.error(
    "[server] Install the tool(s) above, then run `npm run setup` to re-check.",
  );
  return false;
}

const binariesOk = preflight();

const urlSchema = z
  .string()
  .url()
  .refine((v) => /youtube\.com|youtu\.be/.test(v), "URL must be a YouTube link");

const infoSchema = z.object({ url: urlSchema });

// Browsers yt-dlp can read a logged-in YouTube session from. Only the browser
// name ever crosses the API; cookie contents never touch this process.
const cookieBrowserSchema = z.enum([
  "chrome",
  "safari",
  "edge",
  "firefox",
  "brave",
  "chromium",
]);

// "app" = the session the user signed into inside the app. The cookie file
// path is never accepted from the client; it is resolved here from the path
// Electron hands the server at startup.
const authSourceSchema = z.union([z.literal("app"), cookieBrowserSchema]);

export function appCookieFile(): string | null {
  const target = process.env.YT_CLIPPER_COOKIE_FILE;
  if (!target) return null;
  try {
    return fs.existsSync(target) ? target : null;
  } catch {
    return null;
  }
}

export function resolveCookieOptions(
  source: string | undefined,
): Record<string, unknown> {
  if (source === "app") {
    const file = appCookieFile();
    return file ? { cookies: file } : {};
  }
  if (source) return { cookiesFromBrowser: source };
  return {};
}

const downloadSchema = z
  .object({
    url: urlSchema,
    start: z.number().nonnegative(),
    end: z.number().positive(),
    format: z.enum(["mp4", "mp3"]).default("mp4"),
    quality: z.string().default("best"),
    // How the finished clip is handed back. "stream" sends the media as the
    // response body. "path" returns only its location on disk, for the
    // desktop app, whose main process can move the file itself — the media
    // then never travels through the UI at all.
    deliver: z.enum(["stream", "path"]).default("stream"),
    // Optional sign-in path. "app" uses the session the user signed into
    // inside the app; a browser name lets yt-dlp read that browser's session.
    // Cookie contents never cross the API — only the source label.
    cookiesFromBrowser: authSourceSchema.optional(),
  })
  .refine((v) => v.end > v.start, { message: "End must be greater than start" })
  .refine((v) => v.end - v.start <= MAX_CLIP_SECONDS, {
    message: `Clip length capped at ${MAX_CLIP_SECONDS} seconds (10 minutes)`,
  });

type DownloadInput = z.infer<typeof downloadSchema>;


const app = express();
app.use(cors());
app.use(express.json());

// When packaged inside Electron, this same server also serves the built UI so
// the window loads over http://127.0.0.1 instead of file://. A real origin is
// required for the YouTube embed to render at all.
const uiDir = process.env.ELECTRON_UI_DIR;
if (uiDir && fs.existsSync(uiDir)) {
  app.use(express.static(uiDir));
  console.log(`[server] serving UI from ${uiDir}`);
}

function binaryError(res: Response) {
  return res.status(500).json({
    error:
      "yt-dlp or ffmpeg not available. Check the server console for the install command, then run `npm run setup`.",
  });
}

interface VttLine {
  start: number;
  end: number;
  text: string;
}

function parseVtt(raw: string): VttLine[] {
  const lines: VttLine[] = [];
  const blocks = raw.replace(/\r/g, "").split("\n\n");
  const tc =
    /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
  const toSec = (h: number, m: number, s: number) => h * 3600 + m * 60 + s;
  for (const block of blocks) {
    const rows = block.split("\n");
    const timing = rows.find((r) => tc.test(r));
    if (!timing) continue;
    const m = timing.match(tc)!;
    const start = toSec(+m[1], +m[2], +m[3]);
    const end = toSec(+m[5], +m[6], +m[7]);
    const text = rows
      .filter((r) => !tc.test(r) && r.trim() && !/^\d+$/.test(r) && r !== "WEBVTT")
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (text) lines.push({ start, end, text });
  }
  return lines.filter((l, i) => i === 0 || l.text !== lines[i - 1].text);
}

function errMessage(e: unknown): string {
  const anyE = e as { stderr?: string; message?: string } | null;
  return (anyE?.stderr || anyE?.message || "").toString().trim();
}

// yt-dlp signals an unreadable cookie database in a handful of phrasings; all
// of them mention the cookie source. Matched on the message only — never the
// cookie values, which yt-dlp reads internally and never emits.
function isCookieError(e: unknown): boolean {
  const text = errMessage(e).toLowerCase();
  if (!text) return false;
  return (
    text.includes("could not find") && text.includes("cookies") ||
    text.includes("failed to decrypt") ||
    text.includes("unsupported browser") ||
    // yt-dlp's Safari cookie reader emits this on non-macOS platforms.
    text.includes("unsupported platform") ||
    text.includes("cookie database") ||
    (text.includes("cookies") &&
      (text.includes("permission denied") ||
        text.includes("no such file") ||
        text.includes("is locked") ||
        text.includes("database is locked")))
  );
}

function cookieErrorMessage(browser: string): string {
  if (browser === "app")
    return "Your in-app YouTube sign-in is no longer valid. Sign in again from the YouTube button.";
  return `Couldn't read ${browser}'s cookies. The browser may need to be fully closed, or that profile isn't supported. You can turn sign-in off and retry for standard quality.`;
}

// Log every field execa/youtube-dl-exec typically attaches, plus context
// about what we invoked, so the real failure is visible in the server log.
function logYtError(
  where: string,
  url: string,
  options: Record<string, unknown>,
  e: unknown,
): void {
  const anyE = (e ?? {}) as {
    stderr?: string;
    stdout?: string;
    message?: string;
    shortMessage?: string;
    exitCode?: number;
    signal?: string;
    command?: string;
    escapedCommand?: string;
    failed?: boolean;
    timedOut?: boolean;
    killed?: boolean;
  };
  console.error(`[server] ${where} FAILED`);
  console.error(`[server]   url=${url}`);
  console.error(`[server]   binary=${yt?.source ?? "(unresolved)"}`);
  console.error(`[server]   binDir=${BIN_DIR ?? "(none)"}`);
  try {
    console.error(`[server]   options=${JSON.stringify(options)}`);
  } catch {
    console.error(`[server]   options=(unserializable)`);
  }
  if (anyE.command) console.error(`[server]   command=${anyE.command}`);
  if (anyE.escapedCommand)
    console.error(`[server]   escapedCommand=${anyE.escapedCommand}`);
  if (typeof anyE.exitCode === "number")
    console.error(`[server]   exitCode=${anyE.exitCode}`);
  if (anyE.signal) console.error(`[server]   signal=${anyE.signal}`);
  if (anyE.shortMessage)
    console.error(`[server]   shortMessage=${anyE.shortMessage}`);
  if (anyE.message) console.error(`[server]   message=${anyE.message}`);
  if (anyE.stdout) console.error(`[server]   stdout:\n${anyE.stdout}`);
  if (anyE.stderr) console.error(`[server]   stderr:\n${anyE.stderr}`);
  console.error(`[server]   raw:`, e);
}

function fullErrMessage(e: unknown): string {
  const anyE = (e ?? {}) as {
    stderr?: string;
    stdout?: string;
    shortMessage?: string;
    message?: string;
    exitCode?: number;
  };
  const parts: string[] = [];
  if (anyE.stderr?.trim()) parts.push(anyE.stderr.trim());
  if (
    anyE.shortMessage?.trim() &&
    !parts.join("\n").includes(anyE.shortMessage.trim())
  )
    parts.push(anyE.shortMessage.trim());
  if (anyE.message?.trim() && !parts.join("\n").includes(anyE.message.trim()))
    parts.push(anyE.message.trim());
  if (anyE.stdout?.trim()) parts.push(`stdout: ${anyE.stdout.trim()}`);
  if (typeof anyE.exitCode === "number")
    parts.push(`exitCode=${anyE.exitCode}`);
  const combined = parts.join("\n").trim();
  return combined || "yt-dlp failed (no error output captured)";
}

// Per-quality bitrate (kbps) estimates used by the client for size estimation.
// For MP4: pick best video format ≤ height cap, add best audio tbr.
// For MP3: fixed by target bitrate (yt-dlp -x transcodes to this).
// Fallback: overall filesize_approx ÷ duration.
interface YtFormat {
  vcodec?: string;
  acodec?: string;
  height?: number | null;
  tbr?: number | null;
  abr?: number | null;
  vbr?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
}

function computeBitrates(info: {
  formats?: YtFormat[];
  duration?: number;
  filesize_approx?: number | null;
}) {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const duration = Number(info.duration) || 0;

  const videoFormats = formats.filter(
    (f) => f.vcodec && f.vcodec !== "none" && (f.height ?? 0) > 0,
  );
  const audioFormats = formats.filter(
    (f) => f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none"),
  );

  const bestAudioTbr =
    audioFormats
      .map((f) => f.abr ?? f.tbr ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => b - a)[0] ?? 128;

  function videoTbrAtOrBelow(cap: number | null): number {
    const pool = videoFormats.filter((f) =>
      cap == null ? true : (f.height ?? 0) <= cap,
    );
    const tbr = pool
      .map((f) => f.vbr ?? f.tbr ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => b - a)[0];
    return tbr ?? 0;
  }

  const caps: Record<string, number | null> = {
    best: null,
    "1080": 1080,
    "720": 720,
    "480": 480,
    "360": 360,
  };

  const fallbackTotal =
    duration > 0 && info.filesize_approx
      ? (info.filesize_approx * 8) / 1000 / duration
      : 0;

  const mp4: Record<string, number> = {};
  for (const [key, cap] of Object.entries(caps)) {
    const v = videoTbrAtOrBelow(cap);
    const total = v > 0 ? v + bestAudioTbr : fallbackTotal;
    if (total > 0) mp4[key] = Math.round(total);
  }

  const mp3: Record<string, number> = { "320": 320, "192": 192, "128": 128 };

  return { mp4, mp3 };
}

app.post("/api/info", async (req: Request, res: Response) => {
  const parsed = infoSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  const options: Record<string, unknown> = {
    dumpSingleJson: true,
    noWarnings: true,
    noPlaylist: true,
  };
  try {
    console.log(
      `[server] /api/info url=${parsed.data.url} options=${JSON.stringify(options)}`,
    );
    const info = await yt!.run(parsed.data.url, options, {
      env: childEnv(),
    } as any);
    res.json({
      id: info.id,
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
      bitrates: computeBitrates(info),
    });
  } catch (e) {
    logYtError("/api/info", parsed.data.url, options, e);
    res.status(400).json({ error: fullErrMessage(e) });
  }
});

app.post("/api/transcript", async (req: Request, res: Response) => {
  const parsed = infoSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yttxt-"));
  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  const options: Record<string, unknown> = {
    skipDownload: true,
    writeAutoSubs: true,
    writeSubs: true,
    subLangs: "en",
    subFormat: "vtt",
    noPlaylist: true,
    noWarnings: true,
    output: path.join(tempDir, "sub"),
    ffmpegLocation: resolvedFfmpeg,
  };
  try {
    console.log(
      `[server] /api/transcript url=${parsed.data.url} options=${JSON.stringify(options)}`,
    );
    await yt!.run(parsed.data.url, options, { env: childEnv() } as any);

    const files = fs.readdirSync(tempDir);
    console.log("[server] transcript files:", files);

    const vtt =
      files.find((f) => /\.en\.vtt$/.test(f)) ||
      files.find((f) => f.endsWith(".vtt"));

    if (!vtt) {
      cleanup();
      return res.json({ lines: [], available: false });
    }

    const raw = fs.readFileSync(path.join(tempDir, vtt), "utf8");
    cleanup();

    const lines = parseVtt(raw);
    res.json({ lines, available: lines.length > 0 });
  } catch (e) {
    logYtError("/api/transcript", parsed.data.url, options, e);
    cleanup();
    res.json({ lines: [], available: false, note: fullErrMessage(e) });
  }
});

// Probe whether yt-dlp can find YouTube account cookies in one explicitly
// selected browser. YouTube does not redirect back to this local app, so this
// checks the browser cookie store directly and returns only sanitized status.
type CookieBrowserName = z.infer<typeof cookieBrowserSchema>;

// A full yt-dlp extraction can involve a JS challenge solved through the
// bundled deno, which comfortably exceeds 15s on a cold run or a slow link.
// Timing out there reports a perfectly good session as unverified, so the
// ceiling sits well above the slow case; callers cap themselves above this.
const AUTH_PROBE_TIMEOUT_MS = 40_000;
// More than one, because the probe proves a sign-in by fetching a video and
// any single video can be pulled, made private or blocked in a country. When
// that happens the fetch fails for a reason that has nothing to do with the
// user's cookies, so the probe moves to the next one rather than calling a
// perfectly good session signed-out.
const AUTH_PROBE_URLS = [
  "https://www.youtube.com/watch?v=BaW_jenozKc", // yt-dlp's own test video
  "https://www.youtube.com/watch?v=jNQXAC9IVRw", // "Me at the zoo"
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
];

type AuthSourceName = CookieBrowserName | "app";

function authProbeMessage(
  source: AuthSourceName,
  status: YouTubeAuthProbeStatus,
): string | undefined {
  if (source === "app") {
    if (status === "signed_in") return undefined;
    if (status === "probe_unavailable")
      return "YouTube wouldn't play any of the videos used to check the connection. Your sign-in is probably fine — try again in a moment.";
    if (status === "signed_out")
      return "Your saved YouTube sign-in has expired. Sign in again, or import a fresh cookies.txt.";
    if (status === "timeout")
      return "YouTube took too long to answer. Try again.";
    return "YouTube rejected the saved sign-in. Sign in again.";
  }
  if (status === "probe_unavailable")
    return "YouTube wouldn't play any of the videos used to check the connection, so this says nothing about your sign-in. Try again in a moment.";
  const label = source[0].toUpperCase() + source.slice(1);
  if (status === "signed_out")
    return `No YouTube account cookies were found in ${label}.`;
  if (status === "profile_missing")
    return `No ${label} profile was found on this computer.`;
  if (status === "locked")
    return `${label} is running and holding its cookie database open. Fully quit it — including background tasks in the system tray — then check again. If that doesn't work, import a cookies.txt instead.`;
  if (status === "decrypt_failed")
    // Chrome 127+ ties the cookie key to the browser itself (App-Bound
    // Encryption on Windows, the keychain on macOS), so no other process can
    // decrypt them. This one cannot be worked around — it has to be routed
    // around, and the in-app window is NOT the alternative on Windows because
    // Google refuses sign-in from inside an app.
    return `${label} encrypts its cookies so other apps can't read them, and that can't be bypassed. Import a cookies.txt exported from ${label} instead.`;
  if (status === "timeout")
    return `${label} took too long to respond. Quit it fully, then try again.`;
  if (status === "extractor_error")
    return "YouTube could not be checked right now. Update the app or try again later.";
  return undefined;
}

// Keeps the last few lines of yt-dlp's own output so the UI can show the real
// reason a check failed instead of only a friendly summary.
function tailReason(output: string): string | undefined {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /error|warning|unable|failed/i.test(line));
  if (lines.length === 0) return undefined;
  return lines.slice(-3).join("\n").slice(0, 600);
}

interface AuthProbeResult {
  status: YouTubeAuthProbeStatus;
  reason?: string;
}

function probeOnce(
  url: string,
  cookieOptions: Record<string, unknown>,
  onChild: (child: ChildProcess | null) => void,
): Promise<AuthProbeResult> {
  return new Promise((resolve) => {
    const child = yt!.exec(
      url,
      { ...cookieOptions, simulate: true, verbose: true },
      { env: childEnv() },
    );
    onChild(child);
    const chunks: Buffer[] = [];
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (status: YouTubeAuthProbeStatus, output: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      onChild(null);
      console.log(
        `[server] youtube auth probe ${status}` +
          (status === "signed_in"
            ? ""
            : `: ${tailReason(output) ?? "no detail"}`),
      );
      resolve({
        status,
        reason: status === "signed_in" ? undefined : tailReason(output),
      });
    };
    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", (error) =>
      finish(classifyYouTubeAuthOutput(String(error)), String(error)),
    );
    child.on("close", () => {
      const output = Buffer.concat(chunks).toString();
      finish(classifyYouTubeAuthOutput(output), output);
    });
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish("timeout", Buffer.concat(chunks).toString());
    }, AUTH_PROBE_TIMEOUT_MS);
  });
}

/** Tries each probe video until one gives a verdict about the session. */
async function probeYouTubeAuth(
  cookieOptions: Record<string, unknown>,
  onChild: (child: ChildProcess | null) => void,
): Promise<AuthProbeResult> {
  let last: AuthProbeResult = {
    status: "probe_unavailable",
    reason: "No probe video could be reached.",
  };
  for (const url of AUTH_PROBE_URLS) {
    last = await probeOnce(url, cookieOptions, onChild);
    // Anything but a dead probe target is an answer about the session.
    if (last.status !== "probe_unavailable") return last;
    console.log(`[server] auth probe target unusable, trying the next one`);
  }
  return last;
}

app.post("/api/auth/youtube/status", async (req: Request, res: Response) => {
  const parsed = z
    .object({ browser: authSourceSchema })
    .safeParse(req.body ?? {});
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  const source = parsed.data.browser;
  console.log(
    `[server] /api/auth/youtube/status source=${source} cookieFile=${
      source === "app" ? Boolean(appCookieFile()) : "n/a"
    }`,
  );
  if (source === "app" && !appCookieFile()) {
    return res.json({
      status: "signed_out" satisfies YouTubeAuthProbeStatus,
      source,
      browser: source,
      message: "No in-app YouTube sign-in yet.",
    });
  }
  const cookieOptions = resolveCookieOptions(source);
  let activeChild: ChildProcess | null = null;
  res.on("close", () => {
    if (!res.writableEnded && activeChild) activeChild.kill("SIGKILL");
  });
  const { status, reason } = await probeYouTubeAuth(cookieOptions, (child) => {
    activeChild = child;
  });
  if (res.writableEnded || res.destroyed) return;
  return res.json({
    status,
    source,
    browser: parsed.data.browser,
    message: authProbeMessage(source, status),
    reason,
  });
});

app.post("/api/download", async (req: Request, res: Response) => {
  const parsed = downloadSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  const {
    url,
    start,
    end,
    format,
    quality,
    deliver,
    cookiesFromBrowser,
  }: DownloadInput = parsed.data;
  const cookieOptions: Record<string, unknown> = resolveCookieOptions(cookiesFromBrowser);
  const cookieMode: "app" | "browser" | "none" = !cookiesFromBrowser
    ? "none"
    : cookiesFromBrowser === "app"
      ? "app"
      : "browser";
  console.log(`[server] /api/download auth mode=${cookieMode}`);

  const requiresVerifiedSession =
    format === "mp4" && (quality === "best" || Number(quality) > 360);
  if (requiresVerifiedSession) {
    if (cookieMode === "none") {
      return res.status(401).json({
        code: "YOUTUBE_AUTH_REQUIRED",
        error: "Connect YouTube before downloading this quality.",
      });
    }
    const auth = await probeYouTubeAuth(cookieOptions, () => undefined);
    if (auth.status !== "signed_in") {
      return res.status(401).json({
        code: "YOUTUBE_AUTH_REQUIRED",
        error: "Your YouTube connection is no longer valid. Connect again.",
        reason: auth.reason,
      });
    }
  }

  const jobId =
    typeof req.query.jobId === "string" && req.query.jobId
      ? req.query.jobId
      : `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Re-probe duration so the cap can't be bypassed by a crafted request.
  // Doubles as the source of truth for which heights YouTube actually offers.
  let availableHeights: number[] = [];
  const probeWith = (opts: Record<string, unknown>) => ({
    dumpSingleJson: true,
    noWarnings: true,
    noPlaylist: true,
    ...opts,
  });
  let probeOptions: Record<string, unknown> = probeWith(cookieOptions);
  const runProbe = async (opts: Record<string, unknown>) => {
    console.log(
      `[server] /api/download probe url=${url} options=${JSON.stringify(opts)}`,
    );
    return yt!.run(url, opts, { env: childEnv() } as any);
  };
  try {
    let info: any;
    try {
      info = await runProbe(probeOptions);
    } catch (first) {
      throw first;
    }
    if (typeof info.duration === "number" && end > info.duration + 1) {
      return res.status(400).json({ error: "End exceeds video duration" });
    }
    availableHeights = Array.from(
      new Set(
        (Array.isArray(info.formats) ? info.formats : [])
          .map((f: { height?: number | null }) => Number(f?.height) || 0)
          .filter((h: number) => h > 0),
      ),
    ).sort((a, b) => (b as number) - (a as number)) as number[];
    console.log(
      `[server] /api/download available heights=${availableHeights.join(",") || "unknown"}`,
    );
  } catch (e) {
    if (cookiesFromBrowser && isCookieError(e)) {
      return res
        .status(400)
        .json({ error: cookieErrorMessage(cookiesFromBrowser) });
    }
    logYtError("/api/download probe", url, probeOptions, e);
    return res.status(400).json({ error: fullErrMessage(e) });
  }


  const isAudio = format === "mp3";
  const ext = isAudio ? "mp3" : "mp4";
  // Keyed work folder: the same video at the same format/quality/range reuses
  // the same folder, so yt-dlp's `.part` files survive a failure and the retry
  // continues from where it stopped. Any other combination gets its own folder.
  const tempDir = workDir(CLIP_PREFIX, [
    url,
    format,
    quality,
    start.toFixed(2),
    end.toFixed(2),
  ]);
  const outputPath = path.join(tempDir, `clip.${ext}`);
  // A finished clip left from a previous run is never reused — only partials.
  try {
    fs.rmSync(outputPath, { force: true });
  } catch {
    /* ignore */
  }
  const resumeBytes = partialBytes(tempDir);
  if (resumeBytes > 0) {
    console.log(
      `[server] /api/download resuming with ${resumeBytes} cached byte(s) in ${tempDir}`,
    );
  }
  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };


  // YouTube's SABR rollout means the web-type clients no longer expose separate
  // DASH video+audio URLs; only ANDROID_VR still does, and those URLs are bound
  // to that client's session so ffmpeg's range requests get 403'd. HLS (m3u8)
  // and progressive formats are still served to web clients and work fine with
  // --download-sections. But preferring HLS unconditionally silently caps
  // quality: a 720p HLS rendition would beat a 1080p DASH one. So resolution
  // is the primary key — the exact requested height is tried on HLS *and*
  // DASH before anything lower, and only then does protocol preference apply.
  const videoFormat =
    quality === "best"
      ? [
          "bestvideo[protocol*=m3u8]+bestaudio[protocol*=m3u8]",
          "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]",
          "bestvideo+bestaudio",
          "best[protocol*=m3u8]",
          "best[ext=mp4]",
          "best",
        ].join("/")
      : [
          // Exact requested height first, either protocol.
          `bestvideo[height=${quality}][protocol*=m3u8]+bestaudio[protocol*=m3u8]`,
          `bestvideo[height=${quality}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]`,
          `bestvideo[height=${quality}]+bestaudio`,
          `best[height=${quality}]`,
          // Then step down.
          `bestvideo[height<=${quality}][protocol*=m3u8]+bestaudio[protocol*=m3u8]`,
          `bestvideo[height<=${quality}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]`,
          `bestvideo[height<=${quality}]+bestaudio`,
          `best[protocol*=m3u8][height<=${quality}]`,
          `best[ext=mp4][height<=${quality}]`,
          `best[height<=${quality}]`,
        ].join("/");


  // Attempt 1 pins web-based clients only. ANDROID_VR is kept out here because
  // its URLs are exactly the ones that 403 under ffmpeg; it is reintroduced in
  // the whole-file fallback where yt-dlp fetches the media itself.
  const PLAYER_CLIENTS_PRIMARY =
    "youtube:player_client=web_safari,web,mweb,tv";
  const PLAYER_CLIENTS_FALLBACK =
    "youtube:player_client=web_safari,web,mweb,tv,android_vr";

  const commonOptions: Record<string, unknown> = {
    noPlaylist: true,
    noWarnings: true,
    newline: true,
    progress: true,
    // Pick up any `.part` file left in this work folder by a failed run.
    continue: true,
    ffmpegLocation: resolvedFfmpeg,
    ...cookieOptions,
  };


  const formatOptions: Record<string, unknown> = isAudio
    ? { extractAudio: true, audioFormat: "mp3", audioQuality: quality }
    : { format: videoFormat, mergeOutputFormat: "mp4", remuxVideo: "mp4" };

  // Attempt 1: let yt-dlp cut the section (fast, ffmpeg fetches the range).
  const sectionOptions: Record<string, unknown> = {
    ...commonOptions,
    ...formatOptions,
    extractorArgs: PLAYER_CLIENTS_PRIMARY,
    downloadSections: `*${start.toFixed(2)}-${end.toFixed(2)}`,
    forceKeyframesAtCuts: true,
    output: outputPath,
    // Make ffmpeg's range request look like the one that minted the URL.
    addHeader: [
      "Referer:https://www.youtube.com/",
      "Origin:https://www.youtube.com",
    ],
  };

  // Attempt 2 (fallback): yt-dlp downloads the whole media itself (native
  // downloader, no ffmpeg-fetched URLs), then we trim locally.
  const fullPath = path.join(tempDir, `source.${isAudio ? "m4a" : "mp4"}`);
  const fullOptions: Record<string, unknown> = {
    ...commonOptions,
    extractorArgs: PLAYER_CLIENTS_FALLBACK,
    // Fetch HLS with yt-dlp's own segment downloader so ffmpeg only ever sees
    // a local file. Older bundled ffmpeg builds crash fetching m3u8 themselves.
    hlsPreferNative: true,
    ...(isAudio
      ? {
          // Same HLS-first ordering as video: SABR withholds the DASH audio
          // URL from web clients, so m4a-only selection lands on a 403 URL.
          format:
            "bestaudio[protocol*=m3u8]/best[protocol*=m3u8]/bestaudio[ext=m4a]/bestaudio/best",
        }
      : { format: videoFormat, mergeOutputFormat: "mp4" }),
    output: fullPath,
  };

  let options: Record<string, unknown> = sectionOptions;

  // Progress is driven by ffmpeg's `... time=HH:MM:SS.ss ...` output, which
  // streams continuously as the clip is processed (yt-dlp routes section
  // downloads through ffmpeg with --download-sections). Progress =
  // processed time / clip length. yt-dlp's own `[download] NN%` only appears
  // once at the very end, so it's used only as a fallback.
  const clipDuration = Math.max(0.1, end - start);
  let lastReported = 0;
  // Progress window the current phase maps onto (fallback splits the bar).
  let scaleFrom = 0;
  let scaleTo = 99;
  const report = (fraction: number) => {
    const pct = Math.min(
      99,
      Math.round(scaleFrom + (scaleTo - scaleFrom) * Math.min(1, fraction)),
    );
    if (pct > lastReported) {
      lastReported = pct;
      publishProgress(jobId, { phase: "downloading", percent: pct });
    }
  };
  const hmsToSeconds = (h: string, m: string, s: string) =>
    Number(h) * 3600 + Number(m) * 60 + parseFloat(s);
  // yt-dlp announces its pick as "Downloading 1 format(s): 299+140" — keep it
  // so a silent quality downgrade is diagnosable from the log and the client.
  let chosenFormat = "";
  const updateFromLine = (line: string) => {
    const fm = line.match(/Downloading\s+\d+\s+format\(s\):\s*([\w+\-.,]+)/);
    if (fm) {
      chosenFormat = fm[1];
      console.log(`[server] yt-dlp selected format(s)=${chosenFormat}`);
    }
    const tm = line.match(/time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
    if (tm) {
      const secs = hmsToSeconds(tm[1], tm[2], tm[3]);
      // Ignore ffmpeg's initial bogus negative timestamp.
      if (secs >= 0) report(secs / clipDuration);
      return;
    }
    // Fallback: honor a real yt-dlp download percentage if one is emitted.
    const dm = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    if (dm) report(parseFloat(dm[1]) / 100);
  };


  // Spawn a child and stream its output through updateFromLine, rejecting with
  // the trimmed stderr tail on non-zero exit.
  const runStreaming = (
    spawnChild: () => ChildProcess,
    label: string,
  ): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const child = spawnChild();
      let buf = "";
      let stderrTail = "";
      const onChunk = (chunk: Buffer | string) => {
        const s = chunk.toString();
        buf += s;
        stderrTail = (stderrTail + s).slice(-4000);
        const parts = buf.split(/\r|\n/);
        buf = parts.pop() || "";
        for (const line of parts) updateFromLine(line);
      };
      child.stdout?.on("data", onChunk);
      child.stderr?.on("data", onChunk);
      child.on("error", reject);
      child.on("close", (code) => {
        if (buf) updateFromLine(buf);
        if (code === 0) return resolve();
        const tail = stderrTail
          .split(/\r?\n/)
          .filter((l) => l.trim() && !/^\[download\]\s+\d/.test(l))
          .slice(-8)
          .join("\n")
          .trim();
        console.error(`[server] ${label} exit ${code}:\n${tail}`);
        const err: any = new Error(tail || `${label} exited with code ${code}`);
        err.tail = tail;
        reject(err);
      });
    });

  // A 403 on the media URL, or any ffmpeg failure while it fetches the stream
  // itself (including crashes on m3u8 input), means the sectioned path is
  // unusable for this video — retry via the whole-file + local-trim path.
  const isForbidden = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      /403|Forbidden|ffmpeg exited with code|fragment.*not found/i.test(msg)
    );
  };

  const findDownloaded = (): string | null => {
    if (fs.existsSync(fullPath)) return fullPath;
    const match = fs
      .readdirSync(tempDir)
      .filter((f) => f.startsWith("source."))
      .map((f) => path.join(tempDir, f))[0];
    return match ?? null;
  };

  try {
    publishProgress(jobId, {
      phase: "downloading",
      percent: 0,
      ...(resumeBytes > 0
        ? {
            message: `Resuming — ${(resumeBytes / (1024 * 1024)).toFixed(1)} MB already downloaded`,
          }
        : {}),
    });

    console.log(
      `[server] download job=${jobId} using binDir=${BIN_DIR ?? "(none)"}`,
    );
    console.log(
      `[server] /api/download exec url=${url} options=${JSON.stringify(sectionOptions)}`,
    );
    try {
      await runStreaming(
        () => yt!.exec(url, sectionOptions, { env: childEnv() } as any),
        "yt-dlp",
      );
    } catch (sectionErr) {
      if (!isForbidden(sectionErr)) throw sectionErr;
      console.warn(
        "[server] sectioned download failed (403) — retrying with full download + local trim",
      );
      options = fullOptions;
      lastReported = 0;
      scaleFrom = 0;
      scaleTo = 70;
      publishProgress(jobId, { phase: "downloading", percent: 0 });
      await runStreaming(
        () => yt!.exec(url, fullOptions, { env: childEnv() } as any),
        "yt-dlp (full)",
      );

      const source = findDownloaded();
      if (!source) throw new Error("yt-dlp produced no output");

      scaleFrom = 70;
      scaleTo = 99;
      lastReported = 70;
      const trimArgs = isAudio
        ? [
            "-y",
            "-ss",
            String(start),
            "-to",
            String(end),
            "-i",
            source,
            "-vn",
            "-c:a",
            "libmp3lame",
            "-b:a",
            `${quality}k`,
            outputPath,
          ]
        : [
            "-y",
            "-ss",
            String(start),
            "-to",
            String(end),
            "-i",
            source,
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            outputPath,
          ];
      await runStreaming(
        () =>
          spawn(resolvedFfmpeg as string, trimArgs, {
            env: childEnv(),
            windowsHide: true,
            shell: false,
          }),
        "ffmpeg (trim)",
      );
      try {
        fs.rmSync(source, { force: true });
      } catch {
        /* ignore */
      }
    }

    if (!fs.existsSync(outputPath)) {
      // Work folder deliberately kept so the next attempt can resume.

      publishProgress(jobId, {
        phase: "error",
        percent: 0,
        message: "no output",
      });
      return res.status(500).json({ error: "yt-dlp produced no output" });
    }

    publishProgress(jobId, { phase: "processing", percent: 99 });

    // Report what was actually delivered: YouTube's SABR rollout can leave a
    // video whose only fetchable renditions sit below the requested height, so
    // the clip legitimately completes at a lower resolution. Probed with the
    // resolved ffmpeg (ffprobe is not bundled) and passed back as headers since
    // the response body is the media stream itself.
    const delivered = probeDelivered(outputPath, resolvedFfmpeg as string);
    if (delivered.height) {
      res.setHeader("X-Delivered-Height", String(delivered.height));
    }
    if (delivered.audioKbps) {
      res.setHeader("X-Delivered-Audio-Kbps", String(delivered.audioKbps));
    }
    if (chosenFormat) res.setHeader("X-Selected-Format", chosenFormat);
    if (availableHeights.length)
      res.setHeader("X-Available-Heights", availableHeights.join(","));
    res.setHeader("X-Auth-Mode", cookieMode);
    console.log(
      `[server] /api/download built job=${jobId} requested=${quality} delivered=${delivered.height ?? "?"} format=${chosenFormat || "?"} auth=${cookieMode}`,
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "X-Delivered-Height, X-Delivered-Audio-Kbps, X-Selected-Format, X-Available-Heights, X-Auth-Mode",
    );


    const stat = fs.statSync(outputPath);

    // Desktop app: hand back the location, not the media. Sending a clip as
    // an HTTP body means the UI buffers the whole file, converts it to an
    // ArrayBuffer and copies it across IPC to be written — several complete
    // copies of a file that can run to hundreds of megabytes, purely to move
    // it between two processes on the same machine. The main process opens
    // the file directly instead. `tempDir` is deliberately NOT cleaned up
    // here; whoever moves the file removes it (and startup sweeps orphans).
    if (deliver === "path") {
      console.log(
        `[server] /api/download handing off job=${jobId} bytes=${stat.size}`,
      );
      publishProgress(jobId, { phase: "done", percent: 100 });
      return res.json({ path: outputPath, size: stat.size });
    }

    const name = `clip.${ext}`;
    res.setHeader("Content-Type", isAudio ? "audio/mpeg" : "video/mp4");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    console.log(
      `[server] /api/download sending job=${jobId} bytes=${stat.size}`,
    );

    // The clip is finished at this point; everything below is the transfer.
    // It used to be untraced: a connection that broke mid-body left no log
    // line at all, and an 'error' on the response with no listener is an
    // unhandled stream error in-process. A client that sees "failed to fetch"
    // after a completed download is exactly this window, so it is now
    // reported with the byte count that got through.
    const stream = fs.createReadStream(outputPath);
    let sent = 0;
    let settled = false;
    const settle = (why: string, err?: unknown) => {
      if (settled) return;
      settled = true;
      const ok = sent === stat.size && res.writableEnded;
      if (ok) {
        console.log(
          `[server] /api/download sent job=${jobId} bytes=${sent}`,
        );
        publishProgress(jobId, { phase: "done", percent: 100 });
      } else {
        const detail = err instanceof Error ? `: ${err.message}` : "";
        console.error(
          `[server] /api/download transfer failed job=${jobId} ${why} sent=${sent}/${stat.size}${detail}`,
        );
        publishProgress(jobId, {
          phase: "error",
          percent: 0,
          message: `The clip was built but only ${sent} of ${stat.size} bytes reached the app (${why}).`,
        });
      }
      stream.destroy();
      // Only a completed transfer clears the work folder; a broken one keeps
      // the finished clip so the retry is instant.
      if (ok) cleanup();
    };


    stream.on("data", (chunk) => {
      sent += chunk.length;
    });
    stream.on("error", (err) => settle("read error", err));
    res.on("error", (err) => settle("response error", err));
    res.on("close", () => settle("connection closed early"));
    stream.pipe(res);
  } catch (e) {
    // Work folders are intentionally left in place on failure: the partial
    // download inside them is what makes the retry resumable. The staleness
    // sweep and the "clear unfinished downloads" action reclaim the space.
    if (cookiesFromBrowser && isCookieError(e)) {
      const msg = cookieErrorMessage(cookiesFromBrowser);
      publishProgress(jobId, { phase: "error", percent: 0, message: msg });
      return res.status(400).json({ error: msg });
    }
    logYtError("/api/download", url, options, e);

    const raw = fullErrMessage(e);
    // Keep the friendly sentence but append the real yt-dlp stderr tail so the
    // next YouTube-side change is diagnosable straight from the UI.
    const tail = ((e as { tail?: string } | null)?.tail || raw || "").trim();
    const msg = isForbidden(e)
      ? `YouTube refused the media request for this video. Try again in a moment, or pick a different quality.${tail ? `\n${tail}` : ""}`
      : raw;
    publishProgress(jobId, { phase: "error", percent: 0, message: msg });
    res.status(500).json({ error: msg });
  }
});

// Fetch all comments (top-level + replies) via yt-dlp's --write-comments.
// Returned as a normalized JSON array so the client can build a CSV.
interface RawComment {
  id?: string;
  parent?: string; // 'root' for top-level, otherwise parent comment id
  text?: string;
  author?: string;
  author_id?: string;
  author_is_uploader?: boolean;
  is_favorited?: boolean;
  is_pinned?: boolean;
  like_count?: number | null;
  dislike_count?: number | null;
  timestamp?: number | null;
  time_text?: string;
  reply_count?: number | null;
}

app.post("/api/comments", async (req: Request, res: Response) => {
  const parsed = infoSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  const options: Record<string, unknown> = {
    dumpSingleJson: true,
    writeComments: true,
    noPlaylist: true,
    noWarnings: true,
    // Fetch every top-level comment and every reply. `all` avoids yt-dlp's
    // default cap so nothing is truncated on large videos.
    extractorArgs: "youtube:comment_sort=top;max_comments=all,all,all,all",
  };
  try {
    console.log(
      `[server] /api/comments url=${parsed.data.url} options=${JSON.stringify(options)}`,
    );
    const info = await yt!.run(parsed.data.url, options, {
      env: childEnv(),
    } as any);
    const raw: RawComment[] = Array.isArray(info?.comments) ? info.comments : [];
    if (raw.length === 0 && info?.comment_count === 0) {
      return res.json({
        title: info?.title ?? "",
        commentsDisabled: true,
        comments: [],
      });
    }
    // Determine top-level parents so we can compute reply_count.
    const replyCounts = new Map<string, number>();
    for (const c of raw) {
      if (c.parent && c.parent !== "root") {
        replyCounts.set(c.parent, (replyCounts.get(c.parent) ?? 0) + 1);
      }
    }
    const comments = raw.map((c) => {
      const isReply = Boolean(c.parent && c.parent !== "root");
      return {
        comment_id: c.id ?? "",
        parent_id: isReply ? c.parent ?? "" : "",
        is_reply: isReply,
        author: c.author ?? "",
        author_channel_id: c.author_id ?? "",
        text: c.text ?? "",
        like_count: typeof c.like_count === "number" ? c.like_count : "",
        dislike_count:
          typeof c.dislike_count === "number" ? c.dislike_count : "",
        is_favorited: Boolean(c.is_favorited),
        is_pinned: Boolean(c.is_pinned),
        is_uploader: Boolean(c.author_is_uploader),
        published_time: c.time_text ?? "",
        timestamp: typeof c.timestamp === "number" ? c.timestamp : "",
        reply_count: isReply ? "" : replyCounts.get(c.id ?? "") ?? 0,
      };
    });
    res.json({
      title: info?.title ?? "",
      commentsDisabled: false,
      comments,
    });
  } catch (e) {
    logYtError("/api/comments", parsed.data.url, options, e);
    const msg = fullErrMessage(e);
    // yt-dlp signals disabled comments in the stderr text.
    if (/comments are disabled/i.test(msg)) {
      return res.json({
        title: "",
        commentsDisabled: true,
        comments: [],
      });
    }
    res.status(500).json({ error: msg });
  }
});

// Progress channel — Server-Sent Events keyed by jobId.
interface ProgressEvent {
  phase: "downloading" | "processing" | "done" | "error";
  percent: number;
  message?: string;
}

interface JobChannel {
  clients: Set<Response>;
  last: ProgressEvent;
  cleanupTimer?: NodeJS.Timeout;
}

const jobs = new Map<string, JobChannel>();

function getOrCreateJob(id: string): JobChannel {
  let job = jobs.get(id);
  if (!job) {
    job = { clients: new Set(), last: { phase: "downloading", percent: 0 } };
    jobs.set(id, job);
  }
  return job;
}

function publishProgress(id: string, evt: ProgressEvent) {
  const job = getOrCreateJob(id);
  job.last = evt;
  const payload = `data: ${JSON.stringify(evt)}\n\n`;
  for (const client of job.clients) {
    try {
      client.write(payload);
    } catch {
      /* ignore */
    }
  }
  if (evt.phase === "done" || evt.phase === "error") {
    if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
    job.cleanupTimer = setTimeout(() => {
      for (const c of job.clients) {
        try {
          c.end();
        } catch {
          /* ignore */
        }
      }
      jobs.delete(id);
    }, 5000);
  }
}

app.get("/api/download/progress", (req: Request, res: Response) => {
  const jobId = String(req.query.jobId || "");
  if (!jobId) return res.status(400).end();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const job = getOrCreateJob(jobId);
  job.clients.add(res);
  res.write(`data: ${JSON.stringify(job.last)}\n\n`);

  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      /* ignore */
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(ping);
    job.clients.delete(res);
  });
});

// ---------------------------------------------------------------------------
// Channel profile exporter — enumerate a channel, rank by views, and collect
// metadata / comments / transcripts for the top N videos.
// ---------------------------------------------------------------------------

// Hard ceiling on how deep a channel listing is read. A channel with more
// videos than this exports its most-viewed CANDIDATE_CAP, not all of them.
const CANDIDATE_CAP = 20000;
const CHANNEL_LIMIT_MAX = 10000; // largest budget that can be asked for by number
const SHORT_MAX_SECONDS = 60;

/** How many videos to export: a count, or every video the channel lists. */
type ChannelLimit = number | "all";

const DEFAULT_LISTING_DEPTH = 3000;

/**
 * How deep to read a channel tab.
 *
 * This was a flat 3000, which quietly capped an "export the whole channel" run
 * at 3000 candidates. It stays at least 3000 for numeric budgets: the Shorts
 * tab comes back newest-first, so a shallow listing would rank the newest
 * videos rather than the most-viewed ones.
 */
function listingDepth(limit: ChannelLimit): number {
  if (limit === "all") return CANDIDATE_CAP;
  return Math.min(CANDIDATE_CAP, Math.max(DEFAULT_LISTING_DEPTH, limit * 2));
}

/** How many of a tab's ranked entries go into the candidate pool. */
function poolCap(limit: ChannelLimit): number {
  return limit === "all" ? CANDIDATE_CAP : Math.min(CANDIDATE_CAP, limit * 2);
}

// Collects #hashtags from a string, keeping first-seen casing.
function collectHashtags(text: string, into: Map<string, string>): void {
  if (!text) return;
  const re = /#([\p{L}\p{N}_]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tag = m[1];
    const key = tag.toLowerCase();
    if (!into.has(key)) into.set(key, tag);
  }
}

// Merges yt-dlp's hashtag field with hashtags found in the title/description.
function extractHashtags(meta: Record<string, any>): {
  hashtags: string;
  hashtags_in_title: string;
} {
  const all = new Map<string, string>();
  const titleOnly = new Map<string, string>();
  const field = (meta as any).hashtags ?? (meta as any).hashtag;
  if (Array.isArray(field)) {
    for (const raw of field) {
      collectHashtags(String(raw).startsWith("#") ? String(raw) : `#${raw}`, all);
    }
  }
  collectHashtags(String(meta.title ?? ""), titleOnly);
  for (const [k, v] of titleOnly) if (!all.has(k)) all.set(k, v);
  collectHashtags(String(meta.description ?? ""), all);
  const fmt = (m: Map<string, string>) =>
    [...m.values()].map((t) => `#${t}`).join("; ");
  return { hashtags: fmt(all), hashtags_in_title: fmt(titleOnly) };
}

const META_CONCURRENCY = 3;

const channelExportSchema = z.object({
  url: urlSchema,
  contentType: z.enum(["shorts", "longform", "all"]).default("all"),
  limit: z
    .union([z.literal("all"), z.number().int().min(1).max(CHANNEL_LIMIT_MAX)])
    .default(100),
  // What to collect. Each is its own CSV, and turning one off skips the work
  // rather than just the file.
  includeVideoDetails: z.boolean().default(true),
  includeComments: z.boolean().default(true),
  includeTranscripts: z.boolean().default(true),
  // Throw away any saved progress for this exact request and start over.
  fresh: z.boolean().default(false),
  // "rows" returns every row in the JSON response, which is what a browser
  // needs. "path" writes the CSVs on this machine and returns their paths, so
  // a whole-channel export never has to fit in a JSON body — see
  // finishExportToDisk below.
  deliver: z.enum(["rows", "path"]).default("rows"),
  cookiesFromBrowser: authSourceSchema.optional(),

});

type ChannelExportInput = z.infer<typeof channelExportSchema>;

interface ChannelProgress {
  phase: "listing" | "metadata" | "details" | "done" | "error" | "cancelled";
  current: number;
  total: number;
  label?: string;
  message?: string;
}

interface ChannelJob {
  clients: Set<Response>;
  last: ChannelProgress;
  cancelled: boolean;
  children: Set<ChildProcess>;
  cleanupTimer?: NodeJS.Timeout;
}

const channelJobs = new Map<string, ChannelJob>();

function getOrCreateChannelJob(id: string): ChannelJob {
  let job = channelJobs.get(id);
  if (!job) {
    job = {
      clients: new Set(),
      last: { phase: "listing", current: 0, total: 0 },
      cancelled: false,
      children: new Set(),
    };
    channelJobs.set(id, job);
  }
  return job;
}

function publishChannel(id: string, evt: ChannelProgress) {
  const job = getOrCreateChannelJob(id);
  job.last = evt;
  const payload = `data: ${JSON.stringify(evt)}\n\n`;
  for (const client of job.clients) {
    try {
      client.write(payload);
    } catch {
      /* ignore */
    }
  }
  if (evt.phase === "done" || evt.phase === "error" || evt.phase === "cancelled") {
    if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
    job.cleanupTimer = setTimeout(() => {
      for (const c of job.clients) {
        try {
          c.end();
        } catch {
          /* ignore */
        }
      }
      channelJobs.delete(id);
    }, 5000);
  }
}

// Reduce any channel URL variant (@handle, /channel/UC…, /c/name, /user/name,
// or a tab/video link under them) to the canonical channel root.
function channelBaseUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!/youtube\.com$/.test(u.hostname.replace(/^(www|m)\./, "")))
      return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    if (parts[0].startsWith("@")) return `https://www.youtube.com/${parts[0]}`;
    if (["channel", "c", "user"].includes(parts[0]) && parts[1])
      return `https://www.youtube.com/${parts[0]}/${parts[1]}`;
    return null;
  } catch {
    return null;
  }
}

// Spawn yt-dlp for a job, registering the child so cancellation can kill it.
function runForJob(
  job: ChannelJob,
  url: string,
  opts: Record<string, unknown>,
  timeoutMs = 180_000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (job.cancelled) return reject(new Error("cancelled"));
    const child = yt!.exec(url, opts, { env: childEnv() });
    job.children.add(child);
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      job.children.delete(child);
      fn();
    };
    child.stdout?.on("data", (c: Buffer) => outChunks.push(c));
    child.stderr?.on("data", (c: Buffer) => errChunks.push(c));
    child.on("error", (err) => finish(() => reject(err)));
    child.on("close", (code) => {
      const stdout = Buffer.concat(outChunks).toString();
      const stderr = Buffer.concat(errChunks).toString();
      finish(() => {
        if (code === 0) {
          try {
            resolve(stdout.trim().startsWith("{") ? JSON.parse(stdout) : stdout);
          } catch {
            resolve(stdout);
          }
        } else {
          const err: any = new Error(stderr.trim() || `yt-dlp exited ${code}`);
          err.stderr = stderr;
          err.exitCode = code;
          reject(err);
        }
      });
    });
  });
}

interface FlatEntry {
  id?: string;
  title?: string;
  duration?: number | null;
  view_count?: number | null;
  url?: string;
}

interface RankedVideo {
  id: string;
  title: string;
  duration: number;
  view_count: number;
}

// One videos.csv row, built from the flat listing entry plus whatever full
// metadata came back (an empty object when the metadata fetch failed).
function buildVideoRow(
  v: RankedVideo,
  meta: Record<string, any>,
  channelName: string,
): Record<string, unknown> {
  const duration = Number(meta.duration) || v.duration;
  const views =
    typeof meta.view_count === "number" ? meta.view_count : v.view_count;
  return {
    video_id: v.id,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    title: meta.title ?? v.title,
    description: meta.description ?? "",
    upload_date: meta.upload_date ?? "",
    duration_seconds: duration,
    is_short: duration > 0 && duration <= SHORT_MAX_SECONDS,
    view_count: views,
    like_count: typeof meta.like_count === "number" ? meta.like_count : "",
    comment_count:
      typeof meta.comment_count === "number" ? meta.comment_count : "",
    channel: meta.channel ?? channelName,
    thumbnail: meta.thumbnail ?? "",
    tags: Array.isArray(meta.tags) ? meta.tags.join("; ") : "",
    tag_count: Array.isArray(meta.tags) ? meta.tags.length : 0,
    ...extractHashtags(meta),
  };
}

async function listChannelTab(
  job: ChannelJob,
  tabUrl: string,
  cookieOptions: Record<string, unknown>,
  listEnd: number,
): Promise<{ entries: FlatEntry[]; channelName: string; subs: number | "" }> {
  const info = await runForJob(job, tabUrl, {
    dumpSingleJson: true,
    flatPlaylist: true,
    noWarnings: true,
    playlistEnd: listEnd,
    ...cookieOptions,
  });
  const entries: FlatEntry[] = Array.isArray(info?.entries) ? info.entries : [];
  return {
    entries,
    channelName: info?.channel || info?.uploader || info?.title || "",
    subs: typeof info?.channel_follower_count === "number"
      ? info.channel_follower_count
      : "",
  };
}

async function fetchTranscript(
  job: ChannelJob,
  videoUrl: string,
  cookieOptions: Record<string, unknown>,
): Promise<VttLine[]> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ytchan-"));
  try {
    await runForJob(job, videoUrl, {
      skipDownload: true,
      writeAutoSubs: true,
      writeSubs: true,
      subLangs: "en",
      subFormat: "vtt",
      noPlaylist: true,
      noWarnings: true,
      output: path.join(tempDir, "sub"),
      ffmpegLocation: resolvedFfmpeg,
      ...cookieOptions,
    }, 120_000);
    const files = fs.readdirSync(tempDir);
    const vtt =
      files.find((f) => /\.en\.vtt$/.test(f)) ||
      files.find((f) => f.endsWith(".vtt"));
    if (!vtt) return [];
    return parseVtt(fs.readFileSync(path.join(tempDir, vtt), "utf8"));
  } catch {
    return [];
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

// Run an async mapper over items with a small concurrency window, preserving
// input order in the result array.
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    })(),
  );
  await Promise.all(workers);
  return results;
}

// Optional local passcode gate: when a hash is baked into the build (or set in
// a local .env during development), the exporter endpoint only answers
// requests carrying the same hash.
const DEFAULT_CHANNEL_PASSCODE_HASH =
  "0cd257a54a58aa1c00862c07297225561f663bd746b5856c5e7dfaaa3d488add";

function readPasscodeHash(): string {
  const fromEnv = (process.env.CHANNEL_EXPORT_PASSCODE_HASH || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
    const line = raw
      .split(/\r?\n/)
      .find((l) => l.startsWith("CHANNEL_EXPORT_PASSCODE_HASH="));
    const fromFile = line ? line.split("=").slice(1).join("=").trim() : "";
    if (fromFile) return fromFile;
  } catch {
    // fall through to the baked-in hash
  }
  return DEFAULT_CHANNEL_PASSCODE_HASH;
}


const CHANNEL_PASSCODE_HASH = readPasscodeHash();

app.post("/api/channel/export", async (req: Request, res: Response) => {
  if (
    CHANNEL_PASSCODE_HASH &&
    String(req.header("X-Channel-Key") || "").trim() !== CHANNEL_PASSCODE_HASH
  ) {
    return res.status(403).json({ error: "Channel exporter is locked." });
  }
  const parsed = channelExportSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  const input: ChannelExportInput = parsed.data;
  const base = channelBaseUrl(input.url);
  if (!base)
    return res.status(400).json({
      error:
        "That doesn't look like a channel link. Use youtube.com/@handle or /channel/UC…",
    });

  const jobId =
    typeof req.query.jobId === "string" && req.query.jobId
      ? req.query.jobId
      : `chan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (
    !input.includeVideoDetails &&
    !input.includeComments &&
    !input.includeTranscripts
  ) {
    return res.status(400).json({
      error:
        "Pick at least one thing to export — video details, comments or transcripts.",
    });
  }

  const job = getOrCreateChannelJob(jobId);
  const cookieOptions: Record<string, unknown> = resolveCookieOptions(
    input.cookiesFromBrowser,
  );


  res.on("close", () => {
    if (!res.writableEnded) cancelChannelJob(jobId);
  });

  // Checkpoint folder keyed on everything that changes what gets exported.
  // Rows are flushed to disk per video, so a failure, a cancel or a quit only
  // costs the video in flight — the rerun continues from the next one.
  const ckDir = workDir(EXPORT_PREFIX, [
    base,
    input.contentType,
    input.limit,
    input.includeVideoDetails,
    input.includeComments,
    input.includeTranscripts,
  ]);
  const ckSelection = path.join(ckDir, "selection.json");
  const ckMetadata = path.join(ckDir, "metadata.jsonl");
  const ckComments = path.join(ckDir, "comments.jsonl");
  const ckTranscripts = path.join(ckDir, "transcripts.jsonl");
  const ckStatuses = path.join(ckDir, "statuses.jsonl");
  const clearCheckpoint = () => {
    try {
      fs.rmSync(ckDir, { recursive: true, force: true });
    } catch {
      /* swept later */
    }
  };

  // "Start fresh" — the saved progress from an earlier run of this exact
  // request is discarded so nothing is carried over or skipped.
  if (input.fresh) {
    clearCheckpoint();
    try {
      fs.mkdirSync(ckDir, { recursive: true });
    } catch {
      /* the checkpoint is best-effort; the export still runs */
    }
  }

  interface Checkpoint {
    channelName: string;
    subs: number | "";
    videos: Record<string, unknown>[];
    selected: { id: string; title: string }[];
  }
  const saved = readJson<Checkpoint>(ckSelection);

  // In "path" mode comments and transcripts are never accumulated: they go to
  // the JSONL checkpoint as they are collected and are streamed from there
  // into CSVs at the end. They are the two that grow without bound — a few
  // thousand videos is millions of caption lines — so holding them is what
  // used to put a whole-channel export out of memory.
  const toDisk = input.deliver === "path";
  const videos: Record<string, unknown>[] = [];
  const comments: Record<string, unknown>[] = [];
  const transcripts: Record<string, unknown>[] = [];
  const statuses: Record<string, unknown>[] = [];
  let channelName = "";
  let subs: number | "" = "";

  // Which parts this run collected, echoed back so the UI reports on exactly
  // what it asked for.
  const parts = {
    videoDetails: input.includeVideoDetails,
    comments: input.includeComments,
    transcripts: input.includeTranscripts,
  };

  /**
   * The response body, in whichever delivery mode was asked for.
   *
   * "rows" hands back every row as JSON — fine for a browser and for small
   * runs. "path" writes the CSVs into a temp folder on this machine and
   * returns their paths: comments and transcripts are streamed straight out of
   * the JSONL checkpoints, so neither the server nor the UI ever holds a
   * whole channel's captions at once.
   */
  function buildResponse(cancelled: boolean) {
    const channel = {
      name: channelName || base,
      url: base,
      subscriber_count: subs,
      exported_at: new Date().toISOString(),
      filter: input.contentType,
      requested: input.limit,
      exported: videos.length,
    };
    if (!toDisk) {
      return {
        jobId,
        cancelled,
        channel,
        parts,
        videos,
        comments,
        transcripts,
        statuses,
      };
    }

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), EXPORT_PREFIX));
    const at = (name: string) => path.join(outDir, name);
    // Only the requested CSVs are written. An unasked-for part yields no file
    // at all rather than an empty one, so the folder says what the run was.
    const names: string[] = [];
    const counts = { videos: 0, comments: 0, transcripts: 0 };
    if (parts.videoDetails) {
      counts.videos = writeCsv(at("videos.csv"), VIDEO_COLUMNS, videos);
      names.push("videos.csv");
    }
    if (parts.comments) {
      counts.comments = writeCsvFromJsonl(
        ckComments,
        at("comments.csv"),
        COMMENT_COLUMNS,
      );
      names.push("comments.csv");
    }
    if (parts.transcripts) {
      counts.transcripts = writeCsvFromJsonl(
        ckTranscripts,
        at("transcripts.csv"),
        TRANSCRIPT_COLUMNS,
      );
      names.push("transcripts.csv");
    }
    // Always written: one row saying what the run did, and a line per video
    // saying which ones gave trouble. A few kilobytes between them.
    writeCsv(at("summary.csv"), SUMMARY_COLUMNS, [
      {
        channel: channel.name,
        channel_url: channel.url,
        subscriber_count: channel.subscriber_count,
        exported_at: channel.exported_at,
        filter: channel.filter,
        requested: channel.requested,
        exported: channel.exported,
        cancelled,
        included: describeParts(parts),
      },
    ]);
    writeCsv(at("video-status.csv"), STATUS_COLUMNS, statuses);
    names.push("summary.csv", "video-status.csv");

    const files = names.map((name) => {
      let bytes = 0;
      try {
        bytes = fs.statSync(at(name)).size;
      } catch {
        /* reported as 0 */
      }
      return { name, path: at(name), bytes };
    });
    return { jobId, cancelled, channel, parts, dir: outDir, files, counts };
  }

  try {
    let selected: { id: string; title: string }[] = [];
    if (saved && Array.isArray(saved.selected) && saved.selected.length > 0) {
      // Resuming: the ranking pass already ran, so the same top-N set is
      // reused rather than re-fetching metadata for the whole candidate pool.
      channelName = saved.channelName || "";
      subs = saved.subs ?? "";
      selected = saved.selected;
      videos.push(...(saved.videos ?? []));
      // Statuses are loaded either way: they are one short row per video, and
      // they are what says which videos have already been collected.
      statuses.push(...readJsonl<Record<string, unknown>>(ckStatuses));
      if (!toDisk) {
        comments.push(...readJsonl<Record<string, unknown>>(ckComments));
        transcripts.push(...readJsonl<Record<string, unknown>>(ckTranscripts));
      }
    } else {
      publishChannel(jobId, {
        phase: "listing",
        current: 0,
        total: 0,
        label: "Reading the channel listing",
      });

      // Flat channel listings are inconsistent: the Videos tab carries duration
      // but no view counts, the Shorts tab carries view counts but no duration.
      // So each tab is pre-ranked with whatever signal it has (the Videos tab is
      // requested in YouTube's own "most popular" order), a candidate pool is
      // taken from the top of each, and the final ranking uses the real view
      // counts from full metadata.
      const tabs =
        input.contentType === "shorts"
          ? [`${base}/shorts`]
          : input.contentType === "longform"
            ? [`${base}/videos?view=0&sort=p`]
            : [`${base}/videos?view=0&sort=p`, `${base}/shorts`];

      const seen = new Map<string, RankedVideo>();
      const listEnd = listingDepth(input.limit);
      const candidates = poolCap(input.limit);
      let listedAny = false;
      let lastListError = "";
      for (const tab of tabs) {
        try {
          const { entries, channelName: name, subs: s } = await listChannelTab(
            job,
            tab,
            cookieOptions,
            listEnd,
          );
          listedAny = true;
          if (!channelName && name) channelName = name;
          if (subs === "" && s !== "") subs = s;
          const tabVideos: RankedVideo[] = [];
          for (const e of entries) {
            if (!e.id || seen.has(e.id)) continue;
            tabVideos.push({
              id: e.id,
              title: e.title ?? "",
              duration: Number(e.duration) || 0,
              view_count: Number(e.view_count) || 0,
            });
          }
          // Only re-sort when the tab actually reported view counts; otherwise
          // the listing order (popularity) is the better signal.
          if (tabVideos.some((v) => v.view_count > 0)) {
            tabVideos.sort((a, b) => b.view_count - a.view_count);
          }
          for (const v of tabVideos.slice(0, candidates)) seen.set(v.id, v);
        } catch (e) {
          lastListError = fullErrMessage(e);
          if (job.cancelled) break;
        }
      }
      if (job.cancelled) throw new Error("cancelled");
      if (!listedAny)
        throw new Error(lastListError || "Couldn't read this channel's videos.");

      const pool = [...seen.values()];
      if (pool.length === 0)
        throw new Error("No videos matched that filter on this channel.");

      // The metadata pass is one yt-dlp call per video and dominates a large
      // export. It earns its cost for exactly two things: the videos.csv rows,
      // and the view counts that rank a "Top N by views" run. When neither
      // applies — video details not wanted, and everything being exported
      // anyway — it is skipped outright. That is what makes a
      // transcripts-only run of a few thousand videos practical.
      const needsMetadata = input.includeVideoDetails || input.limit !== "all";

      // Full metadata for the candidate pool (duration, views, likes, comments).
      // Checkpointed per video: on a whole-channel run losing all of it to a
      // single interruption made resuming pointless.
      const cachedRows = new Map<string, Record<string, unknown>>();
      for (const row of readJsonl<Record<string, unknown>>(ckMetadata)) {
        const id = String((row as { video_id?: unknown })?.video_id ?? "");
        if (id) cachedRows.set(id, row);
      }
      let metaDone = 0;
      publishChannel(jobId, {
        phase: "metadata",
        current: 0,
        total: needsMetadata ? pool.length : 0,
        label: needsMetadata
          ? "Collecting video details"
          : "Skipping video details",
      });
      const fetched = !needsMetadata
        ? // Everything the listing already knows, and nothing fetched. The
          // rows are still built so the content-type filter and the selection
          // below work unchanged; they simply never reach a CSV.
          pool.map((v) => buildVideoRow(v, {}, channelName))
        : await mapLimit(pool, META_CONCURRENCY, async (v) => {
            const cached = cachedRows.get(v.id);
            if (cached) {
              metaDone += 1;
              return cached;
            }
            if (job.cancelled) return null;
            let meta: Record<string, any> = {};
            try {
              meta =
                ((await runForJob(
                  job,
                  `https://www.youtube.com/watch?v=${v.id}`,
                  {
                    dumpSingleJson: true,
                    noPlaylist: true,
                    noWarnings: true,
                    skipDownload: true,
                    ...cookieOptions,
                  },
                  90_000,
                )) as Record<string, any>) ?? {};
            } catch {
              meta = {};
            } finally {
              metaDone += 1;
              publishChannel(jobId, {
                phase: "metadata",
                current: metaDone,
                total: pool.length,
                label: v.title || v.id,
              });
            }
            const row = buildVideoRow(v, meta, channelName);
            appendJsonl(ckMetadata, [row]);
            return row;
          });
      if (job.cancelled) throw new Error("cancelled");

      let ranked = fetched.filter(
        (r): r is Record<string, unknown> => r !== null,
      );
      if (input.contentType === "shorts") {
        ranked = ranked.filter(
          (r) => Number(r.duration_seconds) === 0 || r.is_short === true,
        );
      } else if (input.contentType === "longform") {
        ranked = ranked.filter(
          (r) => Number(r.duration_seconds) === 0 || r.is_short === false,
        );
      }
      ranked.sort((a, b) => Number(b.view_count) - Number(a.view_count));
      const keep = input.limit === "all" ? ranked.length : input.limit;
      selected = ranked.slice(0, keep).map((r) => ({
        id: String(r.video_id),
        title: String(r.title),
      }));
      if (selected.length === 0)
        throw new Error("No videos matched that filter on this channel.");
      videos.push(...ranked.slice(0, keep));
      writeJson(ckSelection, { channelName, subs, videos, selected });
    }

    const alreadyDone = new Set(
      statuses.map((s) => String((s as { video_id?: unknown }).video_id ?? "")),
    );
    if (alreadyDone.size > 0) {
      console.log(
        `[server] channel export resuming with ${alreadyDone.size} video(s) already collected`,
      );
      publishChannel(jobId, {
        phase: "details",
        current: alreadyDone.size,
        total: selected.length,
        label: `Resuming — ${alreadyDone.size} of ${selected.length} already collected`,
      });
    }


    // Per-video comments + transcripts. Sequential: these are the heavy calls
    // and YouTube throttles parallel comment scrapes aggressively.
    if (input.includeComments || input.includeTranscripts) {
      for (let i = 0; i < selected.length; i++) {
        if (job.cancelled) break;
        const v = selected[i];
        // Already collected on an earlier attempt — its rows were loaded from
        // the checkpoint, so skip the expensive scrape entirely.
        if (alreadyDone.has(v.id)) continue;
        const videoUrl = `https://www.youtube.com/watch?v=${v.id}`;
        const notes: string[] = [];
        const videoComments: Record<string, unknown>[] = [];
        const videoTranscripts: Record<string, unknown>[] = [];
        publishChannel(jobId, {
          phase: "details",
          current: i,
          total: selected.length,
          label: v.title || v.id,
        });

        if (input.includeComments) {
          try {
            const info = await runForJob(
              job,
              videoUrl,
              {
                dumpSingleJson: true,
                writeComments: true,
                noPlaylist: true,
                noWarnings: true,
                skipDownload: true,
                extractorArgs:
                  "youtube:comment_sort=top;max_comments=50,50,0,0",
                ...cookieOptions,
              },
              240_000,
            );
            const raw: RawComment[] = Array.isArray(info?.comments)
              ? info.comments
              : [];
            if (raw.length === 0) notes.push("no comments");
            for (const c of raw) {
              const isReply = Boolean(c.parent && c.parent !== "root");
              videoComments.push({
                video_id: v.id,
                comment_id: c.id ?? "",
                parent_id: isReply ? c.parent ?? "" : "",
                is_reply: isReply,
                author: c.author ?? "",
                author_channel_id: c.author_id ?? "",
                text: c.text ?? "",
                like_count: typeof c.like_count === "number" ? c.like_count : "",
                is_pinned: Boolean(c.is_pinned),
                is_uploader: Boolean(c.author_is_uploader),
                published_time: c.time_text ?? "",
                timestamp: typeof c.timestamp === "number" ? c.timestamp : "",
              });
            }
          } catch (e) {
            notes.push(
              /comments are disabled/i.test(fullErrMessage(e))
                ? "comments disabled"
                : "comments unavailable",
            );
          }
        }

        if (!job.cancelled && input.includeTranscripts) {
          const lines = await fetchTranscript(job, videoUrl, cookieOptions);
          if (lines.length === 0) notes.push("no captions");
          for (const l of lines) {
            videoTranscripts.push({
              video_id: v.id,
              start: l.start,
              end: l.end,
              text: l.text,
            });
          }
        }

        if (job.cancelled) break;
        const statusRow = {
          video_id: v.id,
          title: v.title,
          status: notes.length === 0 ? "ok" : notes.join("; "),
        };
        if (!toDisk) {
          comments.push(...videoComments);
          transcripts.push(...videoTranscripts);
        }
        statuses.push(statusRow);
        // Flush this video to the checkpoint before moving on, so an
        // interruption never costs more than the video in flight.
        appendJsonl(ckComments, videoComments);
        appendJsonl(ckTranscripts, videoTranscripts);
        appendJsonl(ckStatuses, [statusRow]);
      }
    }

    const cancelled = job.cancelled;
    publishChannel(jobId, {
      phase: cancelled ? "cancelled" : "done",
      current: selected.length,
      total: selected.length,
    });
    // Built before the checkpoint is dropped: in "path" mode the CSVs are
    // streamed out of those very files.
    const body = buildResponse(cancelled);
    // A finished export has nothing left to resume.
    if (!cancelled) clearCheckpoint();
    return res.json(body);
  } catch (e) {
    const cancelled = job.cancelled || (e as Error)?.message === "cancelled";
    if (cancelled) {
      publishChannel(jobId, {
        phase: "cancelled",
        current: videos.length,
        total: videos.length,
      });
      if (res.writableEnded || res.destroyed) return;
      return res.json(buildResponse(true));
    }
    logYtError("/api/channel/export", input.url, { base }, e);
    const msg = fullErrMessage(e);
    publishChannel(jobId, {
      phase: "error",
      current: 0,
      total: 0,
      message: msg,
    });
    if (res.writableEnded || res.destroyed) return;
    return res.status(500).json({ error: msg });
  }
});

function cancelChannelJob(jobId: string) {
  const job = channelJobs.get(jobId);
  if (!job) return;
  job.cancelled = true;
  for (const child of job.children) {
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
  job.children.clear();
}

app.post("/api/channel/export/cancel", (req: Request, res: Response) => {
  const jobId = String((req.body ?? {}).jobId || "");
  if (!jobId) return res.status(400).json({ error: "Missing jobId" });
  cancelChannelJob(jobId);
  res.json({ ok: true });
});

app.get("/api/channel/export/progress", (req: Request, res: Response) => {
  const jobId = String(req.query.jobId || "");
  if (!jobId) return res.status(400).end();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const job = getOrCreateChannelJob(jobId);
  job.clients.add(res);
  res.write(`data: ${JSON.stringify(job.last)}\n\n`);

  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      /* ignore */
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(ping);
    job.clients.delete(res);
  });
});


// --- Resume cache -------------------------------------------------------

app.get("/api/cache/usage", (_req: Request, res: Response) => {
  return res.json(cacheUsage());
});

app.post("/api/cache/clear", (_req: Request, res: Response) => {
  const { removed } = clearCache();
  console.log(`[server] cleared ${removed} unfinished work folder(s)`);
  return res.json({ ok: true, removed, ...cacheUsage() });
});

// SPA fallback for the packaged UI — must be registered after all API routes.
if (uiDir && fs.existsSync(uiDir)) {
  app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(uiDir, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  const swept = sweepStaleCache();
  if (swept) console.log(`[server] swept ${swept} stale work folder(s)`);
});
