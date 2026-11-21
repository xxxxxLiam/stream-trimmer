#!/usr/bin/env node
/**
 * File: status.cjs
 * Path: audit/status.cjs
 * Description: Writes audit/STATUS.md from what is actually on disk, so the
 *   run can be watched from outside the session. Counts scripts, screenshots
 *   and captured output per area, reads the finding tallies out of any report
 *   that has been written, and reports how recently each helper touched a
 *   file. Run it again at any time: `node audit/status.cjs`.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname);
const AREAS = {
  A: "Onboarding and sign-in",
  B: "Core clipping loop",
  C: "Clip bank and campaigns",
  D: "Output and editor handoff",
  E: "Channel data and owner gate",
  F: "Help, diagnostics and updates",
  G: "Server and jobs",
  H: "Accessibility and layout",
};
const SEVERITIES = ["blocker", "major", "minor", "polish"];

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const reportFor = (letter) => {
  const dir = path.join(ROOT, "run-1", "areas");
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const hit = names.find((n) => n.toUpperCase().startsWith(letter + "-"));
  return hit ? path.join(dir, hit) : null;
};

const rows = [];
let totals = { scripts: 0, shots: 0, captures: 0 };
const tally = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
let reportsDone = 0;

for (const [letter, title] of Object.entries(AREAS)) {
  const files = [
    ...walk(path.join(ROOT, "run-1", `area-${letter}`)),
    ...walk(path.join(ROOT, "out", `area-${letter}`)),
  ];
  const scripts = files.filter((f) => /\.(cjs|mjs|js|ts)$/.test(f)).length;
  const shots = files.filter((f) => f.endsWith(".png")).length;
  const captures = files.filter((f) => /\.(txt|json|csv|log)$/.test(f)).length;
  const latest = files.reduce((acc, f) => {
    try {
      return Math.max(acc, fs.statSync(f).mtimeMs);
    } catch {
      return acc;
    }
  }, 0);

  const report = reportFor(letter);
  let findings = null;
  if (report) {
    reportsDone += 1;
    const text = fs.readFileSync(report, "utf8");
    findings = {};
    for (const s of SEVERITIES) {
      // Count the finding blocks, not every mention of the word.
      const n = (text.match(new RegExp(`^- \\*\\*Severity\\*\\*:\\s*${s}\\b`, "gmi")) || []).length;
      findings[s] = n;
      tally[s] += n;
    }
  }

  totals.scripts += scripts;
  totals.shots += shots;
  totals.captures += captures;
  rows.push({ letter, title, scripts, shots, captures, latest, report, findings });
}

const ago = (ms) => {
  if (!ms) return "—";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  return `${(s / 3600).toFixed(1)}h ago`;
};

const out = [];
out.push("# Audit run 1 — live status");
out.push("");
out.push(`Generated ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC ` +
  `by \`node audit/status.cjs\`. Re-run it to refresh.`);
out.push("");
out.push(`**${reportsDone} of ${Object.keys(AREAS).length} area reports written.** ` +
  `${totals.scripts} test scripts, ${totals.shots} screenshots, ` +
  `${totals.captures} captured output files.`);
out.push("");
out.push("A helper writes its report last, so an area with no report is still running.");
out.push("");
out.push("| Area | | Scripts | Shots | Captures | Last wrote | Report |");
out.push("|---|---|--:|--:|--:|---|---|");
for (const r of rows) {
  const state = r.report ? "done" : r.latest ? "running" : "starting";
  out.push(
    `| **${r.letter}** | ${r.title} | ${r.scripts} | ${r.shots} | ${r.captures} | ` +
      `${ago(r.latest)} | ${state} |`,
  );
}
out.push("");

if (reportsDone) {
  out.push("## Findings so far");
  out.push("");
  out.push("Counted from the reports that exist. **Not yet verified** — under the");
  out.push("audit protocol a separate helper re-runs every blocker and major from");
  out.push("scratch, and false alarms are dropped before the action plan.");
  out.push("");
  out.push("| Area | Blocker | Major | Minor | Polish |");
  out.push("|---|--:|--:|--:|--:|");
  for (const r of rows) {
    if (!r.findings) continue;
    out.push(
      `| ${r.letter} — ${r.title} | ${r.findings.blocker} | ${r.findings.major} | ` +
        `${r.findings.minor} | ${r.findings.polish} |`,
    );
  }
  out.push(
    `| **Total** | **${tally.blocker}** | **${tally.major}** | ` +
      `**${tally.minor}** | **${tally.polish}** |`,
  );
  out.push("");
}

out.push("## Where the evidence is");
out.push("");
out.push("- Reports: `audit/run-1/areas/<AREA>.md`");
out.push("- Test scripts: `audit/run-1/area-<X>/` — re-run one to reproduce a finding");
out.push("- Screenshots and captured output: `audit/out/area-<X>/` (not in git; regenerated)");
out.push("- The feature map and the limits of this environment: `audit/inventory.md`");
out.push("");

fs.writeFileSync(path.join(ROOT, "STATUS.md"), out.join("\n") + "\n");
process.stdout.write(out.slice(0, 14).join("\n") + "\n");
