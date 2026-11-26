/**
 * File: decodeStack.cjs
 * Path: scripts/decodeStack.cjs
 * Description: Turns a minified stack trace from a crash report back into source file, line and
 * name, using the private maps kept for that version (see scripts/sourcemaps.cjs).
 *
 *   npm run decode-stack -- 19.6.0 crash.txt          maps in sourcemaps/19.6.0/
 *   npm run decode-stack -- 19.6.0 < crash.txt        or the stack on stdin
 *   npm run decode-stack -- 19.6.0 crash.txt --dir path/to/maps
 *
 * A frame is matched to a map by the end of its path: ".../out/main/engine.cjs:12:3" uses
 * main/engine.cjs.map, ".../dist/assets/index-AbC.js:1:999" uses renderer/assets/index-AbC.js.map.
 * A frame with no map is left exactly as it was.
 */
const fs = require("node:fs");
const path = require("node:path");

/** All .map files under a folder, as { key: path relative to the folder without ".map", file }. */
function listMaps(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".map")) {
        out.push({ key: path.relative(dir, full).split(path.sep).join("/").replace(/\.map$/, ""), file: full });
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

/** The map for a frame's file path, or null. Renderer maps are stored under "renderer/". */
function findMap(maps, framePath) {
  const p = framePath.replace(/\\/g, "/");
  for (const m of maps) {
    const tail = m.key.replace(/^renderer\//, "");
    if (p === tail || p.endsWith("/" + tail)) return m;
  }
  return null;
}

/** Decodes every `path:line:col` frame it can. `trace` is the TraceMap constructor (injectable for tests). */
function decodeStack(stack, maps, TraceMap, originalPositionFor) {
  const loaded = new Map();
  const mapFor = (m) => {
    if (!loaded.has(m.file)) loaded.set(m.file, new TraceMap(fs.readFileSync(m.file, "utf8")));
    return loaded.get(m.file);
  };
  return String(stack)
    .split(/\r?\n/)
    .map((line) =>
      line.replace(/((?:[A-Za-z]:)?[^\s():]*[\\/][^\s():]+\.(?:cjs|js|mjs)):(\d+):(\d+)/g, (whole, file, l, c) => {
        const m = findMap(maps, file);
        if (!m) return whole;
        const pos = originalPositionFor(mapFor(m), { line: Number(l), column: Number(c) - 1 });
        if (!pos || !pos.source) return whole;
        const name = pos.name ? ` (${pos.name})` : "";
        return `${pos.source.replace(/^(\.\.\/)+/, "")}:${pos.line}:${(pos.column ?? 0) + 1}${name}`;
      }),
    )
    .join("\n");
}

function main(argv) {
  const args = argv.slice(2);
  const dirAt = args.indexOf("--dir");
  let dir = null;
  if (dirAt >= 0) {
    dir = args[dirAt + 1];
    args.splice(dirAt, 2);
  }
  const [version, stackFile] = args;
  if (!version) {
    console.error("Usage: npm run decode-stack -- <version> [stack.txt] [--dir <maps folder>]");
    process.exit(2);
  }
  const root = dir ?? path.join(__dirname, "..", "sourcemaps", version);
  const maps = listMaps(root);
  if (maps.length === 0) {
    console.error(`No source maps found in ${root}. Download them for ${version} (gh run download -n sourcemaps-${version}).`);
    process.exit(1);
  }
  const { TraceMap, originalPositionFor } = require("@jridgewell/trace-mapping");
  const stack = fs.readFileSync(stackFile ?? 0, "utf8");
  process.stdout.write(decodeStack(stack, maps, TraceMap, originalPositionFor) + "\n");
}

if (require.main === module) main(process.argv);

module.exports = { listMaps, findMap, decodeStack };
