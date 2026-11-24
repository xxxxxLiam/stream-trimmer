/**
 * File: appVersion.ts
 * Path: src/renderer/src/features/help/utils/appVersion.ts
 * Description: The app version baked in at build time (package.json), empty where it is not defined (tests).
 */
export function appVersion(): string {
  return typeof __APP_VERSION__ === "undefined" ? "" : __APP_VERSION__;
}
