/**
 * File: savedFile.ts
 * Path: src/main/features/files/services/savedFile.ts
 * Description: The answer to a successful save. `fileName` is the name the file really got on disk,
 *   which differs from the requested name when that one was taken ("Podcast Long 2.mp4"), so the row,
 *   History and the editor project can all show the real name.
 */
import path from "node:path";

export function savedResult(target: string): { ok: true; path: string; fileName: string } {
  return { ok: true, path: target, fileName: path.basename(target) };
}
