/**
 * File: toolUpdater.ts
 * Path: src/main/features/engine/services/toolUpdater.ts
 * Description: The real network and file calls behind toolUpdate.ts, wired to this app's yt-dlp.
 *   One shared run at a time. Shows nothing; callers decide what the clip's row says.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { reloadYtDlp, yt, ytDlpVersion } from "./binaries";
import { refreshToolProbe } from "./toolStatus";
import { LATEST_TAG_URL, singleFlight, updateYtDlp, versionOfToolFile, type ToolUpdateResult } from "./toolUpdate";

function toolsDir(): string | null {
  return process.env.YT_CLIPPER_TOOLS_DIR || null;
}

async function fetchLatestTag(): Promise<string> {
  const res = await fetch(LATEST_TAG_URL, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`release lookup answered ${res.status}`);
  const body = (await res.json()) as { tag_name?: string };
  return String(body.tag_name ?? "");
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!res.ok || !res.body) throw new Error(`download answered ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(dest, { mode: 0o755 }));
}

function verify(file: string): Promise<string | null> {
  return new Promise((resolve) => {
    fsp.chmod(file, 0o755).catch(() => {});
    execFile(file, ["--version"], { timeout: 20_000, windowsHide: true }, (err, stdout) => {
      const line = String(stdout ?? "").trim();
      resolve(err || !line ? null : line);
    });
  });
}

/** Removes older updated binaries once a newer one is in place. Best effort. */
async function prune(dir: string, keep: string) {
  for (const name of await fsp.readdir(dir).catch(() => [] as string[])) {
    if (name !== keep && (versionOfToolFile(name) || name.endsWith(".download"))) await fsp.rm(path.join(dir, name), { force: true }).catch(() => {});
  }
}

let announced = false;
const waiting = new Set<() => void>();

const flight = singleFlight(async (): Promise<ToolUpdateResult> => {
  const dir = toolsDir();
  if (!dir) return { updated: false, why: "failed", error: "no tools folder" };
  await fsp.mkdir(dir, { recursive: true });
  announced = false;
  try {
    return await updateYtDlp({
      platform: process.platform,
      currentVersion: () => (yt ? ytDlpVersion(yt.binary) : null),
      fetchLatestTag,
      download,
      verify,
      tmpPathFor: (n) => path.join(dir, n),
      install: async (tmp, finalName) => {
        await fsp.rename(tmp, path.join(dir, finalName));
        await prune(dir, finalName);
      },
      onUpdating: () => {
        announced = true;
        for (const cb of waiting) cb();
      },
      onInstalled: () => {
        reloadYtDlp();
        refreshToolProbe();
      },
    });
  } finally {
    waiting.clear();
  }
});

/**
 * Updates yt-dlp if a newer release exists. Concurrent callers share one run, and each
 * `onUpdating` is called once a newer version is confirmed (immediately if it already was).
 */
export function updateTools(hooks: { onUpdating?: () => void } = {}): Promise<ToolUpdateResult> {
  const hook = hooks.onUpdating;
  if (hook) {
    if (announced) hook();
    else waiting.add(hook);
  }
  return flight();
}
