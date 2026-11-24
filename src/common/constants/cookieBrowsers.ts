/**
 * File: cookieBrowsers.ts
 * Path: src/common/constants/cookieBrowsers.ts
 * Description: The browsers yt-dlp can read a logged-in YouTube session from. Named in
 * the bridge types (main and preload) and in the renderer's sign-in flow.
 */
export const COOKIE_BROWSERS = [
  "chrome",
  "safari",
  "edge",
  "firefox",
  "brave",
  "chromium",
] as const;

export type CookieBrowser = (typeof COOKIE_BROWSERS)[number];
