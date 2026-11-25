/**
 * File: binaries.ts
 * Path: src/main/features/engine/services/binaries.ts
 * Description: Locates yt-dlp, ffmpeg and the bundled bin folder, builds the child environment and runs the start-up preflight.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
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
  return { run, exec, source, binary };
}

// Read `yt-dlp --version` (e.g. "2026.07.04"). Null when the binary won't run.
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

function resolveYtDlp(): YtResolved | null {
  const packaged = packagedBinary("yt-dlp");
  const devBundled = BIN_DIR
    ? path.join(BIN_DIR, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp")
    : null;
  const bundled =
    packaged ?? (devBundled && fs.existsSync(devBundled) ? devBundled : null);
  const system = systemYtDlp();

  const updated = updatedYtDlp();
  if (updated) {
    const bv = bundled ? ytDlpVersion(bundled) : null;
    const sv = system ? ytDlpVersion(system) : null;
    if ((!bv || isNewer(updated.version, bv)) && (!sv || isNewer(updated.version, sv))) {
      console.log(`[server] using the updated yt-dlp ${updated.version}`);
      return makeRunner(updated.path, `updated (${updated.path})`);
    }
  }

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

export const yt = resolveYtDlp();

/** Picks up a freshly installed yt-dlp in place, so every importer of `yt` sees it. */
export function reloadYtDlp(): void {
  const next = resolveYtDlp();
  if (yt && next) Object.assign(yt, next);
}
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
