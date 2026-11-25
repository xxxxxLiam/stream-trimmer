/**
 * File: folderLabel.ts
 * Path: src/renderer/src/shared/utils/folderLabel.ts
 * Description: How a folder path reads on a chip or row (used by the cold start and Settings).
 */
/** Last two folders of a path for the chip: "/Users/a/Downloads/Clipr" reads as "Downloads/Clipr". */
export function folderChipLabel(dir: string | null | undefined, depth = 2): string {
  const parts = (dir ?? "").split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0) return "Downloads/Clipr";
  return parts.slice(-depth).join("/");
}

/** What to say when Open finds a folder Clipr has not made yet: it is made with the first clip. */
export const FOLDER_NOT_MADE_YET = "This folder will be made with your first clip.";
