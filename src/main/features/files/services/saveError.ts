/**
 * File: saveError.ts
 * Path: src/main/features/files/services/saveError.ts
 * Description: Turns a failed save into a code and one plain sentence. The Node error (stack lines, install
 *   paths) goes to the log; only the code and the sentence go to the screen, so the Export row can say what
 *   happened and offer Change folder.
 */

export type SaveErrorCode = "DISK_FULL" | "FOLDER_NOT_WRITABLE" | "FOLDER_GONE" | "SAVE_FAILED";

export interface SaveError {
  code: SaveErrorCode;
  error: string;
}

export function describeSaveError(err: unknown): SaveError {
  const e = (err ?? {}) as { code?: string; message?: string };
  const text = `${e.code ?? ""} ${e.message ?? ""}`;
  if (/ENOSPC|no space left|EDQUOT/i.test(text)) return { code: "DISK_FULL", error: "The folder is full. Free some space or choose another folder." };
  if (/EACCES|EPERM|EROFS|permission denied|operation not permitted/i.test(text))
    return { code: "FOLDER_NOT_WRITABLE", error: "Clipr can't write to that folder. Choose another folder." };
  if (/ENOTDIR|EEXIST|ENOENT|EISDIR|ENAMETOOLONG|ERR_INVALID_ARG|null bytes/i.test(text))
    return { code: "FOLDER_GONE", error: "That folder can't be used. Choose another folder." };
  return { code: "SAVE_FAILED", error: "The clip couldn't be saved. Choose another folder and try again." };
}

/** The sentence alone. */
export const plainSaveError = (err: unknown): string => describeSaveError(err).error;
