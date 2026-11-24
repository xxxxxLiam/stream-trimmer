/**
 * File: diagnosticsService.ts
 * Path: src/main/features/diagnostics/services/diagnosticsService.ts
 * Description: Surfaces the local log so a crash can be reported without hunting
 *   for a hidden folder. Only event names and error messages are ever recorded.
 *
 *   Every reader of the log goes through readLogScrubbed(). The log can hold
 *   cookie rows, bearer tokens, signed URLs, an email and the home path, so no
 *   handler reads the raw file text (logger.tail) itself;
 *   src/main/features/diagnostics/services/diagnosticsPath.test.ts fails if one does. A new reader calls
 *   readLogScrubbed() and is safe by default.
 */
import fs from "node:fs";
import os from "node:os";
import { redact } from "../../../../common/utils/redact";
import * as logger from "../../../modules/logger/logger";

export function scrubForDisplay(text: any) {
  return redact(String(text ?? ""), { homeDir: os.homedir() });
}
export function readLogScrubbed(lines = 500) {
  return scrubForDisplay(logger.tail(lines));
}

export function readDiagnostics() {
  return {
    path: scrubForDisplay(logger.logFilePath() || ""),
    text: readLogScrubbed(),
  };
}

export function revealLog(shell: any) {
  try {
    const target = logger.logFilePath();
    if (!target || !fs.existsSync(target)) {
      return { ok: false, error: "No log file yet." };
    }
    shell.showItemInFolder(target);
    return { ok: true, path: target };
  } catch (err: any) {
    return { ok: false, error: logger.describe(err) };
  }
}

export function copyLog(clipboard: any) {
  try {
    // The log can hold cookie rows, bearer tokens, signed URLs, the user's
    // email and home path. Scrub it here, in the process that owns the
    // clipboard, so no caller can put the raw text there.
    clipboard.writeText(readLogScrubbed());
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: logger.describe(err) };
  }
}
