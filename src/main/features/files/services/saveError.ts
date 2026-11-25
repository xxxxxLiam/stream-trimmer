/**
 * File: saveError.ts
 * Path: src/main/features/files/services/saveError.ts
 * Description: Turns a failed save into one plain sentence. The Node error (stack lines, install paths)
 *   goes to the log; only this sentence goes to the screen.
 */

export function plainSaveError(err: unknown): string {
  const e = (err ?? {}) as { code?: string; message?: string };
  const text = `${e.code ?? ""} ${e.message ?? ""}`;
  if (/ENOSPC|no space left|EDQUOT/i.test(text)) return "The folder is full. Free some space or choose another folder.";
  if (/EACCES|EPERM|EROFS|permission denied|operation not permitted/i.test(text))
    return "Clipr can't write to that folder. Choose another folder.";
  if (/ENOTDIR|EEXIST|ENOENT|EISDIR|ENAMETOOLONG|ERR_INVALID_ARG|null bytes/i.test(text))
    return "That folder can't be used. Choose another folder.";
  return "The clip couldn't be saved. Choose another folder and try again.";
}
