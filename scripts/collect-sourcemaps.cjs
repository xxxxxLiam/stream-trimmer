/**
 * File: collect-sourcemaps.cjs
 * Path: scripts/collect-sourcemaps.cjs
 * Description: Gathers the private source maps of a release build (written when CLIPR_SOURCEMAPS=1)
 * into sourcemaps/<version>/{main,preload,renderer}/, ready to be kept per version and read by
 * `npm run decode-stack`. Nothing here is packaged into an installer.
 *
 *   CLIPR_SOURCEMAPS=1 npm run build:electron && npm run collect-sourcemaps
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function copyMaps(from, to) {
  let n = 0;
  if (!fs.existsSync(from)) return 0;
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const src = path.join(d, e.name);
      if (e.isDirectory()) walk(src, path.join(rel, e.name));
      else if (e.name.endsWith(".map")) {
        fs.mkdirSync(path.join(to, rel), { recursive: true });
        fs.copyFileSync(src, path.join(to, rel, e.name));
        n++;
      }
    }
  };
  walk(from, "");
  return n;
}

function collect({ rootDir = root, version } = {}) {
  const v = version ?? JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")).version;
  const dest = path.join(rootDir, "sourcemaps", v);
  fs.rmSync(dest, { recursive: true, force: true });
  const counts = {
    main: copyMaps(path.join(rootDir, "out", "main"), path.join(dest, "main")),
    preload: copyMaps(path.join(rootDir, "out", "preload"), path.join(dest, "preload")),
    renderer: copyMaps(path.join(rootDir, "dist"), path.join(dest, "renderer")),
  };
  return { version: v, dest, counts, total: counts.main + counts.preload + counts.renderer };
}

if (require.main === module) {
  const r = collect();
  if (r.total === 0) {
    console.error("No source maps were written. Build with CLIPR_SOURCEMAPS=1 first.");
    process.exit(1);
  }
  console.log(`[sourcemaps] ${r.total} maps for ${r.version} in ${r.dest}`, r.counts);
}

module.exports = { collect };
