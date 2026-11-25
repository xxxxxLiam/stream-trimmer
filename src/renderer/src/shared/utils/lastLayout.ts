/**
 * File: lastLayout.ts
 * Path: src/renderer/src/shared/utils/lastLayout.ts
 * Description: The Final Cut layout picked last, which a new campaign starts with (like the look).
 */
import { isImportLayout, type ImportLayoutId } from "../../../../common/types/importLayout";
import { readSetting, writeSetting } from "./persist";

export const KEY_LAST_LAYOUT = "clipper.fcpLastLayout";

export function loadLastLayout(): ImportLayoutId | undefined {
  const v = readSetting<unknown>(KEY_LAST_LAYOUT, "");
  return isImportLayout(v) ? v : undefined;
}

export function rememberLastLayout(id: ImportLayoutId): void {
  writeSetting(KEY_LAST_LAYOUT, id);
}
