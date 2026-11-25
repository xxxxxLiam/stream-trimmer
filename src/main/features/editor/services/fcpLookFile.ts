/**
 * File: fcpLookFile.ts
 * Path: src/main/features/editor/services/fcpLookFile.ts
 * Description: Reads the Final Cut export a user picks or drops as their look: a .fcpxmld bundle (its
 *   Info.fcpxml), a .fcpxml, or a .txt / .xml holding the same text. Capped in size, read as UTF-8,
 *   checked with parseLook, and answered with the parsed look or one plain reason. No electron import.
 */
import fsp from "node:fs/promises";
import path from "node:path";
import { FCP_LOOK_MAX_BYTES, type FcpLookFileResult } from "../../../../common/types/fcpLook";
import { parseLook } from "../../../../common/utils/fcpLook";

const WRONG_KIND =
  "Choose a Final Cut export: a .fcpxmld bundle, a .fcpxml file, or a .txt or .xml copy of it.";
const TOO_BIG = "That file is too big to be a Final Cut export.";
const CANNOT_READ = "That file could not be read.";

/** Where the text lives for a given pick, or a reason it cannot be one. */
async function locate(picked: string): Promise<{ file: string } | { reason: string }> {
  const stat = await fsp.stat(picked);
  const ext = path.extname(picked).toLowerCase();
  if (stat.isDirectory()) {
    if (ext !== ".fcpxmld") return { reason: WRONG_KIND };
    const inside = path.join(picked, "Info.fcpxml");
    try {
      await fsp.access(inside);
    } catch {
      return { reason: "That bundle has no Info.fcpxml inside it. Export the project from Final Cut again." };
    }
    return { file: inside };
  }
  if (![".fcpxml", ".txt", ".xml"].includes(ext)) return { reason: WRONG_KIND };
  return { file: picked };
}

export async function readFcpLookFile(picked: unknown): Promise<FcpLookFileResult> {
  if (typeof picked !== "string" || !picked) return { ok: false, reason: WRONG_KIND };
  try {
    const where = await locate(picked);
    if ("reason" in where) return { ok: false, reason: where.reason };
    const stat = await fsp.stat(where.file);
    if (stat.size > FCP_LOOK_MAX_BYTES) return { ok: false, reason: TOO_BIG };
    const text = (await fsp.readFile(where.file, "utf8")).replace(/^﻿/, "");
    return { ok: true, fileName: path.basename(picked), look: parseLook(text) };
  } catch (err: unknown) {
    // parseLook's own sentences are already plain words; anything else is a read failure.
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT" || code === "EACCES" || code === "EISDIR" || code === "EPERM") return { ok: false, reason: CANNOT_READ };
    return { ok: false, reason: err instanceof Error ? err.message : CANNOT_READ };
  }
}
