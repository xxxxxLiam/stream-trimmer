/**
 * File: jobHarness.ts
 * Path: server/testSupport/jobHarness.ts
 * Description: Boots the real server (bundled the way the packaged app is) as a
 * plain `node` child process, with a scriptable fake yt-dlp and the REAL ffmpeg,
 * so /api/download can be driven over HTTP and the cut, join, cache and cancel
 * behaviour checked on real files. The child is spawned directly (no `tsx`
 * wrapper to orphan), on a free port, and is considered up only when its own
 * "listening on" line appears, so a test can never talk to another run's server.
 * Its TMPDIR is private, so work folders and Clear cache are hermetic.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";

function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, "server", "index.ts"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("repository root not found");
    dir = parent;
  }
}

export const repoRoot = findRepoRoot();
export const REAL_FFMPEG = path.join(repoRoot, "resources", "bin", "ffmpeg");
export const FIXTURE = path.join(repoRoot, "audit", "fixtures", "fixture.mp4");
export const YT_URL = "https://www.youtube.com/watch?v=stub0000001";

/** Why these tests cannot run here, or false. */
export const SKIP_REASON: string | false =
  process.platform === "win32"
    ? "the fake yt-dlp shim is a POSIX shell script"
    : !fs.existsSync(REAL_FFMPEG)
      ? "resources/bin/ffmpeg is missing"
      : !fs.existsSync(FIXTURE)
        ? "audit/fixtures/fixture.mp4 is missing"
        : false;

const require_ = createRequire(import.meta.url);

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

export interface JobHarness {
  baseUrl: string;
  port: number;
  /** The server's private TMPDIR: its work folders live here. */
  serverTmp: string;
  tmpDir: string;
  /** Replaces the fake yt-dlp's behaviour (see fakeJobYtDlp.cjs). */
  configure(cfg: Record<string, unknown>): void;
  /** Every yt-dlp invocation so far. */
  calls(): Array<{ pid: number; argv: string[] }>;
  /** pids of yt-dlp download runs, in start order. */
  downloadPids(): number[];
  log(): string;
  post(route: string, body: unknown, init?: RequestInit): Promise<Response>;
  stop(): Promise<void>;
}

export async function startJobHarness(
  opts: { env?: Record<string, string>; slowConcatSec?: number } = {},
): Promise<JobHarness> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jobtest-"));
  const serverTmp = path.join(tmpDir, "tmp");
  const binDir = path.join(tmpDir, "bin");
  fs.mkdirSync(serverTmp, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  const fake = path.join(repoRoot, "server", "testSupport", "fakeJobYtDlp.cjs");
  const ytDlp = path.join(binDir, "yt-dlp");
  fs.writeFileSync(ytDlp, `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`);
  fs.chmodSync(ytDlp, 0o755);
  if (opts.slowConcatSec) {
    // A join that takes a long time (a real re-encode of a long clip does):
    // sleeps before the concat demuxer runs, then does the real work.
    fs.writeFileSync(
      path.join(binDir, "ffmpeg"),
      `#!/bin/sh\ncase "$*" in *concat*) sleep ${opts.slowConcatSec};; esac\nexec "${REAL_FFMPEG}" "$@"\n`,
    );
    fs.chmodSync(path.join(binDir, "ffmpeg"), 0o755);
  } else {
    fs.symlinkSync(REAL_FFMPEG, path.join(binDir, "ffmpeg"));
  }

  const cfgFile = path.join(tmpDir, "cfg.json");
  const callLog = path.join(tmpDir, "calls.log");
  fs.writeFileSync(cfgFile, "{}");

  const esbuild = require_("esbuild") as typeof import("esbuild");
  const bundleDir = path.join(repoRoot, "node_modules", ".cache", "ytclip-test");
  fs.mkdirSync(bundleDir, { recursive: true });
  const bundle = path.join(bundleDir, `job-${path.basename(tmpDir)}.cjs`);
  esbuild.buildSync({
    entryPoints: [path.join(repoRoot, "server", "index.ts")],
    outfile: bundle,
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    loader: { ".ts": "ts" },
    external: ["electron", "ffmpeg-static", "youtube-dl-exec"],
    logLevel: "silent",
  });

  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, [bundle], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      ELECTRON_RESOURCES_BIN: binDir,
      // The server only takes ffmpeg from <resources>/bin when packaged; point it
      // there for the one option that needs its own ffmpeg.
      ...(opts.slowConcatSec ? { ELECTRON_RESOURCES: tmpDir } : {}),
      VITE_ENABLE_CHANNEL_DATA: "",
      TMPDIR: serverTmp,
      TMP: serverTmp,
      TEMP: serverTmp,
      FAKE_JOB_CFG: cfgFile,
      FAKE_JOB_LOG: callLog,
      FAKE_JOB_FIXTURE: FIXTURE,
      ...opts.env,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // own process group, so stop() can take down anything it spawned
  });
  let output = "";
  child.stdout?.on("data", (c) => (output += c.toString()));
  child.stderr?.on("data", (c) => (output += c.toString()));

  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      await new Promise((r) => child.once("exit", r));
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(bundle, { force: true });
  };

  const deadline = Date.now() + 30_000;
  while (!output.includes("listening on")) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode}):\n${output}`);
    }
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`server did not start in time:\n${output}`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  const baseUrl = `http://127.0.0.1:${port}`;

  const readLines = (file: string) => {
    try {
      return fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    } catch {
      return [];
    }
  };

  return {
    baseUrl,
    port,
    serverTmp,
    tmpDir,
    configure: (cfg) => fs.writeFileSync(cfgFile, JSON.stringify(cfg)),
    // The server's own start-up `--version` probe is not a job run.
    calls: () =>
      readLines(callLog)
        .map((l) => JSON.parse(l))
        .filter((c) => !c.argv.includes("--version")),
    downloadPids: () => readLines(`${callLog}.pids`).map(Number),
    log: () => output,
    post: (route, body, init) =>
      fetch(`${baseUrl}${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(init?.headers as object) },
        body: JSON.stringify(body),
        ...init,
      }),
    stop,
  };
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

