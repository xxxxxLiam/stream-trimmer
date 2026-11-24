/**
 * File: exportService.ts
 * Path: src/main/features/exports/services/exportService.ts
 * Description: Moves a finished channel export out of the engine's temp dir, the
 *   same way saveClip moves a finished clip. The CSVs themselves never enter the
 *   renderer: a whole-channel export is millions of caption lines, and routing
 *   that through a JSON response and back across IPC is what used to run the app
 *   out of memory.
 */
import os from "node:os";
import { saveExportFiles } from "./exportSave";
import * as logger from "../../../modules/logger/logger";
import { ownerGate } from "../../owner/services/ownerGate";
import { saveRoots } from "../../files/services/saveRoots";

export async function saveExport(payload: any) {
  try {
    // Owner-only, like the exporter that produces these folders. A refusal
    // carries no hint the feature exists.
    if (!(await ownerGate.isOwner())) return { ok: false, error: "Could not save." };
    const result = await saveExportFiles({
      dirPath: payload?.dirPath,
      folder: payload?.folder,
      files: payload?.files,
      tmpRoot: os.tmpdir(),
      allowedRoots: saveRoots(),
    });
    logger.log(
      "export",
      result.ok
        ? `saved ${payload.files.length} file(s) to ${result.path}`
        : `refused: ${result.error}`,
    );
    return result;
  } catch (err: unknown) {
    logger.log("export", `save failed: ${logger.describe(err)}`);
    return { ok: false, error: logger.describe(err) };
  }
}
