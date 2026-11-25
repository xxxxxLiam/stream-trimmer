/**
 * File: freeSpace.ts
 * Path: src/main/features/files/services/freeSpace.ts
 * Description: Before a clip starts: does the folder it will land in (and the work folder it is cut in) have room?
 *   Uses the same size estimate the engine quotes after an out-of-space failure, so the two sentences agree. `ok` is
 *   false only when the free space is clearly short; an unknown amount is never a reason to warn. Pure Node, with the
 *   disk query passed in so it tests without a full disk.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { estimateNeededMb } from "../../engine/services/segments";

export interface FreeSpaceAnswer {
  ok: boolean;
  neededMb: number;
  /** Free space in MB for the tighter of the destination and the work folder, or null when it can't be read. */
  freeMb: number | null;
}

type Statfs = (dir: string) => { bavail: number; bsize: number };

/** Free MB where `dir` is, or on the nearest folder above it that exists (the destination may not exist yet). */
export function freeMbAt(dir: string, statfs: Statfs = fs.statfsSync as unknown as Statfs): number | null {
  let cur = path.resolve(dir);
  for (let i = 0; i < 64; i += 1) {
    try {
      const st = statfs(cur);
      const mb = Math.floor((st.bavail * st.bsize) / (1024 * 1024));
      return Number.isFinite(mb) && mb >= 0 ? mb : null;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return null;
      cur = parent;
    }
  }
  return null;
}

export function checkFreeSpace(
  raw: unknown,
  deps: { statfs?: Statfs; tmpDir?: string } = {},
): FreeSpaceAnswer | null {
  const p = (raw ?? {}) as Record<string, unknown>;
  if (typeof p.dirPath !== "string" || !path.isAbsolute(p.dirPath) || p.dirPath.includes("\0")) return null;
  const seconds = Number(p.seconds);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86_400) return null;
  const segments = Number.isInteger(p.segments) && (p.segments as number) >= 1 ? (p.segments as number) : 1;
  const neededMb = estimateNeededMb(seconds, String(p.quality ?? "best"), p.audio === true, segments);
  const there = freeMbAt(p.dirPath, deps.statfs);
  const work = freeMbAt(deps.tmpDir ?? os.tmpdir(), deps.statfs);
  const known = [there, work].filter((n): n is number => n !== null);
  const freeMb = known.length ? Math.min(...known) : null;
  return { ok: freeMb === null || freeMb >= neededMb, neededMb, freeMb };
}
