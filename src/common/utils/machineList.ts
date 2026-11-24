/**
 * File: machineList.ts
 * Path: src/common/utils/machineList.ts
 * Description: Parses the owner machine list: "a, B ,," -> ["a","b"]. The renderer
 * reads the baked list with it and the main process checks against it.
 */
export function parseMachineList(raw: unknown): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
