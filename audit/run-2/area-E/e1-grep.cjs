#!/usr/bin/env node
/**
 * audit/run-2/area-E/e1-grep.cjs
 *
 * E-1: does the PUBLIC build betray that the channel exporter exists?
 *
 * Counts every needle in each build shape's renderer bundle(s), its CSS, its
 * index.html, the bundled server, and the `electron/*.cjs` files that
 * package.json's build.files ships verbatim. Public must be 0 for every needle
 * that belongs to the feature.
 *
 * The needle list is run 1's, plus everything else that could betray the
 * feature: route names, context names, CSS classes, source-map references, the
 * preload surface, machineId, owner:check.
 *
 * usage: node e1-grep.cjs > out/e1-grep.txt
 */
const fs = require("node:fs");
const path = require("node:path");
const { mirrorPath, SALT, MINE_HASH, OTHER_HASH } = require("./mirror.cjs");

const SHAPES = ["public", "owner-star", "owner-hash", "owner-other"];

// --- the needles ----------------------------------------------------------
// group A: run 2's brief names these explicitly.
const BRIEF = [
  "Channel data",
  "ui-channel-link",
  "Back to clipping",
  "api/channel/export",
  "Exported channel data",
  "channel-data",
  "ui-channel-start",
  "ui-channel-stop",
  "VITE_OWNER",
  SALT,
  MINE_HASH,
  OTHER_HASH,
];

// group B: anything else that betrays the feature.
const EXTRA = [
  // routes + server
  "/api/channel/export",
  "api/channel/export/cancel",
  "api/channel/export/progress",
  "registerChannelRoutes",
  "channelRoutes",
  "ytchanwip",
  "ownerOnly",
  "decideOwnerAccess",
  "parseOwnerList",
  "VITE_OWNER_MACHINES",
  "VITE_OWNER_SALT",
  "VITE_ENABLE_CHANNEL_DATA",
  "activeCheckpoints",
  "CheckpointLostError",
  // renderer screen / context / props
  'onScreen("channel")',
  'screen==="channel"',
  "channelAvailable",
  "ChannelExportProvider",
  "ChannelExportContext",
  "useChannelExportContext",
  "ChannelExportPanel",
  "ChannelBoundary",
  "useChannelExport",
  "useOwnerAccess",
  "checkOwnerAccess",
  "isOwnerMachine",
  "owner:check",
  "ownerGate",
  "__OWNER_MACHINES__",
  "__OWNER_SALT__",
  "__CHANNEL_DATA__",
  "machineId",
  "hashMachineId",
  // panel copy and CSV surface
  "Channel profile exporter",
  "Export channel",
  "What to export",
  "Top 50 per video",
  "youtube.com/@channelhandle",
  "videos.csv",
  "transcripts.csv",
  "comments.csv",
  "summary.csv",
  "video-status.csv",
  "subscriber_count",
  "hashtags_in_title",
  "includeTranscripts",
  "includeVideoDetails",
  "buildExportFolderName",
  "-export-",
  "saveExport",
  "export:save",
  "Export a channel",
  "Start over (ignore saved progress)",
  "every video on the channel",
  "Everything",
  // css classes / ids used by the panel
  "channel-panel",
  "link-quiet",
  "ui-channel",
  "help-anchor-channel",
  // leftovers
  "sourceMappingURL",
  ".map",
];

function countIn(text, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  for (;;) {
    const at = text.indexOf(needle, i);
    if (at === -1) break;
    n += 1;
    i = at + needle.length;
  }
  return n;
}

function readAll(files) {
  return files
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n\u0000\n");
}

function targetsFor(shape) {
  const M = mirrorPath(shape);
  const assets = path.join(M, "dist", "assets");
  const js = fs.existsSync(assets)
    ? fs.readdirSync(assets).filter((f) => f.endsWith(".js")).map((f) => path.join(assets, f))
    : [];
  const css = fs.existsSync(assets)
    ? fs.readdirSync(assets).filter((f) => f.endsWith(".css")).map((f) => path.join(assets, f))
    : [];
  const maps = fs.existsSync(assets)
    ? fs.readdirSync(assets).filter((f) => f.endsWith(".map"))
    : [];
  const electronCjs = fs
    .readdirSync(path.join(M, "electron"))
    .filter((f) => f.endsWith(".cjs"))
    .map((f) => path.join(M, "electron", f));
  return {
    renderer: readAll(js),
    css: readAll(css),
    html: readAll([path.join(M, "dist", "index.html")]),
    server: readAll([path.join(M, "electron", "dist", "server.cjs")]),
    electron: readAll(electronCjs),
    meta: { js: js.map((f) => path.basename(f)), maps, electronCjs: electronCjs.map((f) => path.basename(f)) },
  };
}

const T = {};
for (const s of SHAPES) T[s] = targetsFor(s);

const SURFACES = ["renderer", "css", "html", "server", "electron"];

function table(title, needles) {
  const rows = [];
  for (const needle of needles) {
    const row = { needle };
    for (const s of SHAPES) {
      for (const surf of SURFACES) {
        row[`${s}/${surf}`] = countIn(T[s][surf], needle);
      }
    }
    rows.push(row);
  }
  const out = [];
  out.push(`\n## ${title}`);
  const head = ["needle".padEnd(38)];
  for (const s of SHAPES) head.push(`${s}:r/c/h/srv/el`.padStart(26));
  out.push(head.join(" | "));
  for (const r of rows) {
    const cells = [String(r.needle).slice(0, 38).padEnd(38)];
    for (const s of SHAPES) {
      const v = SURFACES.map((surf) => r[`${s}/${surf}`]).join("/");
      cells.push(v.padStart(26));
    }
    out.push(cells.join(" | "));
  }
  return { text: out.join("\n"), rows };
}

const a = table("A. the needles run 2's brief names", BRIEF);
const b = table("B. anything else that could betray the feature", EXTRA);

console.log("# E-1 grep matrix (run 2, area E)");
console.log(`salt           : ${SALT}`);
console.log(`this machine   : ${MINE_HASH}`);
console.log(`other machine  : ${OTHER_HASH}`);
console.log("surfaces per shape: r=dist/assets/*.js  c=*.css  h=index.html  srv=electron/dist/server.cjs  el=electron/*.cjs");
for (const s of SHAPES) {
  console.log(`\n[${s}] bundles=${T[s].meta.js.join(",")} maps=${T[s].meta.maps.length} electron=${T[s].meta.electronCjs.length} files`);
}
console.log(a.text);
console.log(b.text);

// --- verdict ------------------------------------------------------------
// Needles that must be absent from the public RENDERER + SERVER + CSS + HTML.
// electron/*.cjs is listed separately: it is not built per shape (the same
// files ship in every shape), so a hit there is a property of the product, not
// of the public build's compile-out, and is reported on its own.
const PUBLIC_MUST_BE_ZERO = [...BRIEF, ...EXTRA].filter(
  (n) => n !== ".map" && n !== "sourceMappingURL" && n !== "Everything" && n !== "link-quiet",
);
const leaks = [];
for (const n of PUBLIC_MUST_BE_ZERO) {
  for (const surf of ["renderer", "css", "html", "server"]) {
    const c = countIn(T.public[surf], n);
    if (c > 0) leaks.push({ needle: n, surface: surf, count: c });
  }
}
console.log("\n## public build leaks (renderer/css/html/server)");
console.log(leaks.length === 0 ? "NONE — every needle is 0" : JSON.stringify(leaks, null, 2));

const elLeaks = [];
for (const n of PUBLIC_MUST_BE_ZERO) {
  const c = countIn(T.public.electron, n);
  if (c > 0) elLeaks.push({ needle: n, count: c });
}
console.log("\n## public build, electron/*.cjs shipped verbatim by build.files");
console.log(elLeaks.length === 0 ? "NONE" : JSON.stringify(elLeaks, null, 2));

// Which electron file, and the lines, so the report can quote them.
if (elLeaks.length) {
  const M = mirrorPath("public");
  const dir = path.join(M, "electron");
  const lines = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".cjs"))) {
    const text = fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/);
    text.forEach((l, i) => {
      for (const { needle } of elLeaks) {
        if (l.includes(needle)) {
          lines.push(`${f}:${i + 1}: ${l.trim().slice(0, 150)}`);
          return;
        }
      }
    });
  }
  console.log([...new Set(lines)].join("\n"));
}

fs.writeFileSync(
  path.join(__dirname, "out", "e1-grep.json"),
  JSON.stringify({ salt: SALT, mine: MINE_HASH, other: OTHER_HASH, brief: a.rows, extra: b.rows, leaks, elLeaks }, null, 2),
);
