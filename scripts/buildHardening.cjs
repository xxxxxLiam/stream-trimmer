// scripts/buildHardening.cjs — shared by build-main.cjs and build-server.cjs: whether this
// build should ship with scrambled main/engine code, and the esbuild + obfuscation steps that
// do it. See plans/code-protection-plan.md (option B).
//
// CLIPR_DEV_BUILD=1 keeps main and the engine readable: set by dev:electron (the local dev
// loop) and by the audit harness, which both debug from the built output. Anything else
// (dist:*, release:*, build:mine) is a build someone installs, and ships hardened.
const fs = require("node:fs");
const path = require("node:path");

function isHardened() {
  return !/^(1|true|yes|on)$/i.test(String(process.env.CLIPR_DEV_BUILD || "").trim());
}

/** esbuild options common to a hardened or a readable build. Always strips legal comments out of
 * the bundle itself (collectLegalComments below folds them into THIRD-PARTY-NOTICES.md instead of
 * shipping them inline); minification only happens for a hardened build. */
function esbuildHardeningOptions(hardened) {
  return {
    legalComments: "external",
    ...(hardened ? { minify: true, keepNames: false } : {}),
  };
}

/**
 * esbuild writes third-party license comments to "<outfile>.LEGAL.txt" when legalComments is
 * "external" (see esbuildHardeningOptions). This folds that sidecar into THIRD-PARTY-NOTICES.md's
 * generated section and removes it from the output folder, so it is never packaged (package.json's
 * build.files ships everything under out/**) and never lost either.
 */
function collectLegalComments(outfile, label) {
  const sidecar = `${outfile}.LEGAL.txt`;
  let text = "";
  try {
    text = fs.readFileSync(sidecar, "utf8").trim();
  } catch {
    return;
  }
  fs.rmSync(sidecar, { force: true });
  if (!text) return;
  const noticesFile = path.join(__dirname, "..", "THIRD-PARTY-NOTICES.md");
  const start = "<!-- GENERATED: bundled JS license comments, written by scripts/buildHardening.cjs -->";
  const end = "<!-- END GENERATED -->";
  const block = [start, `### Collected from ${label}'s bundle`, "", "```", text, "```", end].join("\n");
  const current = fs.readFileSync(noticesFile, "utf8");
  const withoutOld = current.replace(new RegExp(`\\n*${start}[\\s\\S]*?${end}`, "g"), "");
  fs.writeFileSync(noticesFile, `${withoutOld.trimEnd()}\n\n${block}\n`);
}

/**
 * Scrambles a built CommonJS bundle in place: identifiers renamed, string literals moved into a
 * decoded array, a little dead code mixed in. Control-flow flattening is OFF (the build-time and
 * startup cost the plan accepts is for the rest; flattening's own cost is much larger). Console
 * output is left alone — support diagnostics read it from the shipped build.
 */
function obfuscateFile(file) {
  const JavaScriptObfuscator = require("javascript-obfuscator");
  const code = fs.readFileSync(file, "utf8");
  const result = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    target: "node",
    controlFlowFlattening: false,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.1,
    stringArray: true,
    stringArrayEncoding: ["base64"],
    stringArrayThreshold: 0.75,
    identifierNamesGenerator: "hexadecimal",
    renameGlobals: false,
    selfDefending: false,
    disableConsoleOutput: false,
  });
  fs.writeFileSync(file, result.getObfuscatedCode(), "utf8");
}

module.exports = { isHardened, esbuildHardeningOptions, collectLegalComments, obfuscateFile };
