/**
 * File: g8c-diskfull.cjs
 * Path: audit/run-2/area-G/g8c-diskfull.cjs
 * Description: Run-1 G-17 re-checked on a genuinely full filesystem: TMPDIR on
 * a tmpfs small enough that the engine cannot finish, at three sizes, so both
 * the "engine said ENOSPC" and the "engine exited 0 with no output" shapes are
 * reached. Also checks the clip-folder creation path when TMPDIR is full.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const G = require("./glib.cjs");

const body = (segments) => ({
  url: G.YT_URL,
  quality: "360",
  format: "mp4",
  deliver: "path",
  segments,
});

async function one(size, cfg, label) {
  const mnt = fs.mkdtempSync(path.join(os.tmpdir(), "g2full-"));
  execFileSync("mount", ["-t", "tmpfs", "-o", `size=${size}`, "tmpfs", mnt]);
  const row = { size, label };
  try {
    const s = await G.startServer({
      label: `full-${label}`,
      cfg,
      env: { TMPDIR: mnt, TMP: mnt, TEMP: mnt },
    });
    const r = await s.post("/api/download?jobId=job_full", body([{ start: 0, end: 20 }]), {
      timeout: 300_000,
    });
    row.status = r.status;
    row.code = r.json && r.json.code;
    row.error = (r.json && r.json.error) || (r.body || "").slice(0, 200);
    row.cause = r.json && r.json.cause;
    row.action = r.json && r.json.action;
    row.classifiedAsDiskFull = Boolean(r.json && r.json.code === "disk_full");
    row.saysHowMuchIsNeeded = /\d+\s*MB/.test(JSON.stringify(r.json || r.body));
    row.deliveredDuration =
      r.json && r.json.path && fs.existsSync(r.json.path)
        ? G.ffprobeDuration(r.json.path)
        : null;
    row.usage = (await s.get("/api/cache/usage")).json;
    row.enospcInLog = /ENOSPC|No space left/i.test(s.log());
    await s.stop();
  } catch (e) {
    row.harnessError = String(e.message || e).slice(0, 300);
  } finally {
    try {
      execFileSync("umount", [mnt]);
    } catch {
      /* ignore */
    }
  }
  return row;
}

async function main() {
  const out = { when: new Date().toISOString(), rows: [] };
  // 512k: the engine cannot even place the 981 KB whole-file source
  out.rows.push(await one("512k", { duration: 30, failSections: true }, "512k"));
  // 1500k: the source fits, the re-encoded trim does not
  out.rows.push(await one("1500k", { duration: 30, failSections: true }, "1500k"));
  // the engine exits 0 having written nothing at all (a tool that swallows its
  // own write error), with plenty of space - the run-1 G-17 shape
  out.rows.push(await one("64m", { duration: 30, failSections: true, noOutput: true }, "noout"));
  console.log(JSON.stringify(out, null, 2));
  console.log("results:", G.saveResults("g8c-diskfull", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
