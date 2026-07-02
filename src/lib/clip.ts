/**
 * File: clip.ts
 * Path: src/lib/clip.ts
 * Description: Shared client-side helpers and API types for the clipper.
 */
export const MAX_CLIP_SECONDS = 600;

export type ClipFormat = "mp4" | "mp3";

export type BitrateMap = Partial<Record<string, number>>; // kbps

export interface Bitrates {
  mp4?: BitrateMap;
  mp3?: BitrateMap;
}

export interface VideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnail?: string;
  bitrates?: Bitrates;
}

export interface TranscriptLine {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResponse {
  lines: TranscriptLine[];
  available: boolean;
  note?: string;
}

export interface DownloadRequest {
  url: string;
  start: number;
  end: number;
  format: ClipFormat;
  quality: string;
}

export function formatBytes(bytes: number): string {
  if (!isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 2 : mb < 100 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

// bytes = kbps * 1000 / 8 * seconds
export function estimateBytes(kbps: number, seconds: number): number {
  if (kbps <= 0 || seconds <= 0) return 0;
  return (kbps * 1000 * seconds) / 8;
}

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// Filesystem-safe filename from a raw video title. Strips illegal chars,
// collapses whitespace, trims to 120 chars, and falls back to "clip".
export function sanitizeFilename(title: string | null | undefined): string {
  const raw = (title ?? "").normalize("NFKC");
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 120)
    .trim();
  return cleaned || "clip";
}

// Build a title-based clip filename: `${safeTitle} [HH-MM-SS-HH-MM-SS].ext`.
export function buildClipFilename(
  title: string | null | undefined,
  start: number,
  end: number,
  ext: string,
): string {
  const safe = sanitizeFilename(title);
  const s = formatTimestamp(start).replaceAll(":", "-");
  const e = formatTimestamp(end).replaceAll(":", "-");
  return `${safe} [${s}-${e}].${ext}`;
}

// Parse "HH:MM:SS", "MM:SS", or bare "SS" into seconds. Returns null if invalid.
export function parseTimestamp(text: string | null | undefined): number | null {
  if (text == null) return null;
  const t = String(text).trim();
  if (t === "") return null;
  const parts = t.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return nums[0];
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
}

export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const parts = u.pathname.split("/");
    const i = parts.findIndex((p) => ["embed", "shorts", "v"].includes(p));
    return i >= 0 ? parts[i + 1] || null : null;
  } catch {
    return null;
  }
}

// Normalize any YouTube URL variant (shorts, youtu.be, embed, m.youtube.com)
// to the canonical https://www.youtube.com/watch?v=ID form. Preserves the
// `t` (start-time) param when present. Returns the original string if it
// isn't recognizable so validation still surfaces a clear error.
export function normalizeYouTubeUrl(url: string): string {
  const id = extractVideoId(url);
  if (!id) return url;
  try {
    const u = new URL(url);
    const t = u.searchParams.get("t") || u.searchParams.get("start");
    const q = new URLSearchParams({ v: id });
    if (t) q.set("t", t);
    return `https://www.youtube.com/watch?${q.toString()}`;
  } catch {
    return `https://www.youtube.com/watch?v=${id}`;
  }
}

export async function parseJson<T = unknown>(response: Response): Promise<T> {
  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error("Backend not reachable. Run `npm run dev` locally.");
  }
  return response.json() as Promise<T>;
}

// Resolves an API path. In Electron the preload sets `window.__API_BASE__`
// to the loopback URL of the in-process Express backend. In the browser dev
// workflow it's undefined and Vite's `/api` proxy handles routing.
declare global {
  interface Window {
    __API_BASE__?: string;
    electronAPI?: {
      isElectron: true;
      pickDirectory: () => Promise<string | null>;
      saveFile: (payload: {
        dirPath: string;
        filename: string;
        data: ArrayBuffer;
      }) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
    };
  }
}
export function apiUrl(path: string): string {
  const base =
    typeof window !== "undefined" && window.__API_BASE__
      ? window.__API_BASE__.replace(/\/$/, "")
      : "";
  return `${base}${path}`;
}