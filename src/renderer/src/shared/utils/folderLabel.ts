/**
 * File: folderLabel.ts
 * Path: src/renderer/src/shared/utils/folderLabel.ts
 * Description: How a folder path reads on a chip or row (used by the cold start and Settings).
 */
/** Last two folders of a path for the chip: "/Users/a/Downloads/Clipr" reads as "Downloads/Clipr". */
export function folderChipLabel(dir: string | null | undefined): string {
  const parts = (dir ?? "").split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0) return "Downloads/Clipr";
  return parts.slice(-2).join("/");
}
