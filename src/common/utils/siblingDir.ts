/**
 * File: siblingDir.ts
 * Path: src/common/utils/siblingDir.ts
 * Description: "/a/b/clips" -> "/a/b/<name>". The data folder sits beside the clips
 * folder; main (settings migration) and renderer (new campaigns) both place it this way.
 */
export function siblingDir(dir: string, name: string): string {
  const trimmed = String(dir).replace(/[\\/]+$/, "");
  const sep = trimmed.includes("\\") && !trimmed.includes("/") ? "\\" : "/";
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (cut < 0) return name;
  return `${trimmed.slice(0, cut)}${sep}${name}`;
}
