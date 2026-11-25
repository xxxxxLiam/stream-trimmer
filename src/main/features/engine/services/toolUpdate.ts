/**
 * File: toolUpdate.ts
 * Path: src/main/features/engine/services/toolUpdate.ts
 * Description: Updates yt-dlp by itself, silently. The packaged binary may sit somewhere read-only,
 *   so a newer build is fetched into a tools folder in the user's data folder as
 *   yt-dlp-<version>[.exe]; the resolver in binaries.ts prefers the newest. Pure core with injected
 *   network and process calls so it is testable without YouTube or GitHub.
 */

/** yt-dlp versions are date-based (YYYY.MM.DD[.N]) so a numeric component compare is an ordering. */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split(/[.\-]/).map((n) => Number(n) || 0);
  const pb = b.split(/[.\-]/).map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

const RELEASES = "https://github.com/yt-dlp/yt-dlp/releases";

/** The release asset for this platform (x64 builds; macOS is the universal one). */
export function ytDlpAsset(platform: string): string {
  if (platform === "win32") return "yt-dlp.exe";
  if (platform === "darwin") return "yt-dlp_macos";
  return "yt-dlp_linux";
}

export const ytDlpDownloadUrl = (platform: string, tag: string) => `${RELEASES}/download/${tag}/${ytDlpAsset(platform)}`;
export const ytDlpSumsUrl = (tag: string) => `${RELEASES}/download/${tag}/SHA2-256SUMS`;

/** A release tag as yt-dlp writes it: a date, optionally with a build number. Nothing before, after or inside it. */
export const TAG_PATTERN = /^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/;

/** The sha-256 the release's SHA2-256SUMS file lists for `asset`, or null when it lists none. */
export function checksumFor(sums: string, asset: string): string | null {
  for (const line of sums.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line);
    if (m && m[2] === asset) return m[1].toLowerCase();
  }
  return null;
}

export const LATEST_TAG_URL = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";

/** `yt-dlp-2026.11.23.exe` -> "2026.11.23"; anything else -> null. */
export function versionOfToolFile(name: string): string | null {
  const m = /^yt-dlp-(\d{4}\.\d{2}\.\d{2}(?:\.\d+)?)(?:\.exe)?$/.exec(name);
  return m ? m[1] : null;
}

/** The newest updated yt-dlp among a folder's file names, or null. */
export function newestToolFile(names: string[]): { name: string; version: string } | null {
  let best: { name: string; version: string } | null = null;
  for (const name of names) {
    const version = versionOfToolFile(name);
    if (version && (!best || isNewer(version, best.version))) best = { name, version };
  }
  return best;
}

export interface ToolUpdateDeps {
  platform: string;
  /** The yt-dlp version in use now, or null when none runs. */
  currentVersion: () => string | null;
  fetchLatestTag: () => Promise<string>;
  /** The text of the release's SHA2-256SUMS file. */
  fetchChecksums: (tag: string) => Promise<string>;
  /** The sha-256 (hex) of a file on disk. */
  checksumOf: (file: string) => Promise<string>;
  /** Downloads `url` to `dest` (a temp path beside the final file). */
  download: (url: string, dest: string) => Promise<void>;
  /** Makes `file` runnable and returns what `--version` prints, or null when it will not run. */
  verify: (file: string) => Promise<string | null>;
  /** Moves the verified temp file to its final name. */
  install: (tmp: string, finalName: string) => Promise<void>;
  /** Folder-relative names to build paths from. */
  tmpPathFor: (name: string) => string;
  /** Called once a newer version is confirmed, before the download starts. */
  onUpdating?: () => void;
  /** Called after a successful install so the engine picks the new binary up. */
  onInstalled?: () => void;
}

export type ToolUpdateResult =
  | { updated: true; from: string | null; to: string }
  | { updated: false; why: "current" | "failed"; error?: string };

/** One update attempt. Never throws: a failed update is a result, not an error. */
export async function updateYtDlp(d: ToolUpdateDeps): Promise<ToolUpdateResult> {
  try {
    const tag = (await d.fetchLatestTag()).trim();
    const current = d.currentVersion();
    if (!TAG_PATTERN.test(tag)) return { updated: false, why: "failed", error: `unexpected release tag ${tag}` };
    if (current && !isNewer(tag, current)) return { updated: false, why: "current" };
    d.onUpdating?.();
    const exe = d.platform === "win32" ? ".exe" : "";
    const finalName = `yt-dlp-${tag}${exe}`;
    const tmp = d.tmpPathFor(`${finalName}.download`);
    await d.download(ytDlpDownloadUrl(d.platform, tag), tmp);
    // Never run a file whose checksum the release does not vouch for.
    const expected = checksumFor(await d.fetchChecksums(tag), ytDlpAsset(d.platform));
    if (!expected) return { updated: false, why: "failed", error: "the release lists no checksum for yt-dlp" };
    if ((await d.checksumOf(tmp)).toLowerCase() !== expected) return { updated: false, why: "failed", error: "the downloaded yt-dlp did not match its checksum" };
    const ran = await d.verify(tmp);
    if (!ran) return { updated: false, why: "failed", error: "the downloaded yt-dlp did not run" };
    await d.install(tmp, finalName);
    d.onInstalled?.();
    return { updated: true, from: current, to: tag };
  } catch (err: unknown) {
    return { updated: false, why: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Shares one run among callers that arrive while it is going. */
export function singleFlight<T>(run: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => (inFlight ??= run().finally(() => (inFlight = null)));
}
