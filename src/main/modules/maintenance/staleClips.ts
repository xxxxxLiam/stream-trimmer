/**
 * File: staleClips.ts
 * Path: src/main/modules/maintenance/staleClips.ts
 * Description: A clip handed to the renderer but never saved (a crash, a quit
 *   mid-save) leaves its temp directory behind. These folders also hold the
 *   partial downloads that make a failed clip resumable, so they are kept for a
 *   week.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as logger from "../logger/logger";

export function sweepStaleClips() {
  try {
    const root = os.tmpdir();
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const name of fs.readdirSync(root)) {
      if (!name.startsWith("ytclip-")) continue;
      // Cookie copies are owned by src/main/features/engine/services/cookieJar.ts, which sweeps its own.
      if (name.startsWith("ytclip-cookies-")) continue;
      const dir = path.join(root, name);
      try {
        if (fs.statSync(dir).mtimeMs > cutoff) continue;
        fs.rmSync(dir, { recursive: true, force: true });
        removed += 1;
      } catch {
        /* in use, or gone already */
      }
    }
    if (removed) logger.log("clip", `swept ${removed} stale temp folder(s)`);
  } catch (err: any) {
    logger.log("clip", `sweep failed: ${logger.describe(err)}`);
  }
}
