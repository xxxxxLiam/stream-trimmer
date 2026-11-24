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

/** Starts the one background probe (idempotent); never blocks. */
export function startToolProbe(): void {
  if (started) return;
  started = true;
  void probeBinary(yt?.binary ?? null, "--version").then((p) => (probes.ytdlp = p));
  void probeBinary(resolvedFfmpeg ?? null, "-version").then((p) => (probes.ffmpeg = p));
  void probeBinary(denoPath(), "--version").then((p) => (probes.deno = p));
}

/** After yt-dlp was replaced: read its version again. The old answer stays until the new one lands. */
export function refreshToolProbe(): void {
  void probeBinary(yt?.binary ?? null, "--version").then((p) => (probes.ytdlp = p));
}

export function currentToolStatus(): ToolsStatus {
  startToolProbe();
  return summarize(probes);
}
