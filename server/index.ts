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

const downloadSchema = z
  .object({
    url: urlSchema,
    start: z.number().nonnegative(),
    end: z.number().positive(),
    format: z.enum(["mp4", "mp3"]).default("mp4"),
    quality: z.string().default("best"),
    // Optional sign-in path: yt-dlp reads the logged-in YouTube session
    // directly from the named browser at runtime. Cookie contents never touch
    // this process — only the browser name is accepted, from an allowlist.
    cookiesFromBrowser: cookieBrowserSchema.optional(),
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

const AUTH_PROBE_TIMEOUT_MS = 15_000;
const AUTH_PROBE_URL = "https://www.youtube.com/watch?v=BaW_jenozKc";

function authProbeMessage(
  browser: CookieBrowserName,
  status: YouTubeAuthProbeStatus,
): string | undefined {
  const label = browser[0].toUpperCase() + browser.slice(1);
  if (status === "signed_out")
    return `No YouTube account cookies were found in ${label}.`;
  if (status === "profile_missing")
    return `No ${label} profile was found on this computer.`;
  if (status === "locked")
    return `Fully quit ${label}, including background windows, then check again.`;
  if (status === "decrypt_failed")
    return `${label}'s cookie security blocked access. Firefox is the most reliable alternative.`;
  if (status === "timeout")
    return `${label} took too long to respond. Quit it fully, then try again.`;
  if (status === "extractor_error")
    return "YouTube could not be checked right now. Update the app or try again later.";
  return undefined;
}

function probeBrowserAuth(
  browser: CookieBrowserName,
  onChild: (child: ChildProcess | null) => void,
): Promise<YouTubeAuthProbeStatus> {
  return new Promise((resolve) => {
    const child = yt!.exec(
      AUTH_PROBE_URL,
      { cookiesFromBrowser: browser, simulate: true, verbose: true },
      { env: childEnv() },
    );
    onChild(child);
    const chunks: Buffer[] = [];
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (status: YouTubeAuthProbeStatus) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      onChild(null);
      resolve(status);
    };
    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", (error) => finish(classifyYouTubeAuthOutput(String(error))));
    child.on("close", () =>
      finish(classifyYouTubeAuthOutput(Buffer.concat(chunks).toString())),
    );
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish("timeout");
    }, AUTH_PROBE_TIMEOUT_MS);
  });
}

app.post("/api/auth/youtube/status", async (req: Request, res: Response) => {
  const parsed = z
    .object({ browser: cookieBrowserSchema.optional() })
    .safeParse(req.body ?? {});
  if (!parsed.success)
    return res.status(400).json({ error: "Unknown browser" });
  if (!binariesOk) return binaryError(res);

  if (!parsed.data.browser)
    return res.status(400).json({ error: "Choose a browser" });
  let activeChild: ChildProcess | null = null;
  res.on("close", () => {
    if (!res.writableEnded && activeChild) activeChild.kill("SIGKILL");
  });
  const status = await probeBrowserAuth(parsed.data.browser, (child) => {
    activeChild = child;
  });
  if (res.writableEnded || res.destroyed) return;
  return res.json({
    status,
    browser: parsed.data.browser,
    message: authProbeMessage(parsed.data.browser, status),
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
    cookiesFromBrowser,
    cookieFile,
  }: DownloadInput = parsed.data;
  // Either the app-managed cookies.txt (in-app sign-in) or a browser name.
  // Cookie contents are never read or logged by this process.
  const cookieOptions: Record<string, unknown> = resolveCookieOptions(
    cookieFile,
    cookiesFromBrowser,
  );

  const jobId =
    typeof req.query.jobId === "string" && req.query.jobId
      ? req.query.jobId
      : `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Re-probe duration so the cap can't be bypassed by a crafted request.
  const probeOptions: Record<string, unknown> = {
    dumpSingleJson: true,
    noWarnings: true,
    noPlaylist: true,
    ...cookieOptions,
  };
  try {
    console.log(
      `[server] /api/download probe url=${url} options=${JSON.stringify(probeOptions)}`,
    );
    const info = await yt!.run(url, probeOptions, { env: childEnv() } as any);
    if (typeof info.duration === "number" && end > info.duration + 1) {
      return res.status(400).json({ error: "End exceeds video duration" });
    }
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ytclip-"));
  const outputPath = path.join(tempDir, `clip.${ext}`);
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
  // quality on videos whose HLS ladder tops out below the requested height, so
  // each tier offers an HLS candidate AND a DASH candidate at the requested
  // height before degrading to a lower resolution.
  const videoFormat =
    quality === "best"
      ? "bestvideo[protocol*=m3u8]+bestaudio[protocol*=m3u8]/bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]/best[protocol*=m3u8]/best[ext=mp4]/best"
      : `bestvideo[height<=${quality}][protocol*=m3u8]+bestaudio[protocol*=m3u8]/bestvideo[height<=${quality}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]/best[protocol*=m3u8][height<=${quality}]/best[ext=mp4][height<=${quality}]/best[height<=${quality}]`;

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
  const updateFromLine = (line: string) => {
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
    publishProgress(jobId, { phase: "downloading", percent: 0 });
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
      cleanup();
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
    res.setHeader(
      "Access-Control-Expose-Headers",
      "X-Delivered-Height, X-Delivered-Audio-Kbps",
    );

    const stat = fs.statSync(outputPath);
    const name = `clip.${ext}`;
    res.setHeader("Content-Type", isAudio ? "audio/mpeg" : "video/mp4");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on("close", () => {
      publishProgress(jobId, { phase: "done", percent: 100 });
      cleanup();
    });
    stream.on("error", () => {
      publishProgress(jobId, {
        phase: "error",
        percent: 0,
        message: "stream error",
      });
      cleanup();
    });
  } catch (e) {
    if (cookiesFromBrowser && isCookieError(e)) {
      cleanup();
      const msg = cookieErrorMessage(cookiesFromBrowser);
      publishProgress(jobId, { phase: "error", percent: 0, message: msg });
      return res.status(400).json({ error: msg });
    }
    logYtError("/api/download", url, options, e);
    cleanup();
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

const CANDIDATE_CAP = 3000; // flat-listing depth used before ranking
const SHORT_MAX_SECONDS = 60;

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
  limit: z.number().int().min(1).max(500).default(100),
  includeComments: z.boolean().default(true),
  includeTranscripts: z.boolean().default(true),
  cookiesFromBrowser: cookieBrowserSchema.optional(),
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

async function listChannelTab(
  job: ChannelJob,
  tabUrl: string,
  cookieOptions: Record<string, unknown>,
): Promise<{ entries: FlatEntry[]; channelName: string; subs: number | "" }> {
  const info = await runForJob(job, tabUrl, {
    dumpSingleJson: true,
    flatPlaylist: true,
    noWarnings: true,
    playlistEnd: CANDIDATE_CAP,
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
  const job = getOrCreateChannelJob(jobId);
  const cookieOptions: Record<string, unknown> = input.cookiesFromBrowser
    ? { cookiesFromBrowser: input.cookiesFromBrowser }
    : {};

  res.on("close", () => {
    if (!res.writableEnded) cancelChannelJob(jobId);
  });

  const videos: Record<string, unknown>[] = [];
  const comments: Record<string, unknown>[] = [];
  const transcripts: Record<string, unknown>[] = [];
  const statuses: Record<string, unknown>[] = [];
  let channelName = "";
  let subs: number | "" = "";

  try {
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
    let listedAny = false;
    let lastListError = "";
    for (const tab of tabs) {
      try {
        const { entries, channelName: name, subs: s } = await listChannelTab(
          job,
          tab,
          cookieOptions,
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
        for (const v of tabVideos.slice(0, input.limit * 2)) seen.set(v.id, v);
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

    // Full metadata for the candidate pool (duration, views, likes, comments).
    let metaDone = 0;
    publishChannel(jobId, {
      phase: "metadata",
      current: 0,
      total: pool.length,
      label: "Collecting video details",
    });
    const metas = await mapLimit(pool, META_CONCURRENCY, async (v) => {
      if (job.cancelled) return null;
      try {
        const info = await runForJob(
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
        );
        return info;
      } catch {
        return null;
      } finally {
        metaDone += 1;
        publishChannel(jobId, {
          phase: "metadata",
          current: metaDone,
          total: pool.length,
          label: v.title || v.id,
        });
      }
    });
    if (job.cancelled) throw new Error("cancelled");

    const rows = pool.map((v, i) => {
      const m = (metas[i] ?? {}) as Record<string, any>;
      const duration = Number(m.duration) || v.duration;
      const views =
        typeof m.view_count === "number" ? m.view_count : v.view_count;
      return {
        video_id: v.id,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        title: m.title ?? v.title,
        description: m.description ?? "",
        upload_date: m.upload_date ?? "",
        duration_seconds: duration,
        is_short: duration > 0 && duration <= SHORT_MAX_SECONDS,
        view_count: views,
        like_count: typeof m.like_count === "number" ? m.like_count : "",
        comment_count:
          typeof m.comment_count === "number" ? m.comment_count : "",
        channel: m.channel ?? channelName,
        thumbnail: m.thumbnail ?? "",
        tags: Array.isArray(m.tags) ? m.tags.join("; ") : "",
        tag_count: Array.isArray(m.tags) ? m.tags.length : 0,
        ...extractHashtags(m),

      };
    });

    let ranked = rows;
    if (input.contentType === "shorts") {
      ranked = ranked.filter(
        (r) => r.duration_seconds === 0 || r.is_short === true,
      );
    } else if (input.contentType === "longform") {
      ranked = ranked.filter(
        (r) => r.duration_seconds === 0 || r.is_short === false,
      );
    }
    ranked.sort((a, b) => Number(b.view_count) - Number(a.view_count));
    const selected = ranked.slice(0, input.limit).map((r) => ({
      id: String(r.video_id),
      title: String(r.title),
    }));
    if (selected.length === 0)
      throw new Error("No videos matched that filter on this channel.");
    videos.push(...ranked.slice(0, input.limit));


    // Per-video comments + transcripts. Sequential: these are the heavy calls
    // and YouTube throttles parallel comment scrapes aggressively.
    if (input.includeComments || input.includeTranscripts) {
      for (let i = 0; i < selected.length; i++) {
        if (job.cancelled) break;
        const v = selected[i];
        const videoUrl = `https://www.youtube.com/watch?v=${v.id}`;
        const notes: string[] = [];
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
              comments.push({
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
            transcripts.push({
              video_id: v.id,
              start: l.start,
              end: l.end,
              text: l.text,
            });
          }
        }

        statuses.push({
          video_id: v.id,
          title: v.title,
          status: notes.length === 0 ? "ok" : notes.join("; "),
        });
      }
    }

    const cancelled = job.cancelled;
    publishChannel(jobId, {
      phase: cancelled ? "cancelled" : "done",
      current: selected.length,
      total: selected.length,
    });
    return res.json({
      jobId,
      cancelled,
      channel: {
        name: channelName || base,
        url: base,
        subscriber_count: subs,
        exported_at: new Date().toISOString(),
        filter: input.contentType,
        requested: input.limit,
        exported: videos.length,
      },
      videos,
      comments,
      transcripts,
      statuses,
    });
  } catch (e) {
    const cancelled = job.cancelled || (e as Error)?.message === "cancelled";
    if (cancelled) {
      publishChannel(jobId, {
        phase: "cancelled",
        current: videos.length,
        total: videos.length,
      });
      if (res.writableEnded || res.destroyed) return;
      return res.json({
        jobId,
        cancelled: true,
        channel: {
          name: channelName || base,
          url: base,
          subscriber_count: subs,
          exported_at: new Date().toISOString(),
          filter: input.contentType,
          requested: input.limit,
          exported: videos.length,
        },
        videos,
        comments,
        transcripts,
        statuses,
      });
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


// SPA fallback for the packaged UI — must be registered after all API routes.
if (uiDir && fs.existsSync(uiDir)) {
  app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(uiDir, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});