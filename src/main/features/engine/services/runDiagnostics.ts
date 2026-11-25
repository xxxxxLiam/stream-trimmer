/**
 * File: runDiagnostics.ts
 * Path: src/main/features/engine/services/runDiagnostics.ts
 * Description: Builds the raw diagnostics a failed run hands the renderer (versions, platform, stderr tail, job log lines).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolvedFfmpeg, versionOfResolved, yt } from "./binaries";
import { jobLogs } from "./jobLogs";

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
 * redactor lives in src/renderer/src/shared/utils/diagnostics.ts and runs over the finished report.
 */
export function buildRunDiagnostics(jobId: string, stderrRaw: string) {
  if (cachedYtDlpVersion === undefined) {
    cachedYtDlpVersion = versionOfResolved(yt);
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
