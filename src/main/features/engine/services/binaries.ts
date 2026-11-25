/**
 * File: binaries.ts
 * Path: src/main/features/engine/services/binaries.ts
 * Description: Locates yt-dlp, ffmpeg and the bundled bin folder, builds the child environment and runs the start-up preflight.
 */
import fs from "node:fs";
import path from "node:path";
import { execFile, execSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import dargs from "dargs";
import ffmpegPath from "ffmpeg-static";
import { isNewer, newestToolFile } from "./toolUpdate";

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

export const BIN_DIR = resolveBinDir();

export function childEnv(): NodeJS.ProcessEnv {
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
  /** Known without running it (the tools file name, or the version file shipped beside the bundled one); null when not. */
  version: string | null;
}

// Build a runner around a resolved yt-dlp binary that spawns it directly.
// This is the authoritative fix for the space-in-path spawn bug: node's
// `spawn(executable, args)` treats `executable` as an atomic path — no shell
// interpretation, no split-on-space.
function makeRunner(binary: string, source: string, version: string | null = null): YtResolved {
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
        (execaOpts?.onStderr as ((text: string) => void) | undefined)?.(stderr);
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
  return { run, exec, source, binary, version };
}

// Read `yt-dlp --version` (e.g. "2026.07.04"). Null when the binary won't run. This RUNS yt-dlp and waits, so it must
// never be on the start-up path: the first run of a freshly installed unsigned yt-dlp on a Mac is slow (macOS checks it
// and the one-file build unpacks itself), and the main process, which also serves the window, stands still meanwhile.
export function ytDlpVersion(binary: string): string | null {
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

/** The same question, asked without holding the main process still. */
export function ytDlpVersionAsync(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(binary, ["--version"], { timeout: 30_000, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : String(stdout).trim() || null);
    });
  });
}

/** The version the build recorded beside the bundled yt-dlp (`yt-dlp.version`), or null when it did not. Reads a small file. */
export function bundledYtDlpVersion(binary: string): string | null {
  try {
    const v = fs.readFileSync(path.join(path.dirname(binary), "yt-dlp.version"), "utf8").trim();
    return /^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** The version of the yt-dlp in use: what is already known, and only if that is nothing, by running it. */
export function versionOfResolved(r: YtResolved | null): string | null {
  if (!r) return null;
  return r.version ?? ytDlpVersion(r.binary);
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
/** A yt-dlp the app fetched itself into its tools folder (see toolUpdate.ts), newest wins. */
function updatedYtDlp(): { path: string; version: string } | null {
  const dir = process.env.YT_CLIPPER_TOOLS_DIR;
  if (!dir) return null;
  try {
    const best = newestToolFile(fs.readdirSync(dir));
    return best ? { path: path.join(dir, best.name), version: best.version } : null;
  } catch {
    return null;
  }
}

/**
 * Which yt-dlp to use. `versionOf` answers for a binary: at start-up it only reports what is known without running
 * the binary, so nothing is spawned while the app opens; settleYtDlp() later asks again with real versions.
 */
function resolveYtDlp(versionOf: (binary: string, known: string | null) => string | null = (_b, known) => known): YtResolved | null {
  const packaged = packagedBinary("yt-dlp");
  const devBundled = BIN_DIR
    ? path.join(BIN_DIR, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp")
    : null;
  const bundled =
    packaged ?? (devBundled && fs.existsSync(devBundled) ? devBundled : null);
  const system = systemYtDlp();
  const bv = bundled ? versionOf(bundled, bundledYtDlpVersion(bundled)) : null;
  const sv = system ? versionOf(system, null) : null;

  const updated = updatedYtDlp();
  if (updated && (!bv || isNewer(updated.version, bv)) && (!sv || isNewer(updated.version, sv))) {
    console.log(`[server] using the updated yt-dlp ${updated.version}`);
    return makeRunner(updated.path, `updated (${updated.path})`, updated.version);
  }

  if (bundled && system && system !== bundled && sv && (!bv || isNewer(sv, bv))) {
    console.log(`[server] system yt-dlp ${sv} is newer than bundled ${bv ?? "(unknown)"} — using system binary`);
    return makeRunner(system, `system (${system})`, sv);
  }
  if (bundled) {
    const label = packaged ? "packaged" : "bundled";
    return makeRunner(bundled, `${label} (${bundled})`, bv);
  }
  if (system) return makeRunner(system, `system (${system})`, sv);
  return null;
}

export const yt = resolveYtDlp();

/** Picks up a freshly installed yt-dlp in place, so every importer of `yt` sees it. */
export function reloadYtDlp(): void {
  const next = resolveYtDlp();
  if (yt && next) Object.assign(yt, next);
}

/**
 * Once the window is up: when a different yt-dlp is installed on the computer, ask both for their versions (without
 * holding the main process still) and switch if the other is newer. When there is no other one, nothing runs.
 */
export async function settleYtDlp(): Promise<void> {
  if (!yt) return;
  const bundled = packagedBinary("yt-dlp") ?? (BIN_DIR ? path.join(BIN_DIR, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp") : null);
  const system = systemYtDlp();
  if (!system || system === bundled || system === yt.binary) return;
  const found = new Map<string, string | null>();
  for (const b of [bundled && fs.existsSync(bundled) ? bundled : null, system]) {
    if (b) found.set(b, bundledYtDlpVersion(b) ?? (await ytDlpVersionAsync(b)));
  }
  const next = resolveYtDlp((binary, known) => found.get(binary) ?? known);
  if (next && next.binary !== yt.binary) Object.assign(yt, next);
}
// A few seconds after start, never during it.
setTimeout(() => void settleYtDlp().catch(() => {}), 5000).unref?.();
const packagedFfmpeg = packagedBinary("ffmpeg");
export const resolvedFfmpeg = packagedFfmpeg || ffmpegPath;
const ffmpegOk = Boolean(resolvedFfmpeg && fs.existsSync(resolvedFfmpeg));

// Read the actual video height / audio bitrate of a produced file by parsing
// `ffmpeg -i <file>` stream info (ffprobe is not part of the bundled binaries).
export function probeDelivered(
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

export const binariesOk = preflight();
