/**
 * File: codeProtection.test.ts
 * Path: scripts/codeProtection.test.ts
 * Description: The code-protection build steps (plans/code-protection-plan.md): the fuses the shipped
 * app flips, that source maps stay private, and that a minified stack decodes back to source.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const fuses = require("./fuses.cjs");
const { esbuildMaps, viteMaps, wantMaps } = require("./sourcemaps.cjs");
const { decodeStack, listMaps, findMap } = require("./decodeStack.cjs");
const { collect } = require("./collect-sourcemaps.cjs");
const esbuild = require("esbuild");
const { TraceMap, originalPositionFor } = require("@jridgewell/trace-mapping");

test("the shipped app closes the run-as-node, NODE_OPTIONS and inspect routes and loads only from the asar", () => {
  assert.equal(fuses.FUSES.RunAsNode, false);
  assert.equal(fuses.FUSES.EnableNodeOptionsEnvironmentVariable, false);
  assert.equal(fuses.FUSES.EnableNodeCliInspectArguments, false);
  assert.equal(fuses.FUSES.OnlyLoadAppFromAsar, true);
  assert.equal(fuses.FUSES.EnableEmbeddedAsarIntegrityValidation, true);
});

test("asar integrity is only asked of macOS and Windows, where Electron can check it", () => {
  assert.equal(fuses.fusesFor("mac").EnableEmbeddedAsarIntegrityValidation, true);
  assert.equal(fuses.fusesFor("windows").EnableEmbeddedAsarIntegrityValidation, true);
  assert.equal("EnableEmbeddedAsarIntegrityValidation" in fuses.fusesFor("linux"), false);
  assert.equal(fuses.fusesFor("linux").RunAsNode, false);
});

test("electron-builder runs the fuse hook after packing, and installers never include maps or TypeScript", () => {
  assert.equal(pkg.build.afterPack, "scripts/fuses.cjs");
  assert.equal(pkg.build.asar, true);
  assert.ok(pkg.build.files.includes("!**/*.map"));
  assert.ok(pkg.build.files.includes("!**/*.ts"));
});

test("a dev build keeps the stock fuses", async () => {
  process.env.CLIPR_DEV_BUILD = "1";
  try {
    // With the flag set the hook returns before it touches the (missing) binary.
    await fuses.afterPack({ appOutDir: "/nonexistent", packager: { platform: { name: "linux" }, executableName: "x", appInfo: {} } });
  } finally {
    delete process.env.CLIPR_DEV_BUILD;
  }
});

test("a normal build writes no source maps; a release build asks for private ones", () => {
  assert.equal(wantMaps({}), false);
  assert.deepEqual(esbuildMaps({}), {});
  assert.equal(viteMaps({}), false);
  assert.equal(wantMaps({ CLIPR_SOURCEMAPS: "1" }), true);
  // external / hidden = a .map file with NO sourceMappingURL comment in the bundle.
  assert.equal(esbuildMaps({ CLIPR_SOURCEMAPS: "1" }).sourcemap, "external");
  assert.equal(viteMaps({ CLIPR_SOURCEMAPS: "1" }), "hidden");
});

test("a minified stack decodes back to the source file, line and name", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "maps-"));
  try {
    const srcDir = path.join(dir, "src");
    mkdirSync(srcDir);
    writeFileSync(
      path.join(srcDir, "engine.ts"),
      ["export function clipSeconds(startSecond: number, endSecond: number) {", "  if (endSecond < startSecond) throw new Error('bad range');", "  return endSecond - startSecond;", "}"].join("\n"),
    );
    const outFile = path.join(dir, "out", "main", "engine.cjs");
    await esbuild.build({
      entryPoints: [path.join(srcDir, "engine.ts")],
      outfile: outFile,
      bundle: true,
      platform: "node",
      format: "cjs",
      minify: true,
      logLevel: "silent",
      ...esbuildMaps({ CLIPR_SOURCEMAPS: "1" }),
    });
    const bundle = readFileSync(outFile, "utf8");
    assert.equal(/sourceMappingURL/.test(bundle), false, "the bundle must not point at its map");
    assert.ok(existsSync(outFile + ".map"));

    // A frame in the minified file, as a packaged app would print it.
    const mapJson = JSON.parse(readFileSync(outFile + ".map", "utf8"));
    const tm = new TraceMap(mapJson);
    let frame = "";
    for (let col = 1; col < bundle.length && !frame; col++) {
      const p = originalPositionFor(tm, { line: 1, column: col });
      if (p.source && p.line === 2) frame = `    at clipSeconds (/Applications/Clipr.app/Contents/Resources/app.asar/out/main/engine.cjs:1:${col + 1})`;
    }
    assert.ok(frame, "found a column that maps to the throw line");

    const mapsDir = path.join(dir, "maps");
    mkdirSync(path.join(mapsDir, "main"), { recursive: true });
    writeFileSync(path.join(mapsDir, "main", "engine.cjs.map"), JSON.stringify(mapJson));
    const decoded = decodeStack(`Error: bad range\n${frame}`, listMaps(mapsDir), TraceMap, originalPositionFor);
    assert.match(decoded, /engine\.ts:2:/);
    assert.equal(decoded.includes("engine.cjs:1:"), false);

    // Negative control: with no map for that version the frame is left exactly as it was.
    const untouched = decodeStack(`Error: bad range\n${frame}`, [], TraceMap, originalPositionFor);
    assert.equal(untouched, `Error: bad range\n${frame}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main/index.cjs and preload/index.cjs frames pick their own map", () => {
  const maps = [
    { key: "main/index.cjs", file: "m" },
    { key: "preload/index.cjs", file: "p" },
    { key: "renderer/assets/index-AbC.js", file: "r" },
  ];
  assert.equal(findMap(maps, "/x/app.asar/out/main/index.cjs").file, "m");
  assert.equal(findMap(maps, "/x/app.asar/out/preload/index.cjs").file, "p");
  assert.equal(findMap(maps, "file:///x/app.asar/dist/assets/index-AbC.js".replace("file://", "")).file, "r");
  assert.equal(findMap(maps, "/x/other/thing.js"), null);
});

test("collect-sourcemaps keeps the maps per version and nothing else", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "collect-"));
  try {
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ version: "9.9.9" }));
    mkdirSync(path.join(dir, "out", "main"), { recursive: true });
    mkdirSync(path.join(dir, "out", "preload"), { recursive: true });
    mkdirSync(path.join(dir, "dist", "assets"), { recursive: true });
    writeFileSync(path.join(dir, "out", "main", "engine.cjs"), "x");
    writeFileSync(path.join(dir, "out", "main", "engine.cjs.map"), "{}");
    writeFileSync(path.join(dir, "out", "preload", "index.cjs.map"), "{}");
    writeFileSync(path.join(dir, "dist", "assets", "index-1.js.map"), "{}");
    const r = collect({ rootDir: dir });
    assert.equal(r.version, "9.9.9");
    assert.deepEqual(r.counts, { main: 1, preload: 1, renderer: 1 });
    assert.deepEqual(readdirSync(path.join(r.dest, "main")), ["engine.cjs.map"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a stack from the OBFUSCATED shipped file still decodes to the original source line", () => {
  const { obfuscateFile } = require("./buildHardening.cjs");
  const { execFileSync } = require("node:child_process");
  const dir = mkdtempSync(path.join(tmpdir(), "clipr-chain-"));
  try {
    mkdirSync(path.join(dir, "src"));
    mkdirSync(path.join(dir, "out", "main"), { recursive: true });
    writeFileSync(
      path.join(dir, "src", "engine.ts"),
      'export function clipSeconds(a: number, b: number): number {\n  if (b <= a) throw new Error("bad range " + a);\n  return b - a;\n}\nclipSeconds(5, 2);\n',
    );
    const outFile = path.join(dir, "out", "main", "engine.cjs");
    esbuild.buildSync({
      entryPoints: [path.join(dir, "src", "engine.ts")],
      outfile: outFile,
      bundle: true,
      platform: "node",
      format: "cjs",
      minify: true,
      logLevel: "silent",
      ...esbuildMaps({ CLIPR_SOURCEMAPS: "1" }),
    });
    obfuscateFile(outFile);
    assert.equal(/sourceMappingURL/.test(readFileSync(outFile, "utf8")), false);

    let stack = "";
    try {
      execFileSync(process.execPath, [outFile], { stdio: "pipe" });
    } catch (e) {
      stack = String((e as { stderr?: Buffer }).stderr);
    }
    assert.match(stack, /engine\.cjs:\d+:\d+/, "the obfuscated file threw with a frame in it");

    const mapsDir = path.join(dir, "maps");
    mkdirSync(path.join(mapsDir, "main"), { recursive: true });
    writeFileSync(path.join(mapsDir, "main", "engine.cjs.map"), readFileSync(outFile + ".map"));
    const decoded = decodeStack(stack, listMaps(mapsDir), TraceMap, originalPositionFor);
    assert.match(decoded, /engine\.ts:2:/);

    // Negative control: the esbuild map alone (what step 3 kept before chaining) cannot decode it.
    esbuild.buildSync({
      entryPoints: [path.join(dir, "src", "engine.ts")],
      outfile: path.join(dir, "plain", "engine.cjs"),
      bundle: true,
      platform: "node",
      format: "cjs",
      minify: true,
      logLevel: "silent",
      ...esbuildMaps({ CLIPR_SOURCEMAPS: "1" }),
    });
    writeFileSync(path.join(mapsDir, "main", "engine.cjs.map"), readFileSync(path.join(dir, "plain", "engine.cjs.map")));
    assert.equal(/engine\.ts:2:/.test(decodeStack(stack, listMaps(mapsDir), TraceMap, originalPositionFor)), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the release workflow keeps each build's source maps as a private artifact and never ships them", () => {
  const yml = readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");
  assert.match(yml, /CLIPR_SOURCEMAPS: "1"/, "the release build writes maps");
  assert.match(yml, /npm run collect-sourcemaps/);
  assert.match(yml, /actions\/upload-artifact@v4/);
  assert.match(yml, /name: sourcemaps-\$\{\{ steps\.maps\.outputs\.version \}\}-\$\{\{ runner\.os \}\}/);
  // The only upload to the public releases repo is electron-builder's installer; the maps step is
  // an artifact of this private repository, and the packaged file list still excludes every map.
  assert.equal(yml.includes("gh release upload"), false);
  assert.ok(pkg.build.files.includes("!**/*.map"));
});

test("a manual run can publish a pre-release that is not 'latest'; an ordinary run still publishes latest", () => {
  const yml = readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");
  assert.match(yml, /prerelease:\s*\n\s*description:[^\n]*\n\s*type: boolean\n\s*default: false/);
  assert.match(yml, /PRERELEASE: \$\{\{ github\.event\.inputs\.prerelease \|\| 'false' \}\}/);
  assert.match(yml, /"\$\{PRERELEASE:-false\}" = "true"[\s\S]*--prerelease[\s\S]*--latest=false[\s\S]*else[\s\S]*--latest \\/);
  // A push to main has no inputs, so it can never be a pre-release.
  assert.match(yml, /push:\s*\n\s*branches: \[main\]/);
});

test("every platform's release build tries to vendor the PO token provider (non-fatal) and reports whether it shipped", () => {
  const yml = readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");
  assert.match(yml, /name: Vendor the PO token provider[\s\S]*?continue-on-error: true[\s\S]*?POT_PROVIDER_LICENSE_ACK: "1"[\s\S]*?npm run tools:refresh-pot/);
  assert.match(yml, /name: Check the provider is in the package[\s\S]*?if: always\(\)[\s\S]*?GITHUB_STEP_SUMMARY/);
  // It runs before packaging, in the same job that packages for the matrix OS.
  assert.ok(yml.indexOf("Vendor the PO token provider") < yml.indexOf("Build & upload installer"));
  assert.equal(pkg.scripts["tools:refresh-pot"], "node scripts/bundle-binaries.cjs --pot");
});
