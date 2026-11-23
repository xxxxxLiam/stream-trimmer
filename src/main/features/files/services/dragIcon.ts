/**
 * File: dragIcon.ts
 * Path: src/main/features/files/services/dragIcon.ts
 * Description: Drag icon for native file drag-out, resolved once and reused.
 *   startDrag needs a non-empty icon synchronously or Windows cancels the drag
 *   outright.
 */
import fs from "node:fs";
import path from "node:path";
import electron from "electron";

const { nativeImage } = electron;

let dragIcon: any = null;
export function getDragIcon() {
  if (dragIcon && !dragIcon.isEmpty()) return dragIcon;
  try {
    const iconPath = path.join(__dirname, "..", "..", "resources", "icon.png");
    if (fs.existsSync(iconPath)) {
      dragIcon = nativeImage
        .createFromPath(iconPath)
        .resize({ width: 64, height: 64 });
    }
  } catch {
    dragIcon = null;
  }
  if (!dragIcon || dragIcon.isEmpty()) dragIcon = nativeImage.createEmpty();
  return dragIcon;
}
