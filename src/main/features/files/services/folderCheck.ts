/**
 * File: folderCheck.ts
 * Path: src/main/features/files/services/folderCheck.ts
 * Description: Before a clip starts, and before a save: can Clipr write into this folder? Only a folder the person chose
 *   (the approved save roots) is looked at: any other path answers `refused` without touching the disk, so the probe
 *   can neither tell whether a path exists nor drop a file somewhere unapproved (E3-3). `gone` is a missing folder
 *   or an unmounted drive (ENOENT, ENOTDIR, not a folder); `refused` is a folder that is there but will not take a file
 *   (EACCES, EPERM, EROFS). It writes and removes one tiny probe file, because a permission flag alone is not reliable
 *   (read-only volumes and Windows attributes). Anything it can't decide counts as fine: only a clear answer blocks.
 */
import fs from "node:fs";
import path from "node:path";
import { isInside } from "../../../shared/utils/pathSafety";

export type FolderProblem = "gone" | "refused" | "blocked";
export type FolderAnswer = { ok: true } | { ok: false; problem: FolderProblem };

interface FolderFs {
  statSync: (p: string) => { isDirectory: () => boolean };
  writeFileSync: (p: string, data: string, opts: { flag: string }) => void;
  rmSync: (p: string, opts: { force: boolean }) => void;
}

const GONE = new Set(["ENOENT", "ENODEV", "ENXIO", "ENOTCONN"]);
/** The path runs through a file, so no folder can be made there: not a missing drive. */
const BLOCKED = new Set(["ENOTDIR", "EEXIST"]);
const REFUSED = new Set(["EACCES", "EPERM", "EROFS"]);

function problemOf(err: unknown): FolderProblem | null {
  const code = (err as { code?: string } | null)?.code ?? "";
  if (GONE.has(code)) return "gone";
  if (BLOCKED.has(code)) return "blocked";
  if (REFUSED.has(code)) return "refused";
  return null;
}

/** The mount point a path lives under, when the platform has one: the drive that goes missing when it is unplugged. */
export function mountRootOf(p: string): string | null {
  if (path.sep === "\\") {
    const root = path.parse(p).root;
    return root && /^[A-Za-z]:\\$/.test(root) ? root : null;
  }
  const m = /^(\/Volumes\/[^/]+|\/mnt\/[^/]+|\/run\/media\/[^/]+\/[^/]+|\/media\/[^/]+)(?:\/|$)/.exec(p);
  return m ? m[1] : null;
}

function exists(f: FolderFs, p: string): boolean {
  try {
    f.statSync(p);
    return true;
  } catch {
    return false;
  }
}

/** The closest folder above `p` that exists. A file in the way (the path runs through it) is `blocked`. */
function nearestExisting(f: FolderFs, p: string): { dir: string; blocked?: false } | { blocked: true } | null {
  let cur = path.dirname(p);
  for (let i = 0; i < 64; i++) {
    try {
      return f.statSync(cur).isDirectory() ? { dir: cur } : { blocked: true };
    } catch (err) {
      const code = (err as { code?: string } | null)?.code ?? "";
      if (code === "ENOTDIR") return { blocked: true };
    }
    const up = path.dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
  return null;
}

/** `roots` are the folders the person chose. isInside compares real locations, so a link that leads outside a root does not count. */
export function checkFolder(raw: unknown, roots: string[], deps: { fs?: FolderFs; probeName?: string; realpath?: (p: string) => string } = {}): FolderAnswer {
  const dirPath = (raw as { dirPath?: unknown } | null)?.dirPath;
  if (typeof dirPath !== "string" || !path.isAbsolute(dirPath) || dirPath.includes("\0")) return { ok: true };
  if (!roots.some((r) => isInside(r, dirPath))) return { ok: false, problem: "refused" };
  const f = deps.fs ?? fs;
  let target = dirPath;
  try {
    if (!f.statSync(dirPath).isDirectory()) return { ok: false, problem: "blocked" };
  } catch (err) {
    const problem = problemOf(err);
    if (problem !== "gone") return problem ? { ok: false, problem } : { ok: true };
    // A folder that does not exist yet is not a missing drive: a campaign's own folder is only a path until
    // the first clip is saved, and the save creates it. Only a vanished drive is "gone".
    const mount = mountRootOf(dirPath);
    if (mount && !exists(f, mount)) return { ok: false, problem: "gone" };
    const near = nearestExisting(f, dirPath);
    if (!near) return { ok: false, problem: "gone" };
    if (near.blocked) return { ok: false, problem: "blocked" };
    target = near.dir;
  }
  const probe = path.join(target, deps.probeName ?? `.clipr-write-check-${process.pid}-${Date.now()}`);
  try {
    f.writeFileSync(probe, "", { flag: "wx" });
  } catch (err) {
    const problem = problemOf(err);
    return problem ? { ok: false, problem } : { ok: true };
  }
  try {
    f.rmSync(probe, { force: true });
  } catch {
    /* a leftover empty file is not a reason to stop */
  }
  return { ok: true };
}
