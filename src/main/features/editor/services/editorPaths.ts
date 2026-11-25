/**
 * File: editorPaths.ts
 * Path: src/main/features/editor/services/editorPaths.ts
 * Description: Which paths the editor handoff may touch. Writes, copies and
 *   openings stay inside the folders the user chose for clips (the same roots
 *   the file save handlers use); a Final Cut library may also be named by its
 *   .fcpbundle path, since libraries live wherever the user keeps them.
 */
import path from "node:path";
import { isInside } from "../../../shared/utils/pathSafety";

const OUTSIDE = "That is outside the folders Clipr saves clips in, so it was left alone.";

const isLibrary = (p: string) => /\.fcpbundle[\\/]?$/i.test(p);

export type PathVerdict = { ok: true } | { ok: false; error: string };

/** True when `target` is an absolute path inside (or equal to) one of `roots`. */
export function insideRoots(roots: string[], target: unknown): target is string {
  return typeof target === "string" && target.length > 0 && path.isAbsolute(target) && roots.some((r) => isInside(r, target));
}

/** A folder to write into, or a file to read or open: inside the save roots. */
export function checkInRoots(roots: string[], target: unknown): PathVerdict {
  return insideRoots(roots, target) ? { ok: true } : { ok: false, error: OUTSIDE };
}

/** Same, but a Final Cut library (.fcpbundle) is also fine wherever it lives. Only for read-only questions. */
export function checkInRootsOrLibrary(roots: string[], target: unknown): PathVerdict {
  if (typeof target === "string" && path.isAbsolute(target) && isLibrary(target)) return { ok: true };
  return checkInRoots(roots, target);
}

export type EditorRequest = "writeFcpxml" | "openWith" | "reveal" | "copyFiles" | "pathExists";

const field = (payload: unknown, key: string): unknown =>
  payload && typeof payload === "object" ? (payload as Record<string, unknown>)[key] : undefined;

/**
 * The one check every editor request passes before anything is written, copied,
 * opened or answered. Wrong types are left to the service's own plain messages.
 */
export function checkEditorRequest(kind: EditorRequest, payload: unknown, roots: string[]): PathVerdict {
  switch (kind) {
    case "writeFcpxml":
      return checkInRoots(roots, field(payload, "dirPath"));
    case "openWith": {
      const file = field(payload, "file");
      return file === undefined ? { ok: true } : checkInRoots(roots, file);
    }
    case "reveal":
      return checkInRoots(roots, payload);
    case "pathExists":
      return checkInRootsOrLibrary(roots, payload);
    case "copyFiles": {
      const files = field(payload, "files");
      for (const target of [field(payload, "dirPath"), ...(Array.isArray(files) ? files : [])]) {
        const v = checkInRoots(roots, target);
        if (!v.ok) return v;
      }
      return { ok: true };
    }
  }
}
