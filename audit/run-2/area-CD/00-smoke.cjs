/**
 * 00-smoke.cjs — proves the run-2 C/D harness drives the real app: gate passed,
 * video loaded from the stub, a real transcript available, one real clip cut and
 * saved by the product's own clip:save into a real folder.
 *
 * xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-2/area-CD/00-smoke.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./cdlib.cjs");

const ROOT = path.join(L.SCRATCH, "smoke");

(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const stub = L.makeStubRoot(path.join(ROOT, "stub"));
  const clips = path.join(ROOT, "Clips");
  fs.mkdirSync(clips, { recursive: true });
  const log = L.mkLogger(path.join(__dirname, "out", "00-smoke.txt"));

  const a = await L.launch({
    label: "smoke",
    cwd: stub,
    seed: {
      "clipper.campaigns": [L.slugCampaign("acme-q4", "Acme Q4", clips, path.join(ROOT, "Data"))],
      "clipper.activeCampaign": "acme-q4",
      "clipper.clipsDir": clips,
      "clipper.dataDir": path.join(ROOT, "Data"),
      "clipper.dataDirConfirmed": true,
      "clipper.saveDir": clips,
      "clipper.saveDirs": [clips],
    },
  });
  log.say("gate:", await a.win.evaluate(() => (document.body.innerText || "").slice(0, 80).replace(/\s+/g, " ")));
  await L.loadVideo(a.win);
  log.say("video loaded, duration shown:", await a.win.evaluate(() => {
    const t = document.body.innerText || "";
    const m = /(\d+:\d\d:\d\d)/.exec(t);
    return m ? m[1] : "none";
  }));
  // transcript
  const tr = await a.win.evaluate(async () => {
    const r = await fetch(`${window.__API_BASE__}/api/transcript`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=stub0000001" }),
    });
    const b = await r.json();
    return { status: r.status, available: b.available, lines: (b.lines || []).length, first: (b.lines || [])[0] };
  });
  log.say("transcript:", tr);

  const ok = await L.cutOne(a.win, "00:00:02", "00:00:08");
  log.say("cut finished:", ok);
  log.say("messages:", await L.messages(a.win));
  log.say("clips folder:", fs.readdirSync(clips));
  for (const f of fs.readdirSync(clips)) {
    const p = path.join(clips, f);
    log.say("  ", f, L.fsSnap(p).size, "bytes");
    try {
      const { execFileSync } = require("node:child_process");
      const d = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).toString().trim();
      log.say("   duration:", d);
    } catch (e) {
      log.say("   probe failed", String(e).slice(0, 120));
    }
  }
  await a.shot("smoke");
  log.say("page errors:", a.logs.pageErrors.slice(0, 5));
  await a.close();
  log.flush();
})().catch((e) => {
  console.error("SMOKE FAILED", e);
  process.exit(1);
});
