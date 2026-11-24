/**
 * File: channelListing.ts
 * Path: src/main/features/engine/services/channelExport/channelListing.ts
 * Description: Reads a channel's listing tabs and one video's transcript.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { D } from "./channelDeps";
import { ChannelJob } from "./channelJobs";
import { FlatEntry } from "./exportTypes";
import { runForJob } from "./ytRunner";

// Reduce any channel URL variant (@handle, /channel/UC…, /c/name, /user/name,
// or a tab/video link under them) to the canonical channel root.
export function channelBaseUrl(raw: string): string | null {
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

export async function listChannelTab(
  job: ChannelJob,
  tabUrl: string,
  cookieOptions: Record<string, unknown>,
  listEnd: number,
): Promise<{ entries: FlatEntry[]; channelName: string; subs: number | "" }> {
  const info = await runForJob(job, tabUrl, {
    dumpSingleJson: true,
    flatPlaylist: true,
    noWarnings: true,
    playlistEnd: listEnd,
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

export async function fetchTranscript(
  job: ChannelJob,
  videoUrl: string,
  cookieOptions: Record<string, unknown>,
): Promise<Array<{ start: number; end: number; text: string }>> {
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
      ffmpegLocation: D.resolvedFfmpeg,
      ...cookieOptions,
    }, 120_000);
    const files = fs.readdirSync(tempDir);
    const vtt =
      files.find((f) => /\.en\.vtt$/.test(f)) ||
      files.find((f) => f.endsWith(".vtt"));
    if (!vtt) return [];
    return D.parseVtt(fs.readFileSync(path.join(tempDir, vtt), "utf8"));
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
