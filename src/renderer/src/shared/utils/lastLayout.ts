/**
 * File: lastLayout.ts
 * Path: src/renderer/src/shared/utils/lastLayout.ts
 * Description: The Final Cut layout picked last, which a campaign with no Final Cut settings of its own yet starts with (like the look).
 */
import { FCP_LAYOUTS, type FcpLayout } from "./fcpxml";
import { readSetting, writeSetting } from "./persist";

export const KEY_LAST_LAYOUT = "clipper.fcpLastLayout";

export function loadLastLayout(): FcpLayout | undefined {
  const v = readSetting<unknown>(KEY_LAST_LAYOUT, "");
  return FCP_LAYOUTS.includes(v as FcpLayout) ? (v as FcpLayout) : undefined;
}

export function rememberLastLayout(id: FcpLayout): void {
  writeSetting(KEY_LAST_LAYOUT, id);
}
