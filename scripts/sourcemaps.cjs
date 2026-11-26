/**
 * File: sourcemaps.cjs
 * Path: scripts/sourcemaps.cjs
 * Description: Whether the build writes PRIVATE source maps, and where they are collected.
 * Part of the code-protection plan (plans/code-protection-plan.md).
 *
 * Shipped installers carry no maps (electron-builder's `files` excludes **\/*.map) and the
 * bundles carry no `sourceMappingURL` comment, so nobody can find a map from the app. A release
 * build sets CLIPR_SOURCEMAPS=1 to write them anyway, then collect-sourcemaps.cjs gathers them
 * per version for the maintainers, and `npm run decode-stack` turns a minified crash-report
 * stack back into file and line.
 *
 * Maps hold names and positions only (no source text), so they stay small.
 */
const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v ?? "").trim());

/** True when this build should write maps. */
function wantMaps(env = process.env) {
  return truthy(env.CLIPR_SOURCEMAPS);
}

/** esbuild's `sourcemap` / `sourcesContent` options: external = a .map file and no comment in the bundle. */
function esbuildMaps(env = process.env) {
  return wantMaps(env) ? { sourcemap: "external", sourcesContent: false } : {};
}

/** Vite's `build.sourcemap`: "hidden" = a .map file and no comment in the bundle. */
function viteMaps(env = process.env) {
  return wantMaps(env) ? "hidden" : false;
}

module.exports = { wantMaps, esbuildMaps, viteMaps };
