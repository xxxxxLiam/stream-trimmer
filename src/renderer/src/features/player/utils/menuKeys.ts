/**
 * File: menuKeys.ts
 * Path: src/renderer/src/features/player/utils/menuKeys.ts
 * Description: Keyboard movement in a menu of `count` rows: arrows step (and wrap), Home and End jump.
 */
export function menuTarget(current: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === "ArrowDown") return current < 0 ? 0 : (current + 1) % count;
  if (key === "ArrowUp") return current < 0 ? count - 1 : (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
