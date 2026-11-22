#!/usr/bin/env node
/**
 * AF-07 — do the two redact() implementations agree on MY markers, not just on
 * the corpus their own parity test uses? Pure node, no app.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { MARKERS, corpus, leaks } = require("./markers.cjs");

const REPO = "/home/user/stream-trimmer";
const tmp = fs.mkdtempSync("/tmp/af-diag-");
const out = path.join(tmp, "diagnostics.cjs");
execFileSync(path.join(REPO, "node_modules", ".bin", "esbuild"), [
  path.join(REPO, "src", "lib", "diagnostics.ts"),
  "--bundle", "--format=cjs", "--platform=node", `--outfile=${out}`,
]);
const renderer = require(out);
const main = require(path.join(REPO, "electron", "redact.cjs"));

const R = { cases: [] };
const HOMES = [null, "/root", "/home/user", "/Users/sam", "C:\\Users\\Sam"];

for (const home of HOMES) {
  const text = corpus();
  const a = renderer.redact(text, { homeDir: home });
  const b = main.redact(text, { homeDir: home });
  R.cases.push({
    homeDir: home,
    identical: a === b,
    firstDiffAt: a === b ? null : [...a].findIndex((c, i) => c !== b[i]),
    rendererLeaks: leaks(a),
    mainLeaks: leaks(b),
  });
}

// Per-marker detail for the default (no homeDir) and /root cases.
R.perMarker = MARKERS.map((m) => {
  const r0 = renderer.redact(m.line, {});
  const m0 = main.redact(m.line, {});
  const rRoot = renderer.redact(m.line, { homeDir: "/root" });
  return {
    id: m.id,
    agree: r0 === m0,
    survivesNoHome: r0.includes(m.needle),
    survivesWithRootHome: rRoot.includes(m.needle),
    redactedShape: r0.replace(/R2MK[A-Za-z0-9]+/g, (s) => `${s.slice(0, 8)}…`).slice(0, 150),
  };
});

R.summary = {
  markers: MARKERS.length,
  parityIdenticalForEveryHome: R.cases.every((c) => c.identical),
  leaksNoHome: R.cases[0].rendererLeaks.map((l) => l.id),
  leaksRootHome: R.cases[1].rendererLeaks.map((l) => l.id),
  leaksUserHome: R.cases[2].rendererLeaks.map((l) => l.id),
};

fs.writeFileSync(path.join(__dirname, "out", "af-07-parity.json"), JSON.stringify(R, null, 2));
console.log(JSON.stringify(R, null, 2));
