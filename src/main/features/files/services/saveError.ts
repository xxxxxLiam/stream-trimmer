/**
 * File: saveError.ts
 * Path: src/main/features/files/services/saveError.ts
 * Description: Turns a failed save into a code and one plain sentence. The Node error (stack lines, install
 *   paths) goes to the log; only the code and the sentence go to the screen, so the Export row can say what
 *   happened and offer Change folder.
 */

export type SaveErrorCode =
  | "DISK_FULL"
  | "FOLDER_NOT_WRITABLE"
  | "FOLDER_GONE"
  | "FILE_NAME_INVALID"
  | "NOTHING_TO_SAVE"
  | "SAVE_FAILED";

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
  // A bad name or empty data is not the folder's fault (E2-5): say so, so nobody is sent to change a folder that is fine.
  if (/ENAMETOOLONG|null bytes|ERR_INVALID_ARG_VALUE|ERR_INVALID_FILE_URL_PATH|EINVAL/i.test(text))
    return { code: "FILE_NAME_INVALID", error: "That file name can't be used. Use a shorter name without special characters." };
  if (/NOTHING_TO_SAVE|ERR_INVALID_ARG_TYPE|must be of type string or an instance of Buffer/i.test(text))
    return { code: "NOTHING_TO_SAVE", error: "There was nothing to save." };
  if (/ENOTDIR|EEXIST|ENOENT|EISDIR/i.test(text))
    return { code: "FOLDER_GONE", error: "That folder can't be used. Choose another folder." };
  return { code: "SAVE_FAILED", error: "The clip couldn't be saved. Choose another folder and try again." };
}

/** The sentence alone. */
export const plainSaveError = (err: unknown): string => describeSaveError(err).error;
