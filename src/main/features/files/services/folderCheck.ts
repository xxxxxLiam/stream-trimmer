/**
 * File: folderCheck.ts
 * Path: src/main/features/files/services/folderCheck.ts
 * Description: Before a clip starts, and before a save: can Clipr write into this folder? `gone` is a missing folder
 *   or an unmounted drive (ENOENT, ENOTDIR, not a folder); `refused` is a folder that is there but will not take a file
 *   (EACCES, EPERM, EROFS). It writes and removes one tiny probe file, because a permission flag alone is not reliable
 *   (read-only volumes and Windows attributes). Anything it can't decide counts as fine: only a clear answer blocks.
 */
import fs from "node:fs";
import path from "node:path";

export type FolderProblem = "gone" | "refused";
export type FolderAnswer = { ok: true } | { ok: false; problem: FolderProblem };

interface FolderFs {
  statSync: (p: string) => { isDirectory: () => boolean };
  writeFileSync: (p: string, data: string, opts: { flag: string }) => void;
  rmSync: (p: string, opts: { force: boolean }) => void;
}

const GONE = new Set(["ENOENT", "ENOTDIR", "ENODEV", "ENXIO", "ENOTCONN"]);
const REFUSED = new Set(["EACCES", "EPERM", "EROFS"]);

function problemOf(err: unknown): FolderProblem | null {
  const code = (err as { code?: string } | null)?.code ?? "";
  if (GONE.has(code)) return "gone";
  if (REFUSED.has(code)) return "refused";
  return null;
}

export function checkFolder(raw: unknown, deps: { fs?: FolderFs; probeName?: string } = {}): FolderAnswer {
  const dirPath = (raw as { dirPath?: unknown } | null)?.dirPath;
  if (typeof dirPath !== "string" || !path.isAbsolute(dirPath) || dirPath.includes("\0")) return { ok: true };
  const f = deps.fs ?? fs;
  try {
    if (!f.statSync(dirPath).isDirectory()) return { ok: false, problem: "gone" };
  } catch (err) {
    const problem = problemOf(err);
    return problem ? { ok: false, problem } : { ok: true };
  }
  const probe = path.join(dirPath, deps.probeName ?? `.clipr-write-check-${process.pid}-${Date.now()}`);
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
