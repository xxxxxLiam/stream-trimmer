#!/usr/bin/env node
/**
 * t13-resume-holes.cjs — what run 1 did not reach: the resume path's dedupe key.
 *
 * On a resume, `statuses` (the list of videos already collected, which is what
 * `alreadyDone` is built from) is loaded ONLY inside the `if (saved …)` branch,
 * i.e. only when selection.json parses. The guard added for E-2 discards a
 * checkpoint whose LIVE files are missing, but it never fires when the live
 * files are all present and only `selection.json` is gone — then the run
 * re-lists, re-collects every video, and appends to a comments.jsonl that
 * already holds rows.
 *
 * Three cases, each run through the real server:
 *   A  selection.json removed, live files intact   -> duplicate rows?
 *   B  statuses.jsonl removed, selection intact    -> guard should discard
 *   C  comments.jsonl removed, selection intact    -> guard should discard
 *
 * usage: xvfb-run -a ... node t13-resume-holes.cjs <shape>
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { launch, stubRoot, setStub, save, sleep } = require("./lib.cjs");

const SHAPE = process.argv[2] || "owner-hash";

function wip() {
  return fs
    .readdirSync(os.tmpdir())
    .filter((n) => n.startsWith("ytchanwip-"))
    .map((n) => path.join(os.tmpdir(), n));
}
function snapshot(dir) {
  try {
    return Object.fromEntries(
      fs.readdirSync(dir).map((f) => {
        const p = path.join(dir, f);
        let lines = null;
        try {
          lines = fs.readFileSync(p, "utf8").split("\n").filter(Boolean).length;
        } catch {
          /* ignore */
        }
        return [f, lines];
      }),
    );
  } catch {
    return null;
  }
}
function csvStats(file) {
  const raw = fs.readFileSync(file, "utf8");
  const data = raw.replace(/^﻿/, "").split("\r\n").filter(Boolean).slice(1);
  const byVideo = {};
  for (const line of data) {
    const id = /^"([^"]*)"/.exec(line);
    if (id) byVideo[id[1]] = (byVideo[id[1]] || 0) + 1;
  }
  return { rows: data.length, duplicateRows: data.length - new Set(data).size, perVideo: byVideo };
}

(async () => {
  const report = { shape: SHAPE, startedAt: new Date().toISOString() };
  const root = stubRoot("t13");
  const dataDir = fs.mkdtempSync("/tmp/r2e-data-t13-");

  const a = await launch({
    shape: SHAPE,
    label: `t13-${SHAPE}`,
    cwd: root,
    seed: { "clipper.dataDir": dataDir, "clipper.dataDirConfirmed": true, "clipper.clipsDir": dataDir, "clipper.saveDir": dataDir },
  });

  const exportCall = (jobId, over) =>
    a.win.evaluate(
      async ([job, o]) => {
        const r = await fetch(`${window.__API_BASE__}/api/channel/export?jobId=${job}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url: "https://www.youtube.com/@resumeholes",
            contentType: "all",
            limit: 10,
            includeVideoDetails: true,
            includeComments: true,
            includeTranscripts: true,
            deliver: "path",
            ...o,
          }),
        });
        const text = await r.text();
        let j = null;
        try {
          j = JSON.parse(text);
        } catch {
          /* html */
        }
        return { status: r.status, dir: j && j.dir, files: j && j.files, counts: j && j.counts, cancelled: j && j.cancelled, error: j && j.error, raw: text.slice(0, 200) };
      },
      [jobId, over || {}],
    );

  /** Run until N videos are collected, then cancel. Leaves a checkpoint. */
  async function partialRun(tag, stopAfter) {
    setStub(root, { videos: 10, commentTexts: ["one"], commentDelayMs: 900, subDelayMs: 100, metaDelayMs: 10 });
    const p = exportCall(tag, {});
    // poll the checkpoint on disk until statuses.jsonl has stopAfter lines
    const dl = Date.now() + 60000;
    while (Date.now() < dl) {
      const dirs = wip();
      const hit = dirs.find((d) => {
        const s = snapshot(d) || {};
        return (s["statuses.jsonl"] || 0) >= stopAfter;
      });
      if (hit) break;
      await sleep(150);
    }
    await a.win.evaluate(
      async (job) => {
        await fetch(`${window.__API_BASE__}/api/channel/export/cancel`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobId: job }),
        });
      },
      tag,
    );
    const res = await p;
    const dirs = wip();
    const ck = dirs.find((d) => (snapshot(d) || {})["statuses.jsonl"]);
    return { res, ck, ckFiles: ck ? snapshot(ck) : null };
  }

  try {
    await a.win.waitForSelector("header", { timeout: 30000 });
    const skip = a.win.locator('button:has-text("Continue without signing in")');
    if (await skip.count()) await skip.first().click().catch(() => {});
    await sleep(600);

    for (const [label, remove] of [
      ["A_selection_removed", "selection.json"],
      ["B_statuses_removed", "statuses.jsonl"],
      ["C_comments_removed", "comments.jsonl"],
    ]) {
      // clean slate for the key
      for (const d of wip()) fs.rmSync(d, { recursive: true, force: true });
      const partial = await partialRun(`t13-${label}`, 3);
      const entry = { partial: { status: partial.res.status, cancelled: partial.res.cancelled, ckFiles: partial.ckFiles } };
      if (partial.ck) {
        fs.rmSync(path.join(partial.ck, remove), { force: true });
        entry.removed = remove;
        entry.ckAfterRemoval = snapshot(partial.ck);
      }
      setStub(root, { commentDelayMs: 80, subDelayMs: 30 });
      const resumed = await exportCall(`t13-${label}-resume`, {});
      entry.resumed = { status: resumed.status, counts: resumed.counts, error: resumed.error };
      if (resumed.files) {
        entry.csv = Object.fromEntries(
          resumed.files.map((f) => {
            try {
              return [f.name, csvStats(f.path)];
            } catch (e) {
              return [f.name, { error: String(e).slice(0, 50) }];
            }
          }),
        );
      }
      report[label] = entry;
    }

    report.serverLog = a.logs.stdout.join("").split("\n").filter((l) => /resum|channel/i.test(l)).slice(-15);
  } catch (e) {
    report.fatal = String(e && e.stack ? e.stack : e);
  } finally {
    save(`t13-${SHAPE}.json`, report);
    await a.close();
  }
})();
