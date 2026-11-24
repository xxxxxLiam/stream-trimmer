/**
 * File: settingsService.ts
 * Path: src/main/features/settings/services/settingsService.ts
 * Description: The persistent settings store for this run. Backed by a JSON file
 *   in userData (see settingsStore.ts). Loaded and its IPC registered BEFORE the
 *   window exists, because the preload reads the snapshot synchronously while the
 *   window is being created.
 */
import path from "node:path";
import electron from "electron";
import { createSettingsStore } from "./settingsStore";
import * as logger from "../../../modules/logger/logger";
import { bakedShape } from "../../owner/services/ownerGate";

const { app } = electron;

let settings: any = null;

export function loadSettings() {
  settings = createSettingsStore(
    path.join(app.getPath("userData"), "settings.json"),
    {
      log: (message: unknown) => logger.log("settings", message),
      // Null in a public build, so the migration never names the exporter's folder.
      dataFolderName: bakedShape ? bakedShape.dataFolderName || null : null,
    },
  );
  settings.load();
}

/** The loaded store, or null before loadSettings() has run. */
export function getSettings(): any {
  return settings;
}
