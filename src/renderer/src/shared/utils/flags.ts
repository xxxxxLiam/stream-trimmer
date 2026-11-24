/**
 * File: flags.ts
 * Path: src/renderer/src/shared/utils/flags.ts
 * Description: Flags dropped on the source video while watching (M, or the flag tool). A flag is a
 *   second; flags are rough, so a new one within a second of an old one is the same flag.
 */
export const FLAG_KEY = "clipper.flags";

export type FlagsByVideo = Record<string, number[]>;

export function normalizeFlags(raw: unknown): FlagsByVideo {
  const out: FlagsByVideo = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const times = v.filter((t): t is number => typeof t === "number" && Number.isFinite(t) && t >= 0).map(Math.floor);
    if (times.length) out[id] = [...new Set(times)].sort((a, b) => a - b);
  }
  return out;
}

export function withFlag(list: readonly number[], t: number): number[] {
  const s = Math.max(0, Math.floor(t));
  if (list.includes(s)) return [...list];
  return [...list, s].sort((a, b) => a - b);
}

export function withoutFlag(list: readonly number[], t: number): number[] {
  const s = Math.floor(t);
  return list.filter((x) => x !== s);
}
