/**
 * File: folderCheck.ts
 * Path: src/renderer/src/shared/utils/folderCheck.ts
 * Description: Reads the main process's answer about the save folder (a missing drive, or a folder that refuses writes).
 *   Only a clear answer counts: no answer, or anything malformed, never blocks a clip.
 */
export type FolderProblem = "gone" | "refused";

export function folderProblem(answer: unknown): FolderProblem | null {
  const a = answer as { ok?: unknown; problem?: unknown } | null | undefined;
  if (!a || a.ok !== false) return null;
  return a.problem === "gone" || a.problem === "refused" ? a.problem : null;
}

/** The failure codes the Export row keys on (see classifyClipFailure). */
export const FOLDER_FAILURE: Record<FolderProblem, { code: string; message: string }> = {
  gone: { code: "save_folder_gone", message: "The folder is missing or its drive is not connected." },
  refused: { code: "folder_not_writable", message: "Clipr is not allowed to save in that folder." },
};
