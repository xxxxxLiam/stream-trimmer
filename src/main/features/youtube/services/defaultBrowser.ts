/**
 * File: defaultBrowser.ts
 * Path: src/main/features/youtube/services/defaultBrowser.ts
 * Description: Maps the operating system's default web browser to yt-dlp's browser names.
 */
import { execFileSync } from "node:child_process";

const SUPPORTED_BROWSERS = [
  "chrome",
  "safari",
  "edge",
  "firefox",
  "brave",
  "chromium",
];

function mapBrowserName(value: any) {
  const name = String(value || "").toLowerCase();
  if (name.includes("brave")) return "brave";
  if (name.includes("firefox")) return "firefox";
  if (name.includes("edge") || name.includes("msedge")) return "edge";
  if (name.includes("chromium")) return "chromium";
  if (name.includes("chrome")) return "chrome";
  if (name.includes("safari")) return "safari";
  return null;
}

function detectDefaultBrowser(app: any) {
  try {
    if (typeof app.getApplicationNameForProtocol === "function") {
      const mapped = mapBrowserName(
        app.getApplicationNameForProtocol("https://www.youtube.com"),
      );
      if (mapped) return mapped;
    }
  } catch {
    /* fall through to the Linux desktop-file check */
  }

  if (process.platform === "linux") {
    try {
      return mapBrowserName(
        execFileSync("xdg-settings", ["get", "default-web-browser"], {
          encoding: "utf8",
          timeout: 3000,
        }),
      );
    } catch {
      return null;
    }
  }
  return null;
}

function browserCheckOrder(defaultBrowser: any, savedBrowser: any) {
  return [...new Set([defaultBrowser, savedBrowser, ...SUPPORTED_BROWSERS])].filter(
    (browser) => SUPPORTED_BROWSERS.includes(browser),
  );
}

export {
  SUPPORTED_BROWSERS,
  mapBrowserName,
  detectDefaultBrowser,
  browserCheckOrder,
};
