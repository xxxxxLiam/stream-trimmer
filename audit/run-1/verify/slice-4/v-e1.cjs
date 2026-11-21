#!/usr/bin/env node
/**
 * E-1 verification, written from the finding's Steps, not from the original
 * script. Builds the public shape myself (mkmirror.cjs) and greps:
 *   - the public renderer bundle  (dist/assets/index-*.js)
 *   - the public bundled server   (electron/dist/server.cjs)
 *   - electron/preload.cjs, machineId.cjs, main.cjs as shipped
 * and the owner shapes for contrast, so a "leak" can be told from a string
 * that is simply part of every build.
 *
 * usage: node v-e1.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const SLICE = __dirname;
const OUT = path.join(SLICE, "out", "e1");
fs.mkdirSync(OUT, { recursive: true });

const SHAPES = ["public", "owner-star", "owner-hash"];

// Strings the finding claims leak, plus the ones it records as clean, plus my
// own additions (the exporter's own identifiers in the renderer).
const NEEDLES = [
  "Channel data",
  "ui-channel-link",
  "Back to clipping",
  'onScreen("channel")',
  'screen==="channel"',
  "channelAvailable",
  "Export a channel's data",
  "help-anchor-channel-start",
  "help-anchor-channel-stop",
  "isOwnerMachine",
  "owner:check",
  "__OWNER_MACHINES__",
  // recorded as clean by the finding:
  "api/channel/export",
  "api/channel/export/cancel",
  "api/channel/export/progress",
  "Channel profile exporter",
  "Export channel",
  "What to export",
  "Top 50 per video",
  "videos.csv",
  "transcripts.csv",
  "summary.csv",
  "video-status.csv",
  "subscriber_count",
  "hashtags_in_title",
  "includeTranscripts",
  "channel_follower_count",
  "registerChannelRoutes",
  "slice4-salt-9b21",
];

function countAll(hay, needle) {
  let n = 0;
  let i = 0;
  for (;;) {
    const k = hay.indexOf(needle, i);
    if (k < 0) break;
    n++;
    i = k + needle.length;
  }
  return n;
}

function filesOf(mirror) {
  const assets = path.join(mirror, "dist", "assets");
  const js = fs.readdirSync(assets).filter((f) => f.endsWith(".js")).map((f) => path.join(assets, f));
  const css = fs.readdirSync(assets).filter((f) => f.endsWith(".css")).map((f) => path.join(assets, f));
  return {
    renderer: js,
    rendererCss: css,
    server: [path.join(mirror, "electron", "dist", "server.cjs")],
    electronCjs: ["preload.cjs", "machineId.cjs", "main.cjs"].map((f) =>
      path.join(mirror, "electron", f),
    ),
    sourcemaps: fs.readdirSync(assets).filter((f) => f.endsWith(".map")),
  };
}

const report = { builtAt: new Date().toISOString(), shapes: {} };

for (const shape of SHAPES) {
  if (!fs.existsSync(`/tmp/s4-${shape}`)) {
    execFileSync("node", [path.join(SLICE, "mkmirror.cjs"), shape], { stdio: "inherit" });
  }
  const mirror = `/tmp/s4-${shape}`;
  const f = filesOf(mirror);
  const bucket = { mirror, files: {}, counts: {}, sourcemaps: f.sourcemaps };
  for (const [group, list] of Object.entries({
    renderer: f.renderer,
    server: f.server,
    electronCjs: f.electronCjs,
  })) {
    bucket.files[group] = list.map((p) => path.relative(mirror, p));
    bucket.counts[group] = {};
    for (const n of NEEDLES) {
      let total = 0;
      for (const p of list) total += countAll(fs.readFileSync(p, "utf8"), n);
      bucket.counts[group][n] = total;
    }
  }
  report.shapes[shape] = bucket;
}

// The exact leaked snippets from the public renderer, so the mechanism can be
// read rather than inferred.
const pubAssets = path.join("/tmp/s4-public", "dist", "assets");
const pubJsName = fs.readdirSync(pubAssets).find((f) => f.endsWith(".js"));
const pubJs = fs.readFileSync(path.join(pubAssets, pubJsName), "utf8");
const snippets = {};
for (const n of ["Channel data", "ui-channel-link", "Back to clipping", "channelAvailable"]) {
  const k = pubJs.indexOf(n);
  snippets[n] = k < 0 ? null : pubJs.slice(Math.max(0, k - 260), k + 160);
}
report.publicRendererFile = pubJsName;
report.publicSnippets = snippets;

// Does the define actually fold anything? __CHANNEL_DATA__ should be gone and
// CHANNEL_DATA_BUILT false in the public bundle.
report.defineFolded = {
  "__CHANNEL_DATA__ literal in public bundle": pubJs.includes("__CHANNEL_DATA__"),
  "ChannelExportPanel gone (no 'Channel profile exporter')": !pubJs.includes("Channel profile exporter"),
};

fs.writeFileSync(path.join(OUT, "e1-grep.json"), JSON.stringify(report, null, 2));

// Human-readable table.
const lines = [];
lines.push(`public renderer: dist/assets/${pubJsName}`);
lines.push("");
const pad = (s, n) => String(s).padEnd(n);
lines.push(`${pad("needle", 36)} ${["public", "owner-star", "owner-hash"].map((s) => pad(s, 12)).join("")}`);
for (const group of ["renderer", "server", "electronCjs"]) {
  lines.push(`\n--- ${group} (${report.shapes.public.files[group].join(", ")}) ---`);
  for (const n of NEEDLES) {
    const row = SHAPES.map((s) => pad(report.shapes[s].counts[group][n], 12)).join("");
    lines.push(`${pad(n, 36)} ${row}`);
  }
}
lines.push("\n--- sourcemaps in each dist/assets ---");
for (const s of SHAPES) lines.push(`${pad(s, 14)} ${JSON.stringify(report.shapes[s].sourcemaps)}`);
lines.push("\n--- define folding ---");
for (const [k, v] of Object.entries(report.defineFolded)) lines.push(`${pad(k, 56)} ${v}`);
lines.push("\n--- leaked snippets, verbatim from the public bundle ---");
for (const [k, v] of Object.entries(snippets)) lines.push(`\n### ${k}\n${v ?? "(absent)"}`);
const txt = lines.join("\n");
fs.writeFileSync(path.join(OUT, "e1-grep.txt"), txt);
console.log(txt);
