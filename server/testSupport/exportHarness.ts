/**
 * File: exportHarness.ts
 * Path: server/testSupport/exportHarness.ts
 * Description: Boots the real Express server in a child process with a fake
 * yt-dlp binary, so the channel exporter can be exercised end to end. Nothing
 * is stubbed inside the server itself — the request goes over HTTP, yt-dlp is
 * spawned for real, and the CSVs land on a real disk.
 */
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";

// Resolved from the working directory rather than from this file's own
// location, so the harness works whether it is run directly by tsx or from a
// bundle written somewhere else.
function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      const pkg = path.join(dir, "server", "index.ts");
      if (fs.existsSync(pkg)) return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `could not locate the repository root from ${process.cwd()}`,
      );
    }
    dir = parent;
  }
}

const repoRoot = findRepoRoot();
const here = path.join(repoRoot, "server", "testSupport");

export const PASSCODE_HASH = "test-passcode-hash";

export interface FakeChannel {
  longform?: number;
  shorts?: number;
  commentsPerVideo?: number;
  transcriptLines?: number;
  channelName?: string;
  /** Video ids whose comment fetch should fail, as yt-dlp would report it. */
  noComments?: string[];
  /**
   * Caps the server's heap. Used to prove that a large export streams rather
   * than accumulates: a run that holds every row would exhaust this.
   */
  maxOldSpaceMb?: number;
}

export interface Harness {
  baseUrl: string;
  tmpDir: string;
  stop(): Promise<void>;
  /** Everything the server logged, for diagnosing a failed assertion. */
  log(): string;
  /**
   * How many yt-dlp calls of each kind the exporter has made so far
   * ("listing", "metadata", "comments", "subtitles"). This is what shows that
   * an unselected part costs nothing rather than merely being dropped.
   */
  calls(): Record<string, number>;
  /** Forget the counts, so the next export can be measured on its own. */
  resetCalls(): void;
}

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

const require_ = createRequire(import.meta.url);

/** Bundles server/index.ts the way the packaged app does. */
function buildServer(outFile: string): void {
  const esbuild = require_("esbuild") as typeof import("esbuild");
  esbuild.buildSync({
    entryPoints: [path.join(repoRoot, "server", "index.ts")],
    outfile: outFile,
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    loader: { ".ts": "ts" },
    external: ["electron", "ffmpeg-static", "youtube-dl-exec"],
    logLevel: "silent",
  });
}

export async function startHarness(channel: FakeChannel = {}): Promise<Harness> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ytclip-test-"));
  // The server's checkpoint folders and CSV output land in the OS temp dir, so
  // each harness gets its own to keep runs from colliding.
  const serverTmp = path.join(tmpDir, "tmp");
  const resources = path.join(tmpDir, "resources");
  const binDir = path.join(resources, "bin");
  fs.mkdirSync(serverTmp, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  // resolveYtDlp() looks for <ELECTRON_RESOURCES>/bin/yt-dlp first, which is
  // how the packaged app finds its bundled binary.
  const fake = path.join(here, "fakeYtDlp.cjs");
  const ytDlp = path.join(binDir, "yt-dlp");
  fs.writeFileSync(
    ytDlp,
    `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`,
  );
  fs.chmodSync(ytDlp, 0o755);
  // preflight() only checks that ffmpeg exists; the exporter never runs it.
  const ffmpeg = path.join(binDir, "ffmpeg");
  fs.writeFileSync(ffmpeg, "#!/bin/sh\nexit 0\n");
  fs.chmodSync(ffmpeg, 0o755);

  // The bundle keeps ffmpeg-static external, exactly as the packaged build
  // does, so it has to sit where node can resolve the repo's node_modules.
  const bundleDir = path.join(repoRoot, "node_modules", ".cache", "ytclip-test");
  fs.mkdirSync(bundleDir, { recursive: true });
  const bundle = path.join(bundleDir, `${path.basename(tmpDir)}.cjs`);
  buildServer(bundle);

  const callLog = path.join(tmpDir, "yt-dlp-calls.log");

  const port = await freePort();
  const nodeArgs = channel.maxOldSpaceMb
    ? [`--max-old-space-size=${channel.maxOldSpaceMb}`, bundle]
    : [bundle];
  const child: ChildProcess = spawn(process.execPath, nodeArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      ELECTRON_RESOURCES: resources,
      CHANNEL_EXPORT_PASSCODE_HASH: PASSCODE_HASH,
      TMPDIR: serverTmp,
      TMP: serverTmp,
      TEMP: serverTmp,
      FAKE_LONGFORM: String(channel.longform ?? 12),
      FAKE_SHORTS: String(channel.shorts ?? 8),
      FAKE_COMMENTS: String(channel.commentsPerVideo ?? 3),
      FAKE_TRANSCRIPT_LINES: String(channel.transcriptLines ?? 2),
      FAKE_CHANNEL_NAME: channel.channelName ?? "Test Channel",
      FAKE_NO_COMMENTS: (channel.noComments ?? []).join(","),
      FAKE_CALL_LOG: callLog,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout?.on("data", (c) => (output += c.toString()));
  child.stderr?.on("data", (c) => (output += c.toString()));

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode}):\n${output}`);
    }
    try {
      // No health endpoint; this one is a plain GET that always answers.
      const res = await fetch(`${baseUrl}/api/cache/usage`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      throw new Error(`server did not start in time:\n${output}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    baseUrl,
    tmpDir,
    log: () => output,
    calls: () => {
      const counts: Record<string, number> = {};
      let raw = "";
      try {
        raw = fs.readFileSync(callLog, "utf8");
      } catch {
        return counts; // nothing spawned yet
      }
      for (const line of raw.split("\n")) {
        const kind = line.trim();
        if (kind) counts[kind] = (counts[kind] ?? 0) + 1;
      }
      return counts;
    },
    resetCalls: () => fs.rmSync(callLog, { force: true }),
    stop: async () => {
      // The server may already be gone — a test can deliberately push it out
      // of memory — and "exit" never fires twice, so waiting unconditionally
      // would hang the run.
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await new Promise((r) => child.once("exit", r));
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.rmSync(bundle, { force: true });
    },
  };
}

export interface ExportRequest {
  url?: string;
  contentType?: "all" | "shorts" | "longform";
  limit?: number | "all";
  includeVideoDetails?: boolean;
  includeComments?: boolean;
  includeTranscripts?: boolean;
  fresh?: boolean;
  deliver?: "rows" | "path";
}

export async function runExport(
  harness: Harness,
  body: ExportRequest = {},
): Promise<any> {
  const jobId = `test_${crypto.randomUUID()}`;
  const res = await fetch(
    `${harness.baseUrl}/api/channel/export?jobId=${jobId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Channel-Key": PASSCODE_HASH,
      },
      body: JSON.stringify({
        url: "https://www.youtube.com/@testchannel",
        contentType: "all",
        includeComments: false,
        includeTranscripts: false,
        ...body,
      }),
    },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `export failed (${res.status}): ${data?.error ?? JSON.stringify(data)}`,
    );
  }
  return data;
}

/** Splits a CSV produced by the exporter into rows of cells. */
export function parseCsv(text: string): string[][] {
  const body = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && body[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else {
      cell += ch;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Reads one of the exporter's CSVs as objects keyed by its header row. */
export function readCsvFile(file: string): Record<string, string>[] {
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  if (rows.length === 0) return [];
  const [header, ...rest] = rows;
  return rest.map((cells) => {
    const out: Record<string, string> = {};
    header.forEach((name, i) => (out[name] = cells[i] ?? ""));
    return out;
  });
}
