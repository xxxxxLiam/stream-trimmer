/**
 * File: undoClip.ts
 * Path: src/main/features/files/services/undoClip.ts
 * Description: Undo for a just-made clip: moves its file to the Trash or Recycle Bin (never a hard
 *   delete, so a mis-tap is recoverable). Only a real file inside the folders the user chose for clips
 *   is touched; anything else is refused. A file that is already gone counts as done. Pure: the roots
 *   and the trash call are passed in, so it needs no Electron to test.
 */
import fs from "node:fs";
import path from "node:path";
import { dragTarget } from "../../../shared/utils/pathSafety";

export async function undoClipFile(
  targetPath: unknown,
  roots: string[],
  trashItem: (file: string) => Promise<void>,
): Promise<{ ok: boolean; error?: string }> {
  if (typeof targetPath !== "string" || !path.isAbsolute(targetPath)) {
    return { ok: false, error: "That clip's location isn't valid, so nothing was removed." };
  }
  if (!fs.existsSync(targetPath)) return { ok: true };
  const real = dragTarget(targetPath, roots);
  if (!real) {
    return { ok: false, error: "That file isn't in one of your clip folders, so Clipr left it alone." };
  }
  try {
    await trashItem(real);
    return { ok: true };
  } catch (err: unknown) {
    const why = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Couldn't move the clip to the Trash: ${why}` };
  }
}
