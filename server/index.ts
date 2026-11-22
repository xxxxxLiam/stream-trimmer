/**
 * File: index.ts
 * Path: server/index.ts
 * Description: Local Express backend — /api/info, /api/download, /api/transcript.
 * Uses bundled yt-dlp (with PATH fallback) and ffmpeg-static. Runs via `tsx`.
 */
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
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
// binary path on spaces (breaks `/Applications/Clipr.app/...`). We
// spawn yt-dlp directly with node's child_process, and use `dargs` (already a
// transitive dep) to convert the same option-object shape into CLI flags.
import dargs from "dargs";
import ffmpegPath from "ffmpeg-static";
import {
  AUTH_PROBE_URLS,
  authProbeVerdict,
  classifyYouTubeAuthOutput,
  type YouTubeAuthProbeStatus,
} from "./youtubeAuth";
import { isDegradedDelivery } from "./quality";
import { registerChannelRoutes } from "./channelRoutes";
import {
  CookieJarMissingError,
  acquireCookiePath,
  type CookieLease,
} from "./cookieJar";
import {
  STAGE_FOUND,
  STAGE_WRITING,
  classifyFailure,
  estimateNeededMb,
  joinFailure,
  joinSegments,
  lowQualityWithoutSession,
  outPointFailure,
  probeDurationSec,
  refusedFailure,
  pruneWorkDir,
  resolveSegments,
  runProcess,
  sectionArg,
  segmentFileName,
  segmentWindow,
  segmentsTotal,
  staleSessionFailure,
  stageDownloaded,
  stageDownloading,
  stageJoining,
  type ClipFailure,
  type Segment,
} from "./segments";
import {
  CLIP_PREFIX,
  cacheUsage,
  clearCache,
  holdFolder,
  jobDir,
  markInUse,
  partialBytes,
  sweepStaleCache,
  tryClaim,
  workDir,
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

// --- per-run diagnostics -----------------------------------------------------
// Every log line that names a job (`job=<id>`) is also kept in a small in-memory
// ring keyed by that id, so a failure can hand the renderer exactly its own
// lines instead of the whole log. Bounded in both directions.
const JOB_LOG_MAX_LINES = 300;
const JOB_LOG_MAX_JOBS = 40;
const jobLogs = new Map<string, string[]>();
{
  const levels = ["log", "warn", "error"] as const;
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      try {
        const text = args
          .map((a) => (typeof a === "string" ? a : String(a)))
          .join(" ");
        const m = /\bjob=(job_[\w]+)/.exec(text);
        if (!m) return;
        let lines = jobLogs.get(m[1]);
        if (!lines) {
          lines = [];
          jobLogs.set(m[1], lines);
          if (jobLogs.size > JOB_LOG_MAX_JOBS) {
            const oldest = jobLogs.keys().next().value;
            if (oldest !== undefined) jobLogs.delete(oldest);
          }
        }
        lines.push(`${new Date().toISOString()} [${level}] ${text.slice(0, 600)}`);
        if (lines.length > JOB_LOG_MAX_LINES) lines.shift();
      } catch {
        /* capturing a line must never break logging */
      }
    };
  }
}

function readAppVersion(): string {
  const fromEnv = process.env.CLIPPER_APP_VERSION || process.env.npm_package_version;
  if (fromEnv) return fromEnv;
  const candidates = [
    path.resolve(process.cwd(), "package.json"),
    process.env.ELECTRON_RESOURCES
      ? path.resolve(process.env.ELECTRON_RESOURCES, "..", "app.asar", "package.json")
      : "",
    process.env.ELECTRON_RESOURCES
      ? path.resolve(process.env.ELECTRON_RESOURCES, "..", "package.json")
      : "",
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      const v = JSON.parse(fs.readFileSync(file, "utf8")).version;
      if (typeof v === "string" && v) return v;
    } catch {
      /* try the next one */
    }
  }
  return "unknown";
}

let cachedFfmpegVersion: string | null | undefined;
function ffmpegVersionLine(): string | null {
  if (cachedFfmpegVersion !== undefined) return cachedFfmpegVersion;
  try {
    const out = spawnSync(String(resolvedFfmpeg), ["-version"], {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
    }).stdout;
    cachedFfmpegVersion = out.split(/\r?\n/)[0]?.replace(/^ffmpeg version\s+/i, "").trim() || null;
  } catch {
    cachedFfmpegVersion = null;
  }
  return cachedFfmpegVersion;
}

let cachedYtDlpVersion: string | null | undefined;

/**
 * What the renderer needs to describe one failed run. Raw on purpose: the one
 * redactor lives in src/lib/diagnostics.ts and runs over the finished report.
 */
function buildRunDiagnostics(jobId: string, stderrRaw: string) {
  if (cachedYtDlpVersion === undefined) {
    cachedYtDlpVersion = yt ? ytDlpVersion(yt.binary) : null;
  }
  return {
    jobId,
    appVersion: readAppVersion(),
    platform: process.platform,
    osRelease: os.release(),
    arch: process.arch,
    homeDir: os.homedir(),
    ytDlpVersion: cachedYtDlpVersion,
    ffmpegVersion: ffmpegVersionLine(),
    stderrTail: stderrRaw.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(-400),
    logLines: [...(jobLogs.get(jobId) ?? [])],
  };
}

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
    const child = spawn(binary, args, {
      env,
      windowsHide: true,
      // shell:false is the default — explicit for clarity.
      shell: false,
      // Download jobs run in their own process group so a cancel can kill
      // yt-dlp AND the ffmpeg it started, not just the parent.
      detached: Boolean(execaOpts?.detached),
    });
    (execaOpts?.onSpawn as ((c: ChildProcess) => void) | undefined)?.(child);
    return child;
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

/**
 * True only for a real YouTube address: http(s), no embedded credentials, and a
 * host that IS youtube.com (or a subdomain of it) or youtu.be.
 *
 * The check and its consumer must agree about where the host ends. Node's WHATWG
 * `new URL` and Python's `urlsplit` (yt-dlp's own parser) do not: WHATWG treats
 * `\` like `/`, strips tab/newline, accepts `https:host` with no slashes and
 * IDNA-maps non-ASCII, so `https://www.youtube.com\@evil.example/` is
 * `www.youtube.com` to one and `evil.example` to the other. Rather than
 * normalise, anything the two could read differently is refused: a backslash, a
 * raw or percent-encoded control character, whitespace, a scheme not followed by
 * `//`, and an authority that is not plain ASCII `host[:port]` (which rules out
 * userinfo, brackets, `%`-escapes, non-ASCII and IP-literal tricks in one rule).
 * What is left is then read by BOTH parsers and must give the same host.
 */
export function isYouTubeUrl(value: string): boolean {
  if (typeof value !== "string" || value.length > 4096) return false;
  // Control characters, DEL, whitespace, backslash, anything non-ASCII-printable.
  if (/[^\x21-\x7e]/.test(value) || value.includes("\\")) return false;
  // Percent-encoded control characters (%00-%1f, %7f) and an encoded backslash.
  if (/%(?:[01][0-9a-f]|7f|5c)/i.test(value)) return false;
  // The scheme must be followed by exactly `//`, as RFC 3986 requires.
  const m = /^(https?):\/\/([^/?#]*)/i.exec(value);
  if (!m) return false;
  const authority = m[2];
  // Plain `host` or `host:port`: no `@` (userinfo), `[` (IP literal), `%`, ...
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.?(?::\d{1,5})?$/.test(authority)) {
    return false;
  }
  const rawHost = authority.replace(/:\d+$/, "").toLowerCase().replace(/\.$/, "");
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  // Both readings of the host must be the same string, and that string YouTube.
  if (host !== rawHost) return false;
  return (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be"
  );
}

const urlSchema = z
  .string()
  .url()
  .refine(isYouTubeUrl, "URL must be a YouTube link");

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

// Metadata, transcripts and comments all need the signed-in session just as
// much as the download does. Without it YouTube answers "Sign in to confirm
// you're not a bot" for a signed-out IP, which read in the UI as the app
// having lost a sign-in it was actually still holding.
const infoSchema = z.object({
  url: urlSchema,
  cookiesFromBrowser: authSourceSchema.optional(),
});

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

/**
 * Runs `fn` with the cookie options for ONE yt-dlp run.
 *
 * yt-dlp writes its cookie jar back on every run, so a run is never given the
 * canonical file: it gets a private copy from the cookie jar module, and only
 * the single run flagged `refresher` may promote its result. A multi-segment
 * cut runs one yt-dlp per segment, so segment one is the refresher and the
 * rest are throwaway copies. The lease is released whether the run succeeds or
 * not, and a failed run is released as `false` so it can never overwrite a good
 * jar. A browser-sourced or absent session has no cookie file to protect.
 */
async function withRunCookies<T>(
  mode: "app" | "browser" | "none",
  base: Record<string, unknown>,
  refresher: boolean,
  fn: (cookieOptions: Record<string, unknown>) => Promise<T>,
): Promise<T> {
  if (mode !== "app" || !appCookieFile()) return fn(base);
  let lease: CookieLease;
  try {
    lease = await acquireCookiePath({ refresher });
  } catch (e) {
    if (e instanceof CookieJarMissingError) {
      // The file vanished between the check and the copy. Run unsigned and let
      // the 360p-without-a-session notice say so, rather than failing the cut.
      console.warn(`[server] cookie jar unavailable: ${e.message}`);
      return fn({});
    }
    throw e;
  }
  let ok = false;
  try {
    const result = await fn({ ...base, cookies: lease.path });
    ok = true;
    return result;
  } finally {
    await lease.release(ok);
  }
}

/** Which kind of session a request asked for; only "app" has a jar to protect. */
function cookieModeFor(source: string | undefined): "app" | "browser" | "none" {
  return !source ? "none" : source === "app" ? "app" : "browser";
}

const downloadSchema = z.object({
  url: urlSchema,
  // A clip is a list of ranges, joined in order into one file. The older
  // single `start`/`end` pair is still accepted and means one segment.
  segments: z
    .array(
      z.object({ start: z.number().nonnegative(), end: z.number().positive() }),
    )
    .min(1)
    .optional(),
  start: z.number().nonnegative().optional(),
  end: z.number().positive().optional(),
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
});

type DownloadInput = z.infer<typeof downloadSchema>;


const app = express();

// This server is the app's own backend, not a public API. It binds loopback
// only (see app.listen), and on top of that it answers only the app's own
// origin: the packaged window loads from http://127.0.0.1:<PORT>, and the dev
// renderer from the Vite server on :8080. A no-preflight cross-origin POST
// (text/plain) is still SENT by the browser, and CORS headers do not stop it
// being processed, so a foreign Origin is refused outright rather than merely
// left without Access-Control-Allow-Origin. A Host that is not a loopback name
// is refused too, which is what stops DNS rebinding.
const ALLOWED_ORIGINS = new Set(
  [PORT, 8080].flatMap((port) => [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]),
);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function requestAllowed(
  origin: string | undefined,
  hostHeader: string | undefined,
): boolean {
  if (origin !== undefined && !ALLOWED_ORIGINS.has(origin)) return false;
  const host = String(hostHeader ?? "")
    .toLowerCase()
    .replace(/:\d+$/, "");
  return LOOPBACK_HOSTS.has(host);
}

app.use((req: Request, res: Response, next) => {
  if (!requestAllowed(req.headers.origin, req.headers.host)) {
    return res.status(403).json({ error: "Forbidden origin" });
  }
  next();
});
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.has(origin)),
  }),
);
// Request bodies are small JSON (a URL, a few ranges), so the cap is the
// body-parser default made explicit: 100 KB, measured after any gzip inflation.
// Anything larger, and any body that is not JSON, is answered by the error
// handler registered after the routes, as JSON, never as an HTML stack trace.
const JSON_BODY_LIMIT = "100kb";
app.use(express.json({ limit: JSON_BODY_LIMIT }));

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

  // Every yt-dlp run gets a private copy of the jar (see withRunCookies):
  // yt-dlp writes its cookie file back, so handing it the canonical path lets
  // a bad run wipe the saved sign-in.
  let options: Record<string, unknown> = {};
  try {
    const info = await withRunCookies(
      cookieModeFor(parsed.data.cookiesFromBrowser),
      resolveCookieOptions(parsed.data.cookiesFromBrowser),
      false,
      (cookies) => {
        options = {
          dumpSingleJson: true,
          noWarnings: true,
          noPlaylist: true,
          ...cookies,
        };
        console.log(
          `[server] /api/info url=${parsed.data.url} options=${JSON.stringify(options)}`,
        );
        return yt!.run(parsed.data.url, options, {
          env: childEnv(),
        } as any);
      },
    );
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

  let options: Record<string, unknown> = {};
  try {
    await withRunCookies(
      cookieModeFor(parsed.data.cookiesFromBrowser),
      resolveCookieOptions(parsed.data.cookiesFromBrowser),
      false,
      (cookies) => {
        options = {
          skipDownload: true,
          writeAutoSubs: true,
          writeSubs: true,
          subLangs: "en",
          subFormat: "vtt",
          noPlaylist: true,
          noWarnings: true,
          output: path.join(tempDir, "sub"),
          ffmpegLocation: resolvedFfmpeg,
          ...cookies,
        };
        console.log(
          `[server] /api/transcript url=${parsed.data.url} options=${JSON.stringify(options)}`,
        );
        return yt!.run(parsed.data.url, options, { env: childEnv() } as any);
      },
    );

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
type AuthSourceName = CookieBrowserName | "app";

function authProbeMessage(
  source: AuthSourceName,
  status: YouTubeAuthProbeStatus,
): string | undefined {
  if (source === "app") {
    if (status === "signed_in") return undefined;
    if (status === "probe_unavailable")
      return "YouTube wouldn't play any of the videos used to check the connection. Your sign-in is probably fine — try again in a moment.";
    if (status === "rate_limited")
      return "YouTube is rate-limiting this network, not rejecting your sign-in. Wait a few minutes and try again — re-importing cookies won't help.";
    if (status === "inconclusive")
      return undefined;
    if (status === "signed_out")
      return "Your saved YouTube sign-in has expired. Sign in again, or import a fresh cookies.txt.";
    if (status === "timeout")
      return "YouTube took too long to answer. Try again.";
    return "YouTube rejected the saved sign-in. Sign in again.";
  }
  if (status === "probe_unavailable")
    return "YouTube wouldn't play any of the videos used to check the connection, so this says nothing about your sign-in. Try again in a moment.";
  if (status === "rate_limited")
    return "YouTube is rate-limiting this network, not rejecting your sign-in. Wait a few minutes and try again.";
  if (status === "inconclusive") return undefined;
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
  shouldStop: () => boolean = () => false,
): Promise<AuthProbeResult> {
  let last: AuthProbeResult = {
    status: "probe_unavailable",
    reason: "No probe video could be reached.",
  };
  for (const url of AUTH_PROBE_URLS) {
    // Nobody is waiting any more: do not start the next probe child.
    if (shouldStop()) return last;
    last = await probeOnce(url, cookieOptions, onChild);
    // A dead probe target says nothing about the session, and neither does a
    // run whose output carried no recognisable marker — try the next video
    // before letting either stand as the verdict.
    if (last.status !== "probe_unavailable" && last.status !== "inconclusive") {
      return last;
    }
    console.log(
      `[server] auth probe ${last.status} on this target, trying the next one`,
    );
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
  let clientGone = false;
  res.on("close", () => {
    if (res.writableEnded) return;
    clientGone = true;
    if (activeChild) activeChild.kill("SIGKILL");
  });
  // One private copy of the jar covers the whole probe loop (up to three runs).
  const { status, reason } = await withRunCookies(
    cookieModeFor(source),
    cookieOptions,
    false,
    (cookies) =>
      probeYouTubeAuth(
        cookies,
        (child) => {
          activeChild = child;
        },
        () => clientGone,
      ),
  );
  if (res.writableEnded || res.destroyed) return;
  return res.json({
    status,
    source,
    browser: parsed.data.browser,
    message: authProbeMessage(source, status),
    reason,
  });
});

/**
 * ffmpeg arguments for cutting one range out of a whole downloaded video.
 *
 * Not `-c copy`: with `-ss` before `-i` a stream copy cannot start on a
 * non-keyframe, so ffmpeg keeps the packets back to the previous keyframe and
 * hides them behind an mp4 edit list. Players honour that list, but the concat
 * demuxer that joins the pieces ignores it, and the pre-roll comes back: a
 * clip marked at 4.00 s arrived with 14 frames from before an in-point. The
 * video is therefore decoded and re-encoded from the exact in-point (seek is
 * frame-accurate when transcoding), so the frames before it are discarded, not
 * hidden. The length is `-t`, an output limit, so nothing after the out point
 * leaks either; `passthrough` stops ffmpeg duplicating or dropping frames to
 * pad the cut onto a constant frame rate. yuv420p keeps the result playable
 * everywhere whatever the source was.
 */
export function localTrimArgs(
  source: string,
  seg: { start: number; end: number },
  out: string,
): string[] {
  return [
    "-hide_banner",
    "-y",
    "-ss",
    String(seg.start),
    "-i",
    source,
    "-t",
    String(seg.end - seg.start),
    "-fps_mode",
    "passthrough",
    "-c:v",
    "libx264",
    "-crf",
    "18",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    out,
  ];
}

// --- cancellable download jobs ----------------------------------------------
//
// Every /api/download request registers here under its jobId for as long as it
// is being built. POST /api/download/cancel?jobId=… (or the client simply
// hanging up) kills every child the job has started and makes the job stop
// before it starts the next one.

class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

interface ActiveJob {
  cancelled: boolean;
  /** True while the clip is being built; false once it is finished or failed. */
  building: boolean;
  children: Set<ChildProcess>;
}

const activeJobs = new Map<string, Set<ActiveJob>>();

function registerJob(id: string): ActiveJob {
  const job: ActiveJob = { cancelled: false, building: true, children: new Set() };
  let set = activeJobs.get(id);
  if (!set) {
    set = new Set();
    activeJobs.set(id, set);
  }
  set.add(job);
  return job;
}

function unregisterJob(id: string, job: ActiveJob) {
  job.building = false;
  const set = activeJobs.get(id);
  if (!set) return;
  set.delete(job);
  if (set.size === 0) activeJobs.delete(id);
}

/** Kills a child and, where it leads its own process group, everything under it. */
function killTree(child: ChildProcess) {
  const pid = child.pid;
  if (!pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

function cancelJobRun(job: ActiveJob) {
  job.cancelled = true;
  for (const child of job.children) killTree(child);
}

/** Cancels every live job with this id. Returns how many were still building. */
function cancelJob(id: string): number {
  let n = 0;
  for (const job of activeJobs.get(id) ?? []) {
    if (!job.building) continue;
    cancelJobRun(job);
    n += 1;
  }
  return n;
}

// Contract for the renderer (B-6): POST /api/download/cancel?jobId=<id> (or a
// JSON body {jobId}) -> 200 {ok:true, found:boolean}. `found` is false when no
// job with that id is being built any more (already finished, or never
// existed); that is not an error. The cancelled /api/download request itself
// answers 499 {code:"cancelled", cancelled:true}, and its progress channel
// publishes phase "error" with message "Cancelled". Hanging up the download
// request (AbortController) cancels it the same way.
app.post("/api/download/cancel", (req: Request, res: Response) => {
  const fromQuery =
    typeof req.query.jobId === "string" ? req.query.jobId : "";
  const fromBody =
    req.body && typeof req.body.jobId === "string" ? req.body.jobId : "";
  const id = fromQuery || fromBody;
  if (!id) return res.status(400).json({ error: "jobId is required" });
  const n = cancelJob(id);
  console.log(`[server] /api/download/cancel job=${id} cancelled=${n}`);
  return res.json({ ok: true, found: n > 0 });
});

/** Sends a failure in the table shape: cause, the one fix, the work kept. */
function sendFailure(
  res: Response,
  f: ClipFailure,
  extra: Record<string, unknown> = {},
) {
  return res.status(f.status).json({
    error: f.error,
    code: f.code,
    cause: f.cause,
    action: f.action,
    preserved: f.preserved,
    ...(f.detail ? { detail: f.detail } : {}),
    ...extra,
  });
}

app.post("/api/download", async (req: Request, res: Response) => {
  const parsed = downloadSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  const { url, format, quality, deliver, cookiesFromBrowser }: DownloadInput =
    parsed.data;
  // A clip is a list of ranges. The old single start/end is one segment.
  const resolvedSegments = resolveSegments(parsed.data, MAX_CLIP_SECONDS);
  if (!resolvedSegments.ok) {
    return res.status(400).json({ error: resolvedSegments.error });
  }
  const segs: Segment[] = resolvedSegments.segments;
  const segCount = segs.length;
  const multi = segCount > 1;
  const totalSec = segmentsTotal(segs);
  const lastEnd = Math.max(...segs.map((s) => s.end));

  const cookieOptions: Record<string, unknown> = resolveCookieOptions(cookiesFromBrowser);
  const cookieMode = cookieModeFor(cookiesFromBrowser);
  console.log(
    `[server] /api/download auth mode=${cookieMode} segments=${segCount}`,
  );

  const jobId =
    typeof req.query.jobId === "string" && req.query.jobId
      ? req.query.jobId
      : `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // Anything that fails from here on, including the pre-flight, carries the
  // per-run diagnostics Copy diagnostics needs (job id, versions, log lines).
  const diag = (raw: string) => ({ diagnostics: buildRunDiagnostics(jobId, raw) });

  // Cancellable from here until the clip is built or has failed. Hanging up
  // the request cancels it too.
  const job = registerJob(jobId);
  const throwIfCancelled = () => {
    if (job.cancelled) throw new CancelledError();
  };
  res.on("close", () => {
    if (!res.writableEnded && job.building) {
      console.log(`[server] /api/download client went away job=${jobId} — cancelling`);
      cancelJobRun(job);
    }
    unregisterJob(jobId, job);
  });
  const trackChild = (child: ChildProcess) => {
    job.children.add(child);
    child.once("close", () => job.children.delete(child));
    // Cancelled between the spawn decision and the spawn: do not let it run.
    if (job.cancelled) killTree(child);
  };
  const ytOpts = () =>
    ({
      env: childEnv(),
      detached: process.platform !== "win32",
      onSpawn: trackChild,
    }) as any;
  const sendCancelled = () => {
    publishProgress(jobId, { phase: "error", percent: 0, message: "Cancelled" });
    if (res.headersSent || res.writableEnded) return;
    return res.status(499).json({
      error: "Cancelled",
      code: "cancelled",
      cancelled: true,
    });
  };

  // True only when the probe confirmed a signed-in session. A clip that lands
  // at 360p without one is reported as an expired or missing sign-in.
  let sessionConfirmed = false;

  const requiresVerifiedSession =
    format === "mp4" && (quality === "best" || Number(quality) > 360);
  if (requiresVerifiedSession) {
    if (cookieMode === "none") {
      const cause =
        "No YouTube session is connected, and YouTube serves higher formats only to signed-in requests";
      const preserved = "Your marked range is kept.";
      return res.status(401).json({
        code: "YOUTUBE_AUTH_REQUIRED",
        error: `${cause}. Connect YouTube. ${preserved}`,
        cause,
        action: { id: "import_cookies", label: "Connect YouTube" },
        preserved,
        ...diag(cause),
      });
    }
    // A private copy: this is one of possibly many runs in flight, and yt-dlp
    // writes its jar back on every run.
    const auth = await withRunCookies(cookieMode, cookieOptions, false, (c) =>
      probeYouTubeAuth(
        c,
        (child) => {
          if (child) trackChild(child);
        },
        () => job.cancelled,
      ),
    );
    if (job.cancelled) return sendCancelled();
    const verdict = authProbeVerdict(auth.status);
    if (verdict === "rate_limited") {
      return res.status(429).json({
        code: "YOUTUBE_RATE_LIMITED",
        error:
          "YouTube is rate-limiting this network. Wait a few minutes and try again — your sign-in is fine, re-importing cookies won't help.",
        reason: auth.reason,
        ...diag(auth.reason ?? "rate limited"),
      });
    }
    if (verdict === "blocked") {
      const f = staleSessionFailure(401, "Your marked range is kept.");
      return res.status(401).json({
        code: "YOUTUBE_AUTH_REQUIRED",
        error: f.error,
        cause: f.cause,
        action: f.action,
        preserved: f.preserved,
        reason: auth.reason,
        ...diag(auth.reason ?? f.cause),
      });
    }
    if (auth.status !== "signed_in") {
      // Couldn't confirm, but nothing says the session is bad. Proceed and
      // let yt-dlp produce a real error if it genuinely cannot authenticate.
      console.log(
        `[server] /api/download proceeding on an unconfirmed session (${auth.status})`,
      );
    } else {
      sessionConfirmed = true;
    }
  }

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
  const runProbe = (opts: Record<string, unknown>) =>
    withRunCookies(cookieMode, opts, false, (c) => {
      const withCookies = probeWith(c);
      probeOptions = withCookies;
      console.log(
        `[server] /api/download probe url=${url} options=${JSON.stringify(withCookies)}`,
      );
      return yt!.run(url, withCookies, ytOpts());
    });
  try {
    const info: any = await runProbe(cookieOptions);
    throwIfCancelled();
    if (typeof info.duration === "number" && lastEnd > info.duration + 1) {
      const f = outPointFailure(lastEnd, info.duration);
      return sendFailure(
        res,
        f,
        diag(`${f.cause} (requested out point ${lastEnd}s, video ${info.duration}s)`),
      );
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
    if (job.cancelled || e instanceof CancelledError) return sendCancelled();
    if (cookiesFromBrowser && isCookieError(e)) {
      return res.status(400).json({
        error: cookieErrorMessage(cookiesFromBrowser),
        ...diag(fullErrMessage(e)),
      });
    }
    logYtError("/api/download probe", url, probeOptions, e);
    const raw = fullErrMessage(e);
    return sendFailure(res, classifyFailure(raw), diag(raw));
  }
  publishProgress(jobId, {
    phase: "downloading",
    percent: 0,
    message: STAGE_FOUND,
  });

  const isAudio = format === "mp3";
  const ext = isAudio ? "mp3" : "mp4";
  // Two folders, because two different things have to survive:
  //  - the SHARED folder is keyed by video+format+quality+ranges, so yt-dlp's
  //    `.part` files and a whole-file source outlive a failure and the retry
  //    continues from where it stopped. Only one live job may use it at a time
  //    (a second one with the same key works privately, with no resume), since
  //    two yt-dlp runs must never write the same `.part`.
  //  - the CLIP folder belongs to this request alone (key + random suffix). The
  //    finished clip, the concat list and the join output live there, so a
  //    second download of the same clip, however it arrives, can neither delete
  //    them nor have its own deleted. The app's main process moves the clip out
  //    and removes this folder.
  const keyParts = multi
    ? [
        url,
        format,
        quality,
        "segments",
        ...segs.map((s) => `${s.start.toFixed(2)}-${s.end.toFixed(2)}`),
      ]
    : [url, format, quality, segs[0].start.toFixed(2), segs[0].end.toFixed(2)];
  const sharedDir = workDir(CLIP_PREFIX, keyParts);
  const releaseShared = tryClaim(sharedDir);
  const clipDir = jobDir(CLIP_PREFIX, keyParts);
  const releaseClipDir = markInUse(clipDir);
  // Where segment files, `.part` files and the whole-file source go.
  const tempDir = releaseShared ? sharedDir : clipDir;
  if (!releaseShared) {
    console.log(
      `[server] /api/download job=${jobId} same clip already downloading — working in a private folder`,
    );
  }
  const outputPath = path.join(clipDir, `clip.${ext}`);
  // Per-segment files and the join's inputs. Every segment, a lone one too,
  // is written into the resumable folder, never straight into the per-request
  // clip folder: a failure deletes that whole folder, and with it the `.part`
  // a retry would continue from. A lone segment is moved to outputPath once
  // it is complete (see buildClip).
  const segFiles = segs.map((_, i) => path.join(tempDir, segmentFileName(i, ext)));
  const listPath = path.join(clipDir, "list.txt");
  // A finished clip left from a previous run is never reused — only partials.
  for (const f of [outputPath, listPath, ...segFiles]) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      /* ignore */
    }
  }
  const resumeBytes = partialBytes(tempDir);
  if (resumeBytes > 0) {
    console.log(
      `[server] /api/download resuming with ${resumeBytes} cached byte(s) in ${tempDir}`,
    );
  }
  // Ends this job's claim on both folders. `keepClip` leaves the clip folder in
  // place (the finished clip is being handed over); otherwise it is removed.
  let workReleased = false;
  const releaseWork = (keepClip: boolean) => {
    if (workReleased) return;
    workReleased = true;
    if (!keepClip) {
      try {
        fs.rmSync(clipDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    releaseClipDir();
    releaseShared?.();
    // The shared folder is dropped once nothing resumable is left in it.
    try {
      fs.rmdirSync(sharedDir);
    } catch {
      /* not empty: partials a retry will resume from */
    }
  };
  const cleanup = () => releaseWork(false);


  // Every tier here used to lead with `protocol*=m3u8`. That was written when
  // SABR had stopped web clients handing out usable DASH URLs and web_safari's
  // pre-merged HLS was the only thing left that survived ffmpeg's range
  // requests. It has since inverted: YouTube only returns HLS to logged-in or
  // otherwise "trusted" sessions, so on an ordinary session every m3u8 tier
  // matched nothing, the whole ladder fell through to the bare `best`, and a
  // video the probe had just listed at 1080p was delivered as itag 18 — muxed
  // 360p. Protocol is therefore no longer part of the selection at all:
  // resolution is the key, HLS competes with DASH on equal terms at each
  // height, and the mp4/avc1 pairing is preferred only because it copies into
  // the output container without re-encoding. A DASH URL that does 403 under
  // ffmpeg is still caught by isForbidden() below, which moves the whole job
  // to the fallback path where yt-dlp fetches the media itself — that path,
  // not an HLS-first selector, is what covers the 403.
  const videoFormat =
    quality === "best"
      ? [
          "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]",
          "bestvideo+bestaudio",
          // Pre-merged renditions, itag 18 among them, only once no separate
          // video+audio pair exists at all.
          "best[ext=mp4]",
          "best",
        ].join("/")
      : [
          // Exact requested height first, whatever protocol serves it.
          `bestvideo[height=${quality}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]`,
          `bestvideo[height=${quality}]+bestaudio`,
          `best[height=${quality}][ext=mp4]`,
          `best[height=${quality}]`,
          // Then step down.
          `bestvideo[height<=${quality}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]`,
          `bestvideo[height<=${quality}]+bestaudio`,
          `best[height<=${quality}][ext=mp4]`,
          `best[height<=${quality}]`,
        ].join("/");


  // Naming player clients here is what capped users at 360p: the pinned set
  // (web_safari, web, mweb, tv) turned out to be exactly the clients YouTube
  // now gates behind a GVS PO token this app has no way to mint, while every
  // token-free client was excluded. Per yt-dlp's own extractor tables:
  //   web, web_safari — WEB_PO_TOKEN_POLICIES marks HTTPS and DASH
  //     required=True, so their only ungated formats are HLS, and web_safari
  //     is annotated "Since 2026.07, HLS formats are only returned with some
  //     logged-in or 'trusted' sessions". On a session that is not trusted
  //     these clients contribute nothing usable above 360p.
  //   mweb, tv_simply, android, ios — each carries its own GVS_PO_TOKEN_POLICY
  //     with required=True for HTTPS/DASH. Same dead end.
  //   tv — yt-dlp's workaround for the DRM'd-formats bug (yt-dlp#12563) is
  //     annotated "not effective when logged-in", and this app always sends
  //     cookies, so `tv` is the one state where the workaround does not apply.
  //   android_vr — removed from the fallback: it is annotated "Since
  //     2026.08.17, ALL formats (including live HLS and itag 18) are 403'd",
  //     so it could only make the whole-file retry fail, never succeed.
  // So stop pinning. `default` is yt-dlp's own current choice and it swaps to
  // the authenticated set on its own when cookies are present, which means the
  // next time YouTube rotates which client works this app follows without a
  // release. web_embedded is named explicitly for two reasons: it has no
  // GVS_PO_TOKEN_POLICY at all, and `default` collapses to visionos alone when
  // no JS runtime is installed, which is a thin single point of failure.
  const PLAYER_CLIENTS_PRIMARY = "youtube:player_client=default,web_embedded";
  // Used only when a finished clip comes back far below the resolution the
  // probe listed, so it has to be a genuinely different configuration rather
  // than a superset of the primary: the token-free clients spelled out, in a
  // different order, independent of whatever `default` resolved to. (The
  // 403 retry is a different downloader on the same clients, not this.)
  const PLAYER_CLIENTS_FALLBACK =
    "youtube:player_client=tv_samsung,web_embedded,visionos";

  // Cookie options are deliberately NOT part of this: each yt-dlp run is given
  // its own cookie file by withRunCookies, never the canonical one.
  const commonOptions: Record<string, unknown> = {
    noPlaylist: true,
    noWarnings: true,
    newline: true,
    progress: true,
    // Pick up any `.part` file left in this work folder by a failed run.
    continue: true,
    ffmpegLocation: resolvedFfmpeg,
  };


  const formatOptions: Record<string, unknown> = isAudio
    ? { extractAudio: true, audioFormat: "mp3", audioQuality: quality }
    : { format: videoFormat, mergeOutputFormat: "mp4", remuxVideo: "mp4" };

  // Both attempts are built per client list rather than once, because a clip
  // that comes back far below the resolution YouTube listed is re-run on a
  // different set of clients (see the degraded-delivery check below).

  // Attempt 1: let yt-dlp cut the section (fast, ffmpeg fetches the range).
  // --force-keyframes-at-cuts is what makes the cut frame-accurate: without it
  // the cut snaps to the nearest keyframe and starts early.
  const sectionOptionsFor = (
    clients: string,
    seg: Segment,
    out: string,
    cookies: Record<string, unknown>,
  ): Record<string, unknown> => ({
    ...commonOptions,
    ...cookies,
    ...formatOptions,
    extractorArgs: clients,
    downloadSections: sectionArg(seg),
    forceKeyframesAtCuts: true,
    output: out,
    // Make ffmpeg's range request look like the one that minted the URL.
    addHeader: [
      "Referer:https://www.youtube.com/",
      "Origin:https://www.youtube.com",
    ],
  });

  // Attempt 2 (fallback): yt-dlp downloads the whole media itself (native
  // downloader, no ffmpeg-fetched URLs), then we trim locally.
  const fullPath = path.join(tempDir, `source.${isAudio ? "m4a" : "mp4"}`);
  const fullOptionsFor = (
    clients: string,
    cookies: Record<string, unknown>,
  ): Record<string, unknown> => ({
    ...commonOptions,
    ...cookies,
    extractorArgs: clients,
    // Fetch HLS with yt-dlp's own segment downloader so ffmpeg only ever sees
    // a local file. Older bundled ffmpeg builds crash fetching m3u8 themselves.
    hlsPreferNative: true,
    ...(isAudio
      ? {
          // Protocol is left out of the audio ladder for the same reason as
          // the video one: HLS is no longer reliably offered, so asking for it
          // first meant falling through to `best` and transcoding the muxed
          // 360p stream's audio track.
          format: "bestaudio[ext=m4a]/bestaudio/best",
        }
      : { format: videoFormat, mergeOutputFormat: "mp4" }),
    output: fullPath,
  });

  let options: Record<string, unknown> = sectionOptionsFor(
    PLAYER_CLIENTS_PRIMARY,
    segs[0],
    segFiles[0],
    cookieOptions,
  );

  // Progress is driven by ffmpeg's `... time=HH:MM:SS.ss ...` output, which
  // streams continuously as the clip is processed (yt-dlp routes section
  // downloads through ffmpeg with --download-sections). Progress =
  // processed time / segment length. yt-dlp's own `[download] NN%` only
  // appears once at the very end, so it's used only as a fallback.
  let segDuration = Math.max(0.1, segs[0].end - segs[0].start);
  let lastReported = 0;
  // The named stage the bar is currently in; carried on every tick so the UI
  // always says what the percentage is a percentage of.
  let currentStage = STAGE_FOUND;
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
      publishProgress(jobId, {
        phase: "downloading",
        percent: pct,
        message: currentStage,
        stage: currentStage,
      });
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
      if (secs >= 0) report(secs / segDuration);
      return;
    }
    // Fallback: honor a real yt-dlp download percentage if one is emitted.
    const dm = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    if (dm) report(parseFloat(dm[1]) / 100);
  };


  // Everything the engine wrote to stderr during THIS run, for Copy diagnostics.
  const RUN_STDERR_MAX = 60_000;
  let runStderrRaw = "";

  // Spawn a child and stream its output through updateFromLine, rejecting with
  // the trimmed stderr tail on non-zero exit.
  const runStreaming = (
    spawnChild: () => ChildProcess,
    label: string,
  ): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (job.cancelled) return reject(new CancelledError());
      const child = spawnChild();
      trackChild(child);
      runStderrRaw = `${runStderrRaw}# ${label}\n`.slice(-RUN_STDERR_MAX);
      child.stderr?.on("data", (c: Buffer | string) => {
        runStderrRaw = (runStderrRaw + c.toString()).slice(-RUN_STDERR_MAX);
      });
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
        if (job.cancelled) return reject(new CancelledError());
        if (code === 0) return resolve();
        const tail = stderrTail
          .split(/\r?\n/)
          .filter((l) => l.trim() && !/^\[download\]\s+\d/.test(l))
          .slice(-8)
          .join("\n")
          .trim();
        console.error(`[server] ${label} exit ${code} job=${jobId}:\n${tail}`);
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

  // A finished whole-file download. A `.part` is not one: yt-dlp renames it
  // only once the file is complete.
  const findDownloaded = (): string | null => {
    if (fs.existsSync(fullPath)) return fullPath;
    const match = fs
      .readdirSync(tempDir)
      .filter((f) => f.startsWith("source.") && !/\.(part|ytdl)$/.test(f))
      .map((f) => path.join(tempDir, f))[0];
    return match ?? null;
  };

  // ffmpeg can find a duration in it. A file that was renamed into place
  // part-way (no moov atom) or is otherwise not media has none.
  let verifiedSource: string | null = null;
  const isReadableMedia = (file: string): boolean =>
    probeDurationSec(resolvedFfmpeg as string, file) !== undefined;

  // Everything a build leaves beside the finished clip: segment files, the
  // concat list and the whole-file source. Partials (`.part`) are never
  // touched, they are what a retry resumes from.
  const dropIntermediates = (keepSource: boolean) => {
    const doomed = [...segFiles, listPath];
    if (!keepSource) {
      try {
        for (const f of fs.readdirSync(tempDir)) {
          if (f.startsWith("source.") && !/\.(part|ytdl)$/.test(f)) {
            doomed.push(path.join(tempDir, f));
          }
        }
      } catch {
        /* folder gone */
      }
    }
    for (const f of doomed) {
      try {
        fs.rmSync(f, { force: true });
      } catch {
        /* ignore */
      }
    }
  };

  // One segment on one set of player clients: sectioned first, whole-file-then-
  // trim if the sectioned URLs 403. `state.sectionsForbidden` carries the 403
  // verdict from one segment to the next, so the rest go straight to the local
  // trim instead of failing the same way again.
  const buildSegment = async (
    clients: string,
    index: number,
    state: { sectionsForbidden: boolean },
  ): Promise<void> => {
    throwIfCancelled();
    const seg = segs[index];
    const out = segFiles[index];
    const win = segmentWindow(index, segCount);
    segDuration = Math.max(0.1, seg.end - seg.start);
    // Segment one is the one run allowed to refresh the user's saved session;
    // every other is a throwaway copy.
    await withRunCookies(cookieMode, cookieOptions, index === 0, async (cookies) => {
      const sectionOptions = sectionOptionsFor(clients, seg, out, cookies);
      options = sectionOptions;
      lastReported = win.from;
      scaleFrom = win.from;
      scaleTo = win.to;
      if (!state.sectionsForbidden) {
        console.log(
          `[server] /api/download exec job=${jobId} url=${url} segment=${index + 1}/${segCount} options=${JSON.stringify(sectionOptions)}`,
        );
        try {
          await runStreaming(
            () => yt!.exec(url, sectionOptions, ytOpts()),
            "yt-dlp",
          );
          return;
        } catch (sectionErr) {
          if (job.cancelled || sectionErr instanceof CancelledError) throw sectionErr;
          if (!isForbidden(sectionErr)) throw sectionErr;
          state.sectionsForbidden = true;
          console.warn(
            `[server] sectioned download failed (403) job=${jobId} — retrying with full download + local trim`,
          );
        }
      }

      const fullOptions = fullOptionsFor(clients, cookies);
      options = fullOptions;
      // One segment splits the bar 70/29 exactly as it always has.
      const mid =
        segCount <= 1
          ? 70
          : Math.round(win.from + (win.to - win.from) * 0.7);
      lastReported = win.from;
      scaleFrom = win.from;
      scaleTo = mid;
      publishProgress(jobId, {
        phase: "downloading",
        percent: win.from,
        message: currentStage,
        stage: currentStage,
      });
      // The whole file is the same for every segment, so fetch it once. A
      // copy left by an earlier run is only trusted once ffmpeg can read it:
      // a truncated one used to be kept and re-used forever.
      let source = findDownloaded();
      if (source && source !== verifiedSource && !isReadableMedia(source)) {
        console.warn(
          `[server] job=${jobId} cached download ${source} is not readable media — discarding and fetching it again`,
        );
        try {
          fs.rmSync(source, { force: true });
        } catch {
          /* ignore */
        }
        source = null;
      }
      if (!source) {
        await runStreaming(
          () => yt!.exec(url, fullOptions, ytOpts()),
          "yt-dlp (full)",
        );
        source = findDownloaded();
      }
      if (!source) throw new Error("yt-dlp produced no output");
      if (source !== verifiedSource) {
        if (!isReadableMedia(source)) {
          try {
            fs.rmSync(source, { force: true });
          } catch {
            /* ignore */
          }
          throw new Error(
            "The downloaded video file is damaged and was discarded, so nothing could be cut from it",
          );
        }
        verifiedSource = source;
      }

      scaleFrom = mid;
      scaleTo = win.to;
      lastReported = mid;
      const trimArgs = isAudio
        ? [
            "-hide_banner",
            "-y",
            "-ss",
            String(seg.start),
            "-to",
            String(seg.end),
            "-i",
            source,
            "-vn",
            "-c:a",
            "libmp3lame",
            "-b:a",
            `${quality}k`,
            out,
          ]
        : localTrimArgs(source, seg, out);
      await runStreaming(
        () =>
          spawn(resolvedFfmpeg as string, trimArgs, {
            env: childEnv(),
            windowsHide: true,
            shell: false,
            detached: process.platform !== "win32",
          }),
        "ffmpeg (trim)",
      );
      // A lone segment is done with the source. Several share it, so it goes
      // when the whole clip is built.
      if (!multi) {
        try {
          fs.rmSync(source, { force: true });
        } catch {
          /* ignore */
        }
      }
    });
  };

  // How the last join was made, for the response and the log.
  let joinMethod: "copy" | "reencode" | null = null;

  // One complete build of the clip on one set of player clients: each segment
  // in order, then (for several) the join into one file.
  const buildClip = async (clients: string): Promise<void> => {
    lastReported = 0;
    let built = false;
    const state = { sectionsForbidden: false };
    try {
      for (let i = 0; i < segCount; i++) {
        currentStage = stageDownloading(i + 1, segCount);
        publishProgress(jobId, {
          phase: "downloading",
          percent: Math.max(lastReported, segmentWindow(i, segCount).from),
          message: currentStage,
          stage: currentStage,
          segment: i + 1,
          segments: segCount,
        });
        await buildSegment(clients, i, state);
        const win = segmentWindow(i, segCount);
        currentStage = stageDownloaded(i + 1, segCount);
        lastReported = Math.max(lastReported, win.to);
        publishProgress(jobId, {
          phase: "downloading",
          percent: win.to,
          message: currentStage,
          stage: currentStage,
          segment: i + 1,
          segments: segCount,
        });
      }

      if (multi) {
        throwIfCancelled();
        currentStage = stageJoining(segCount);
        publishProgress(jobId, {
          phase: "processing",
          percent: 92,
          message: currentStage,
          stage: currentStage,
        });
        const join = await joinSegments(
          segFiles,
          outputPath,
          listPath,
          totalSec,
          { isAudio, audioKbps: quality },
          {
            // The join ffmpeg is a child of the job like any other: a cancel
            // kills it, and once cancelled no further join attempt starts.
            run: (args) =>
              job.cancelled
                ? Promise.resolve({ code: -1, stderr: "cancelled" })
                : runProcess(
                    resolvedFfmpeg as string,
                    args,
                    childEnv(),
                    trackChild,
                  ),
            probeDuration: (file) =>
              probeDurationSec(resolvedFfmpeg as string, file),
            log: (m) => console.log(`[server] /api/download job=${jobId} ${m}`),
          },
        );
        throwIfCancelled();
        joinMethod = join.method;
        if (!join.durationOk) {
          // The server's own check says this is not the clip that was marked.
          // Delivering it as a success is how a wrong clip got silently saved;
          // fail instead, with the pieces' measurements in the message.
          const got =
            join.duration === undefined
              ? "of unreadable length"
              : `${join.duration.toFixed(2)}s long`;
          const msg = `The joined clip came out ${got} but the marked ranges total ${totalSec.toFixed(2)}s`;
          console.warn(
            `[server] /api/download job=${jobId} ${msg} even after ${join.method} — failing the job`,
          );
          try {
            fs.rmSync(outputPath, { force: true });
          } catch {
            /* ignore */
          }
          const err: any = new Error(msg);
          err.tail = msg;
          err.joinFailed = true;
          throw err;
        }
      }
      if (!multi && fs.existsSync(segFiles[0])) {
        // The finished segment is the clip. A rename within the temp root is
        // atomic and leaves no `.part` behind it.
        fs.renameSync(segFiles[0], outputPath);
      }
      built = true;
    } finally {
      // Success or failure, the pieces are not the deliverable. On success the
      // whole-file source goes too; on failure it stays, a resumable download.
      dropIntermediates(!built);
    }
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
    await buildClip(PLAYER_CLIENTS_PRIMARY);
    throwIfCancelled();

    if (!fs.existsSync(outputPath)) {
      // Resumable partials deliberately kept so the next attempt can resume.
      pruneWorkDir(tempDir);
      releaseWork(false);
      const f = classifyFailure("yt-dlp produced no output");
      publishProgress(jobId, {
        phase: "error",
        percent: 0,
        message: "no output",
      });
      return sendFailure(res, f, diag("yt-dlp produced no output"));
    }

    publishProgress(jobId, { phase: "processing", percent: 99 });

    // Report what was actually delivered: YouTube's SABR rollout can leave a
    // video whose only fetchable renditions sit below the requested height, so
    // the clip legitimately completes at a lower resolution. Probed with the
    // resolved ffmpeg (ffprobe is not bundled) and passed back as headers since
    // the response body is the media stream itself.
    let delivered = probeDelivered(outputPath, resolvedFfmpeg as string);

    // The 360p-from-a-1080p-video bug was invisible for months because the
    // two numbers that prove it — what the probe listed and what came out —
    // only ever met in a log line. A clip that lands below half of what both
    // the request and the probe said was reachable is not a compromise, it is
    // a player client that handed back nothing usable, so it is worth paying
    // for one more download on a different client set before giving up.
    const requestedHeight: number | "best" =
      quality === "best" ? "best" : Number(quality);
    let degraded = isDegradedDelivery(
      delivered.height,
      requestedHeight,
      availableHeights,
    );
    if (degraded) {
      console.warn(
        `[server] /api/download degraded job=${jobId} requested=${quality} delivered=${delivered.height ?? "?"} available=${availableHeights.join(",") || "unknown"} — rebuilding on ${PLAYER_CLIENTS_FALLBACK}`,
      );
      publishProgress(jobId, {
        phase: "downloading",
        percent: 0,
        message:
          "YouTube served a much lower resolution than it listed — retrying with a different player client.",
      });
      // The degraded clip is moved aside rather than deleted: if the retry
      // fails outright the user still gets a watchable clip instead of an
      // error, which is what they had before this check existed.
      const keptPath = path.join(clipDir, `degraded.${ext}`);
      const keptFormat = chosenFormat;
      try {
        fs.rmSync(keptPath, { force: true });
      } catch {
        /* ignore */
      }
      fs.renameSync(outputPath, keptPath);
      try {
        chosenFormat = "";
        await buildClip(PLAYER_CLIENTS_FALLBACK);
        if (!fs.existsSync(outputPath)) {
          throw new Error("yt-dlp produced no output");
        }
      } catch (retryErr) {
        if (job.cancelled || retryErr instanceof CancelledError) throw retryErr;
        const why =
          retryErr instanceof Error ? retryErr.message : String(retryErr);
        console.warn(
          `[server] /api/download degraded retry failed job=${jobId}: ${why} — keeping the ${delivered.height ?? "?"}p clip`,
        );
        chosenFormat = keptFormat;
        try {
          fs.rmSync(outputPath, { force: true });
        } catch {
          /* ignore */
        }
        fs.renameSync(keptPath, outputPath);
      }
      try {
        fs.rmSync(keptPath, { force: true });
      } catch {
        /* ignore */
      }
      publishProgress(jobId, { phase: "processing", percent: 99 });
      delivered = probeDelivered(outputPath, resolvedFfmpeg as string);
      degraded = isDegradedDelivery(
        delivered.height,
        requestedHeight,
        availableHeights,
      );
    }

    // A 360p file with no confirmed session behind it is the expired-sign-in
    // failure, not a quality choice. The clip is still delivered (it is real
    // work), but it never passes silently: the cause and the one fix travel
    // with it.
    const lowQuality = lowQualityWithoutSession({
      deliveredHeight: delivered.height,
      requested: requestedHeight,
      sessionValid: sessionConfirmed,
      isAudio,
    })
      ? staleSessionFailure(200, "The 360p clip is kept.")
      : null;
    if (lowQuality) {
      console.warn(
        `[server] /api/download low quality without a session job=${jobId} delivered=${delivered.height} auth=${cookieMode} confirmed=${sessionConfirmed}`,
      );
    }

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
    res.setHeader("X-Segments", String(segCount));
    if (joinMethod) res.setHeader("X-Join-Method", joinMethod);
    if (lowQuality) {
      res.setHeader("X-Quality-Cause", lowQuality.code);
      res.setHeader("X-Quality-Message", lowQuality.cause);
      res.setHeader("X-Quality-Action", lowQuality.action.id);
    }
    // Both client sets came back degraded. Nothing left to retry, so say so
    // out loud rather than letting a 360p file pass for a 1080p download.
    if (degraded) {
      res.setHeader("X-Quality-Degraded", "1");
      console.error(
        `[server] /api/download still degraded job=${jobId} requested=${quality} delivered=${delivered.height ?? "?"} available=${availableHeights.join(",") || "unknown"} format=${chosenFormat || "?"} auth=${cookieMode}`,
      );
    }
    console.log(
      `[server] /api/download built job=${jobId} requested=${quality} delivered=${delivered.height ?? "?"} format=${chosenFormat || "?"} auth=${cookieMode} segments=${segCount}${joinMethod ? ` join=${joinMethod}` : ""}`,
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "X-Delivered-Height, X-Delivered-Audio-Kbps, X-Selected-Format, X-Available-Heights, X-Auth-Mode, X-Quality-Degraded, X-Segments, X-Join-Method, X-Quality-Cause, X-Quality-Message, X-Quality-Action",
    );


    // The clip is built: from here on it is a transfer, not a build.
    job.building = false;
    const stat = fs.statSync(outputPath);
    publishProgress(jobId, {
      phase: "processing",
      percent: 99,
      message: STAGE_WRITING,
      stage: STAGE_WRITING,
    });

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
      publishProgress(jobId, {
        phase: "done",
        percent: 100,
        ...(lowQuality ? { message: lowQuality.error } : {}),
      });
      // The clip's only copy is in clipDir until the main process moves it, so
      // Clear cache must leave it alone for a while after this response.
      holdFolder(clipDir);
      releaseWork(true);
      return res.json({
        path: outputPath,
        size: stat.size,
        segments: segCount,
        ...(joinMethod ? { joinMethod } : {}),
        ...(lowQuality
          ? {
              warning: {
                code: lowQuality.code,
                cause: lowQuality.cause,
                action: lowQuality.action,
                preserved: lowQuality.preserved,
                error: lowQuality.error,
              },
            }
          : {}),
      });
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
      // the finished clip (held, so Clear cache leaves it for a while).
      if (ok) cleanup();
      else {
        holdFolder(clipDir);
        releaseWork(true);
      }
    };


    stream.on("data", (chunk) => {
      sent += chunk.length;
    });
    stream.on("error", (err) => settle("read error", err));
    res.on("error", (err) => settle("response error", err));
    res.on("close", () => settle("connection closed early"));
    stream.pipe(res);
  } catch (e) {
    // What is on disk now is what a retry resumes from. Measure it before the
    // work folder is pruned down to exactly that: partial downloads stay,
    // finished segment files, the concat list and half-written joins go.
    const partial = partialBytes(tempDir);
    pruneWorkDir(tempDir);
    releaseWork(false);
    if (job.cancelled || e instanceof CancelledError) return sendCancelled();
    if (cookiesFromBrowser && isCookieError(e)) {
      const msg = cookieErrorMessage(cookiesFromBrowser);
      publishProgress(jobId, { phase: "error", percent: 0, message: msg });
      return res.status(400).json({
        error: msg,
        diagnostics: buildRunDiagnostics(jobId, fullErrMessage(e)),
      });
    }
    logYtError("/api/download", url, options, e);

    const raw = fullErrMessage(e);
    console.error(`[server] /api/download failed job=${jobId}: ${raw.slice(0, 400)}`);
    // The per-run record for Copy diagnostics: this run's stderr and job id,
    // never the whole log. A failure that never reached a child process still
    // carries what the error itself said.
    const diagnostics = buildRunDiagnostics(jobId, runStderrRaw || raw);
    // Keep the friendly sentence but append the real yt-dlp stderr tail so the
    // next YouTube-side change is diagnosable straight from the UI.
    const tail = ((e as { tail?: string } | null)?.tail || raw || "").trim();
    let failure: ClipFailure;
    if ((e as { joinFailed?: boolean } | null)?.joinFailed) {
      failure = joinFailure(tail);
    } else {
      const ctx = { percent: lastReported, partialBytes: partial };
      failure = classifyFailure(raw, ctx);
      if (failure.code === "disk_full") {
        let freeMb: number | undefined;
        try {
          const st = fs.statfsSync(os.tmpdir());
          freeMb = Math.floor((st.bavail * st.bsize) / (1024 * 1024));
        } catch {
          /* statfs unavailable: say it without the numbers */
        }
        failure = classifyFailure(raw, {
          ...ctx,
          freeMb,
          neededMb: estimateNeededMb(totalSec, quality, isAudio, segCount),
        });
      } else if (failure.code === "unknown" && isForbidden(e)) {
        failure = refusedFailure(tail);
      }
    }
    publishProgress(jobId, {
      phase: "error",
      percent: 0,
      message: failure.error,
    });
    sendFailure(res, failure, { diagnostics });
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

  let options: Record<string, unknown> = {};
  try {
    const info = await withRunCookies(
      cookieModeFor(parsed.data.cookiesFromBrowser),
      resolveCookieOptions(parsed.data.cookiesFromBrowser),
      false,
      (cookies) => {
        options = {
          dumpSingleJson: true,
          writeComments: true,
          noPlaylist: true,
          noWarnings: true,
          // Fetch every top-level comment and every reply. `all` avoids
          // yt-dlp's default cap so nothing is truncated on large videos.
          extractorArgs:
            "youtube:comment_sort=top;max_comments=all,all,all,all",
          ...cookies,
        };
        console.log(
          `[server] /api/comments url=${parsed.data.url} options=${JSON.stringify(options)}`,
        );
        return yt!.run(parsed.data.url, options, {
          env: childEnv(),
        } as any);
      },
    );
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
  /** Named stage: Found the stream, Downloaded segment n of m, Joining n segments, Writing to your folder. */
  stage?: string;
  segment?: number;
  segments?: number;
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
// Channel profile exporter — lives in ./channelRoutes. It exists only in builds
// made with VITE_ENABLE_CHANNEL_DATA (the same flag that gates the UI): without
// it scripts/build-server.cjs aliases "./channelRoutes" to an empty stub, so the
// exporter's code and URLs are absent from the packaged server, not just
// unregistered. The runtime check below only matters when running from source
// (`npm run dev:server`, tests); it is not what keeps the code out of a build.
// ---------------------------------------------------------------------------
const CHANNEL_FLAG_RE = /^(1|true|yes|on)$/i;
function readChannelFlag(): boolean {
  const fromEnv = String(process.env.VITE_ENABLE_CHANNEL_DATA ?? "").trim();
  if (fromEnv) return CHANNEL_FLAG_RE.test(fromEnv);
  // `npm run dev:server` does not load .env, so read it there. Never in the packaged app.
  if (process.env.ELECTRON_RESOURCES) return false;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
    const line = raw.split(/\r?\n/).find((l) => l.startsWith("VITE_ENABLE_CHANNEL_DATA="));
    return CHANNEL_FLAG_RE.test((line ? line.split("=").slice(1).join("=") : "").trim());
  } catch {
    return false;
  }
}

if (readChannelFlag()) {
  registerChannelRoutes(app, {
    app,
    yt,
    binariesOk,
    binaryError,
    resolvedFfmpeg,
    urlSchema,
    authSourceSchema,
    childEnv,
    appCookieFile,
    resolveCookieOptions,
    parseVtt,
    fullErrMessage,
    logYtError,
  });
}


// --- Resume cache -------------------------------------------------------

app.get("/api/cache/usage", (_req: Request, res: Response) => {
  return res.json(cacheUsage());
});

app.post("/api/cache/clear", (_req: Request, res: Response) => {
  // Folders a running job is writing to, and finished clips still waiting to be
  // collected, are skipped: this clears abandoned work, nothing in flight.
  const { removed, skipped } = clearCache();
  console.log(
    `[server] cleared ${removed} unfinished work folder(s), left ${skipped} in use`,
  );
  return res.json({ ok: true, removed, skipped, ...cacheUsage() });
});

// SPA fallback for the packaged UI — must be registered after all API routes.
if (uiDir && fs.existsSync(uiDir)) {
  app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(uiDir, "index.html"));
  });
}

// --- Errors ---------------------------------------------------------------
//
// Express's default handler answers with an HTML page holding the stack trace,
// and so the absolute install path (and the user's name in it). Every failure
// that reaches here is answered as {error, code}, with nothing from the stack.
// The full error goes to the server log only.

app.use("/api", (req: Request, res: Response) => {
  res
    .status(404)
    .json({ error: `No such endpoint: ${req.method} ${req.path.slice(0, 120)}`, code: "not_found" });
});

export function errorResponseFor(err: unknown): {
  status: number;
  body: { error: string; code: string };
} {
  const e = (err ?? {}) as { type?: string; status?: number; statusCode?: number };
  switch (e.type) {
    case "entity.parse.failed":
      return {
        status: 400,
        body: {
          error:
            "The request body is not valid JSON (an object is expected).",
          code: "invalid_json",
        },
      };
    case "entity.too.large":
      return {
        status: 413,
        body: {
          error: `The request body is larger than the ${JSON_BODY_LIMIT} this server accepts.`,
          code: "body_too_large",
        },
      };
    case "encoding.unsupported":
    case "charset.unsupported":
      return {
        status: 415,
        body: {
          error: "The request body uses an encoding this server does not accept.",
          code: "unsupported_encoding",
        },
      };
    case "request.aborted":
    case "request.size.invalid":
    case "stream.encoding.set":
      return {
        status: 400,
        body: { error: "The request body could not be read.", code: "bad_body" },
      };
  }
  const status = e.status ?? e.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return {
      status,
      body: { error: "The request could not be processed.", code: "bad_request" },
    };
  }
  return {
    status: 500,
    body: {
      error: "The server hit an unexpected error. Try again.",
      code: "server_error",
    },
  };
}

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  const { status, body } = errorResponseFor(err);
  console.error(
    `[server] ${req.method} ${req.path} -> ${status} ${body.code}: ${
      err instanceof Error ? err.message : String(err)
    }`,
  );
  if (res.headersSent) return next(err);
  res.status(status).json(body);
});

// Loopback only: with no host Node binds every interface, which put the whole
// API on the user's LAN.
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[server] listening on http://127.0.0.1:${PORT}`);
  const swept = sweepStaleCache();
  if (swept) console.log(`[server] swept ${swept} stale work folder(s)`);
});
