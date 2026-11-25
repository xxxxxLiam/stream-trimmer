/**
 * File: toolStatus.ts
 * Path: src/main/features/engine/services/toolStatus.ts
 * Description: Reports whether yt-dlp, ffmpeg and deno are present and actually run, for the cold start
 *   screen. The first probe runs in the background and is cached, so the answer is "checking" until
 *   it lands and never blocks a request. There is no updater in the app today, so no "updating" state.
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { BIN_DIR, childEnv, resolvedFfmpeg, yt } from "./binaries";

export type ToolState = "checking" | "ready" | "missing" | "broken";
export interface ToolReport {
  state: ToolState;
  version?: string;
}
export interface ToolsStatus {
  overall: "checking" | "ready" | "broken";
  tools: { ytdlp: ToolReport; ffmpeg: ToolReport; deno: ToolReport };
}

/** What probing one tool gave: no path, a path that wouldn't run, or its version line. */
export type Probe = { path: null } | { path: string; ok: false } | { path: string; ok: true; version: string };

export function reportOf(probe: Probe | undefined): ToolReport {
  if (!probe) return { state: "checking" };
  if (probe.path === null) return { state: "missing" };
  if (!("ok" in probe) || !probe.ok) return { state: "broken" };
  return { state: "ready", version: probe.version };
}

/** yt-dlp and ffmpeg gate everything; deno alone being bad is reported but is not fatal. */
export function summarize(p: { ytdlp?: Probe; ffmpeg?: Probe; deno?: Probe }): ToolsStatus {
  const tools = { ytdlp: reportOf(p.ytdlp), ffmpeg: reportOf(p.ffmpeg), deno: reportOf(p.deno) };
  const core = [tools.ytdlp.state, tools.ffmpeg.state];
  const overall = core.some((s) => s === "missing" || s === "broken")
    ? "broken"
    : core.some((s) => s === "checking")
      ? "checking"
      : "ready";
  return { overall, tools };
}

type Exec = (file: string, args: string[], opts: object, cb: (err: Error | null, stdout: string) => void) => unknown;

/** Run `<binary> <versionArg>`; the first output line is the version. */
export function probeBinary(binary: string | null, versionArg: string, exec: Exec = execFile as unknown as Exec): Promise<Probe> {
  return new Promise((resolve) => {
    if (!binary || !fs.existsSync(binary)) return resolve({ path: null });
    exec(binary, [versionArg], { timeout: 10_000, windowsHide: true, env: childEnv() }, (err, stdout) => {
      const line = String(stdout ?? "").split("\n").find((l) => l.trim());
      if (err || !line) resolve({ path: binary, ok: false });
      else resolve({ path: binary, ok: true, version: line.trim() });
    });
  });
}

function denoPath(): string | null {
  const exe = process.platform === "win32" ? "deno.exe" : "deno";
  if (BIN_DIR && fs.existsSync(path.join(BIN_DIR, exe))) return path.join(BIN_DIR, exe);
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (dir && fs.existsSync(path.join(dir, exe))) return path.join(dir, exe);
  }
  return null;
}

const probes: { ytdlp?: Probe; ffmpeg?: Probe; deno?: Probe } = {};
let started = false;
/** When each tool was last probed, to space re-probes of a broken or missing result. */
const probedAt: { ytdlp: number; ffmpeg: number; deno: number } = { ytdlp: 0, ffmpeg: 0, deno: 0 };
/** A broken result is looked at again no sooner than this after the last look. */
export const REPROBE_BACKOFF_MS = 3_000;
const inFlight = new Set<string>();
let probeFn: (binary: string | null, arg: string) => Promise<Probe> = (b, a) => probeBinary(b, a);

/** Test seam: replace what a probe runs. */
export function setProbeForTest(fn: typeof probeFn | null): void {
  probeFn = fn ?? ((b, a) => probeBinary(b, a));
}

type Name = "ytdlp" | "ffmpeg" | "deno";
const targets: Record<Name, () => { binary: string | null; arg: string }> = {
  ytdlp: () => ({ binary: yt?.binary ?? null, arg: "--version" }),
  ffmpeg: () => ({ binary: resolvedFfmpeg ?? null, arg: "-version" }),
  deno: () => ({ binary: denoPath(), arg: "--version" }),
};

function probe(name: Name, now: number): void {
  if (inFlight.has(name)) return;
  inFlight.add(name);
  probedAt[name] = now;
  const t = targets[name]();
  void probeFn(t.binary, t.arg).then((p) => {
    probes[name] = p;
    inFlight.delete(name);
  });
}

/** Starts the background probe (idempotent); never blocks. */
export function startToolProbe(): void {
  if (started) return;
  started = true;
  const now = Date.now();
  (["ytdlp", "ffmpeg", "deno"] as Name[]).forEach((n) => probe(n, now));
}

/** After yt-dlp was replaced: read its version again. The old answer stays until the new one lands. */
export function refreshToolProbe(): void {
  probe("ytdlp", Date.now());
}

/**
 * A video opened, so yt-dlp and ffmpeg ran: whatever an earlier slow or failed probe said, the tools work.
 * Only a result that is already bad is replaced, and only with what the working run proves.
 */
export function markToolsReady(): void {
  for (const n of ["ytdlp", "ffmpeg"] as const) {
    const p = probes[n];
    if (!p || p.path === null || ("ok" in p && p.ok)) continue;
    probes[n] = { path: p.path, ok: true, version: "" };
  }
}

/**
 * A broken or missing result is probed again when asked, once the backoff has passed. `force` (the
 * screen's Try again) looks again at once. A bad result stays as it is until the new look lands.
 */
export function currentToolStatus(now: number = Date.now(), force = false): ToolsStatus {
  startToolProbe();
  for (const n of ["ytdlp", "ffmpeg", "deno"] as Name[]) {
    const p = probes[n];
    const bad = p && (p.path === null || !("ok" in p) || !p.ok);
    if (bad && (force || now - probedAt[n] >= REPROBE_BACKOFF_MS)) probe(n, now);
  }
  return summarize(probes);
}

/** Test seam: forget every probe so the next call starts fresh. */
export function resetToolProbesForTest(): void {
  for (const k of Object.keys(probes)) delete (probes as Record<string, unknown>)[k];
  started = false;
  inFlight.clear();
  probedAt.ytdlp = probedAt.ffmpeg = probedAt.deno = 0;
}
