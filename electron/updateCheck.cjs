/**
 * File: updateCheck.cjs
 * Path: electron/updateCheck.cjs
 * Description: Decides what a manual "Check for updates" actually found. Pure
 * (no electron import) so it can be tested.
 *
 * electron-updater's checkForUpdates() resolves to null when the check never
 * ran (unpackaged build, updates disabled, not an AppImage...). That must not
 * be reported as "Up to date": the user would be told they are current when
 * nothing was asked.
 */

/**
 * @returns {{ kind: "error", message: string } | { kind: "none" } | { kind: "pending", version: string }}
 *   "pending": an update exists; the updater's own events report it.
 */
function interpretCheckResult(result, currentVersion) {
  const info = result && result.updateInfo;
  const version = info && typeof info.version === "string" ? info.version : "";
  if (!result || !info || !version) {
    return {
      kind: "error",
      message: "The update check did not run, so there is no answer. Try again, or download the latest version from the releases page.",
    };
  }
  if (result.isUpdateAvailable === true && version !== currentVersion) {
    return { kind: "pending", version };
  }
  return { kind: "none" };
}

module.exports = { interpretCheckResult };
