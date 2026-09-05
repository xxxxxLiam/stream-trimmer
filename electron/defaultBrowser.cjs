/**
 * File: defaultBrowser.cjs
 * Path: electron/defaultBrowser.cjs
 * Description: Maps the operating system's default web browser to yt-dlp's browser names.
 */
const { execFileSync } = require("node:child_process");

const SUPPORTED_BROWSERS = [
  "chrome",
  "safari",
  "edge",
  "firefox",
  "brave",
  "chromium",
];

function mapBrowserName(value) {
  const name = String(value || "").toLowerCase();
  if (name.includes("brave")) return "brave";
  if (name.includes("firefox")) return "firefox";
  if (name.includes("edge") || name.includes("msedge")) return "edge";
  if (name.includes("chromium")) return "chromium";
  if (name.includes("chrome")) return "chrome";
  if (name.includes("safari")) return "safari";
  return null;
}

function detectDefaultBrowser(app) {
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

function browserCheckOrder(defaultBrowser, savedBrowser) {
  return [...new Set([defaultBrowser, savedBrowser, ...SUPPORTED_BROWSERS])].filter(
    (browser) => SUPPORTED_BROWSERS.includes(browser),
  );
}

module.exports = {
  SUPPORTED_BROWSERS,
  mapBrowserName,
  detectDefaultBrowser,
  browserCheckOrder,
};