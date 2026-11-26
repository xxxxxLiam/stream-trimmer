/**
 * File: fuses.cjs
 * Path: scripts/fuses.cjs
 * Description: Which Electron fuses the SHIPPED app has flipped, and the electron-builder
 * afterPack hook that flips them. Part of the code-protection plan (plans/code-protection-plan.md).
 *
 * Fuses are bits in the Electron binary itself, so they only exist in a packaged build. The
 * dev server, the unit tests and the audit harness run unpackaged Electron and are not
 * affected: they stay readable and debuggable.
 *
 *   RunAsNode off                  ELECTRON_RUN_AS_NODE=1 no longer turns the app into a Node shell
 *   NODE_OPTIONS off               the NODE_OPTIONS environment variable is ignored
 *   Node CLI inspect off           --inspect / --inspect-brk are ignored
 *   OnlyLoadAppFromAsar on         the app only loads from app.asar, never from an edited folder
 *   asar integrity on (mac, win)   the asar is checked against a hash embedded at build time
 *
 * Not touched on purpose: cookie encryption (flipping it would orphan saved sign-in cookies)
 * and the file-protocol privileges (the renderer is served from file://).
 */
const path = require("node:path");

/** The fuse settings, by name, so a test can read them without loading Electron. */
const FUSES = {
  RunAsNode: false,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  OnlyLoadAppFromAsar: true,
  EnableEmbeddedAsarIntegrityValidation: true,
};

/** Electron validates the asar hash on macOS and Windows only; on Linux the fuse is skipped. */
function fusesFor(platformName) {
  const out = { ...FUSES };
  if (platformName !== "mac" && platformName !== "windows") delete out.EnableEmbeddedAsarIntegrityValidation;
  return out;
}

/** Path to the Electron binary electron-builder just laid down for this platform. */
function binaryPath(context) {
  const { appOutDir, packager } = context;
  const name = packager.platform.name;
  if (name === "mac") return path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
  if (name === "windows") return path.join(appOutDir, `${packager.appInfo.productFilename}.exe`);
  return path.join(appOutDir, packager.executableName);
}

/** electron-builder afterPack hook. A dev build (CLIPR_DEV_BUILD=1) keeps the stock fuses. */
async function afterPack(context) {
  if (/^(1|true|yes|on)$/i.test(String(process.env.CLIPR_DEV_BUILD || "").trim())) {
    console.log("[fuses] CLIPR_DEV_BUILD is set: leaving the fuses as shipped by Electron");
    return;
  }
  const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");
  const wanted = fusesFor(context.packager.platform.name);
  const config = { version: FuseVersion.V1, resetAdHocDarwinSignature: context.packager.platform.name === "mac" };
  for (const [key, value] of Object.entries(wanted)) config[FuseV1Options[key]] = value;
  const target = binaryPath(context);
  await flipFuses(target, config);
  console.log("[fuses] flipped", Object.keys(wanted).join(", "), "on", target);
}

module.exports = afterPack;
module.exports.afterPack = afterPack;
module.exports.FUSES = FUSES;
module.exports.fusesFor = fusesFor;
module.exports.binaryPath = binaryPath;
