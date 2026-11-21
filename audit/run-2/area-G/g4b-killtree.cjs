/**
 * File: g4b-killtree.cjs
 * Path: audit/run-2/area-G/g4b-killtree.cjs
 * Description: The process-group kill, measured with /proc state letters
 * rather than kill(pid,0), because a just-killed grandchild lingers as a
 * zombie and kill(pid,0) still reports that as alive. Samples the engine
 * grandchild and its /bin/sh wrapper every 200 ms from the cancel, for both
 * the cancel route and a client hang-up, and includes a CONTROL: the same
 * engine left alone must still be running at the end of the window.
 */
const fs = require("node:fs");
const G = require("./glib.cjs");

const body = (segments) => ({
  url: G.YT_URL,
  quality: "360",
  format: "mp4",
  deliver: "path",
  segments,
});

function parentOf(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
  } catch {
    return null;
  }
}

async function watch(pids, ms = 4000, step = 200) {
  const samples = [];
  for (let t = 0; t <= ms; t += step) {
    samples.push({
      atMs: t,
      states: pids.map((p) => ({ pid: p, state: G.procState(p) })),
      anyRunning: pids.some((p) => G.pidRunning(p)),
    });
    await G.sleep(step);
  }
  return samples;
}

async function main() {
  const out = { when: new Date().toISOString() };

  for (const mode of ["cancel-route", "hang-up", "control-no-cancel"]) {
    const s = await G.startServer({
      label: `kt-${mode}`,
      cfg: { duration: 30, delayMs: 25_000 },
    });
    let req;
    const p = G.request({
      port: s.port,
      method: "POST",
      path: `/api/download?jobId=job_${mode}`,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body([{ start: 0, end: 4 }])),
      onRequest: (r) => (req = r),
      timeout: 120_000,
    });
    await G.sleep(2500);
    const engine = s.pids().map((x) => x.pid);
    const shells = engine.map(parentOf).filter(Boolean);
    const tree = [...engine, ...shells];
    const statesBefore = tree.map((p) => ({ pid: p, state: G.procState(p) }));

    if (mode === "cancel-route") {
      await s.post("/api/download/cancel", { jobId: `job_${mode}` });
    } else if (mode === "hang-up") {
      req.destroy();
    }
    const samples = await watch(tree, 4000);
    const resp = await p.catch((e) => ({ error: String(e) }));
    out[mode] = {
      enginePids: engine,
      shellPids: shells,
      statesBefore,
      samples,
      stillRunningAfter4s: tree.filter((p) => G.pidRunning(p)),
      allGoneWithin: (() => {
        const first = samples.find((x) => !x.anyRunning);
        return first ? `${first.atMs}ms` : "not within 4000ms";
      })(),
      response: resp.status ? { status: resp.status, body: resp.json } : resp,
    };
    await s.stop();
  }

  console.log(JSON.stringify(out, null, 2));
  console.log("results:", G.saveResults("g4b-killtree", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
