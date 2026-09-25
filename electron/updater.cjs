/**
 * File: updater.cjs
 * Path: electron/updater.cjs
 * Description: Auto-update policy — whether an update can be installed in
 * place on this platform, and where to send the user when it cannot. Pure (no
 * electron import) so it can be tested.
 */

const OWNER = "xxxxxLiam";
const REPO = "stream-trimmer";

// The installer each platform downloads. These must match the artifactName
// entries in package.json's `build` config; updater.test.ts asserts they do,
// so renaming an artifact breaks a test rather than a user's download link.
const ASSETS = {
  darwin: "YouTube-Clipper-macOS-AppleSilicon.dmg",
  win32: "YouTube-Clipper-Windows-x64-Setup.exe",
  linux: "YouTube-Clipper-Linux-x64.AppImage",
};

/**
 * Whether electron-updater can download an update and restart into it.
 *
 * Not on macOS. Squirrel.Mac checks the code signature of both the running
 * app and the replacement, and this app ships unsigned on purpose —
 * `mac.identity` is null in the build config, because signing needs a paid
 * Apple Developer ID. The mac feed also lists only the .dmg, and the
 * updater's mac path wants a .zip, so it fails with
 * ERR_UPDATER_ZIP_FILE_NOT_FOUND before the signature is even looked at.
 *
 * Rather than let the button spin and then report a failure nobody can act
 * on, macOS checks for a new version and hands over a download link.
 *
 * Windows (NSIS) and Linux (AppImage) update in place unsigned, so they keep
 * the real thing.
 */
function canInstallInPlace(platform) {
  return platform !== "darwin";
}

/** The installer filename for a platform, or null if it has no build. */
function assetName(platform) {
  return ASSETS[platform] ?? null;
}

/** Direct download for a released version — one click, no page to read. */
function downloadUrl(platform, version) {
  const asset = assetName(platform);
  const tag = releaseTag(version);
  if (!asset || !tag) return releasesUrl();
  return `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/${asset}`;
}

function releasesUrl() {
  return `https://github.com/${OWNER}/${REPO}/releases/latest`;
}

// Releases are tagged `v<version>`; electron-updater reports the bare version.
function releaseTag(version) {
  const text = String(version ?? "").trim();
  if (!/^v?\d+\.\d+\.\d+/.test(text)) return null;
  return text.startsWith("v") ? text : `v${text}`;
}

module.exports = {
  ASSETS,
  OWNER,
  REPO,
  assetName,
  canInstallInPlace,
  downloadUrl,
  releaseTag,
  releasesUrl,
};
