/**
 * File: filesService.ts
 * Path: src/main/features/files/services/filesService.ts
 * Description: Saving, revealing and dragging out finished files. Every write is
 *   confined to the folders the user chose (see saveRoots.ts); payload shapes are
 *   validated by the IPC handlers before they reach these functions.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import electron from "electron";
import {
  dragTarget,
  moveWithoutOverwrite,
  resolveTarget,
  writeWithoutOverwrite,
} from "../../../shared/utils/pathSafety";
import * as logger from "../../../modules/logger/logger";
import { getDragIcon } from "./dragIcon";
import { saveRoots } from "./saveRoots";

const { shell } = electron;

/**
 * Moves a finished clip from the engine's temp directory to where the user
 * wants it. The media never enters the renderer: it is written once by
 * yt-dlp and moved once here, instead of being streamed into the UI,
 * buffered, and copied back across IPC.
 */
export async function saveClip(payload: any) {
  try {
    // The path comes back from the local engine, but never trust it blindly:
    // only ever move a file the engine just created inside its own temp dir.
    const source = fs.realpathSync(payload.tempPath);
    const tempRoot = fs.realpathSync(os.tmpdir());
    const prefix = path.join(tempRoot, "ytclip-");
    if (!path.dirname(source).startsWith(prefix)) {
      logger.log("clip", `refused save from outside the temp dir`);
      return { ok: false, error: "Unexpected clip location" };
    }

    const dest = resolveTarget({
      dirPath: payload.dirPath,
      name: payload.filename,
      roots: saveRoots(),
    });
    if (!dest.ok) {
      logger.log("clip", "refused save outside the chosen folders");
      return { ok: false, error: dest.error };
    }
    // Never replace a clip that is already there: add " 2", " 3" like the
    // CapCut copy does. A hard link fails with EEXIST instead of replacing,
    // so this holds even if the name is taken between the check and the move.
    await fsp.mkdir(path.dirname(dest.target as string), { recursive: true }); const target = await moveWithoutOverwrite(source, dest.target as string);
    await fsp.rm(path.dirname(source), { recursive: true, force: true });
    logger.log("clip", `saved ${path.basename(target)}`);
    return { ok: true, path: target };
  } catch (err: any) {
    logger.log("clip", `save failed: ${logger.describe(err)}`);
    return { ok: false, error: logger.describe(err) };
  }
}

/** Writes one file the renderer built (never overwriting: " 2", " 3" instead). */
export async function saveFile(payload: any) {
  try {
    const dest = resolveTarget({
      dirPath: payload.dirPath,
      name: payload.filename,
      roots: saveRoots(),
    });
    if (!dest.ok) {
      logger.log("file", "refused save outside the chosen folders");
      return { ok: false, error: dest.error };
    }
    const buf = Buffer.from(payload.data);
    // "wx": never replace a file that is already there; " 2", " 3" instead.
    const target = await writeWithoutOverwrite(dest.target, buf);
    return { ok: true, path: target };
  } catch (err: any) {
    return {
      ok: false,
      error: err && err.message ? err.message : "Save failed",
    };
  }
}

/**
 * Writes a set of text files into a new subfolder — used by the channel
 * exporter, which produces several linked CSVs per run.
 */
export async function saveFiles(payload: any) {
  try {
    const folder = resolveTarget({
      dirPath: payload.dirPath,
      name: payload.folder,
      roots: saveRoots(),
    });
    if (!folder.ok) {
      logger.log("file", "refused export folder outside the chosen folders");
      return { ok: false, error: folder.error };
    }
    const target = folder.target as string;
    // Check every name before creating anything, so a bad one leaves no
    // half-written folder behind.
    const named: [string, string][] = [];
    for (const file of payload.files) {
      if (!file || typeof file.name !== "string") continue;
      const dest = resolveTarget({ dirPath: target, name: file.name });
      if (!dest.ok) return { ok: false, error: dest.error };
      named.push([dest.target as string, String(file.contents ?? "")]);
    }
    await fsp.mkdir(target, { recursive: true });
    for (const [dest, contents] of named) {
      await fsp.writeFile(dest, contents, "utf8");
    }
    return { ok: true, path: target };
  } catch (err: any) {
    return {
      ok: false,
      error: err && err.message ? err.message : "Save failed",
    };
  }
}

/**
 * Cheap existence probe so the Downloads list can dim rows whose file was
 * moved or deleted outside the app.
 */
export function fileExists(targetPath: string): boolean {
  try {
    return typeof targetPath === "string" && targetPath
      ? fs.existsSync(targetPath)
      : false;
  } catch {
    return false;
  }
}

/**
 * Native OS drag-out, for a real file inside the folders the user chose. Must
 * run synchronously inside the drag gesture or the OS drops it.
 */
export function startDrag(sender: any, targetPath: string) {
  const real = dragTarget(targetPath, saveRoots());
  if (!real) {
    logger.log("drag", "refused drag of a path outside the chosen folders");
    return;
  }
  targetPath = real;

  // Windows silently cancels a drag with a missing/empty icon, so always
  // hand over a real image. Per-file thumbnails are deliberately not used:
  // nativeImage.createThumbnailFromPath is async and startDrag must resolve
  // its icon synchronously inside the gesture. The app icon is cached once.
  sender.startDrag({ file: targetPath, icon: getDragIcon() });
}

/**
 * Highlights the file in Finder/Explorer (opens the folder if the file is
 * gone). Points right at the clip rather than just opening the dir.
 */
export function showInFolder(targetPath: string) {
  try {
    shell.showItemInFolder(targetPath);
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err && err.message ? err.message : "Failed to reveal",
    };
  }
}
