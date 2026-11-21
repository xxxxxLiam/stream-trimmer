/**
 * T2 verification against the REAL app (xvfb). Run before and after the fix:
 *   xvfb-run -a node audit/run-1/fixes/T2-verify.cjs [d2|f6|g12|d6|f9|d1] > out
 * Filesystem proof (inode / size / sha256) for the destruction cases; the actual
 * clipboard string for F-6. Secrets are synthetic; only SHAPES are printed.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");

const STUB = process.env.T2_STUB;
const which = process.argv[2] || "all";
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0, 12);
const snap = (f) => {
  try { const s = fs.statSync(f); return `ino=${s.ino} size=${s.size} sha=${sha(f)}`; } catch { return "ABSENT"; }
};
const mk = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const call = (a, m, arg) => a.win.evaluate(([m, arg]) => window.electronAPI[m](arg), [m, arg]);
const want = (n) => which === "all" || which === n;

async function boot(label, seed, { bom = false } = {}) {
  const real = fs.writeFileSync;
  if (bom) fs.writeFileSync = (p, d, ...r) => real(p, String(p).endsWith("settings.json") ? "﻿" + d : d, ...r);
  try { return await launchApp({ label, cwd: STUB, seed }); } finally { fs.writeFileSync = real; }
}

(async () => {
  if (want("d2")) {
    const chosen = mk("t2-chosen-");
    const a = await boot("T2-d2", { "clipper.dataDirConfirmed": true, "clipper.saveDir": chosen, "clipper.clipsDir": chosen });
    await a.win.waitForSelector("header");
    const existing = path.join(chosen, "clip.mp4");
    fs.writeFileSync(existing, "ORIGINAL-CLIP-BYTES-" + "x".repeat(100));
    const before = snap(existing);
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), "ytclip-"));
    fs.writeFileSync(path.join(tdir, "new.mp4"), "NEW-CLIP-BYTES");
    const r = await call(a, "saveClip", { tempPath: path.join(tdir, "new.mp4"), dirPath: chosen, filename: "clip.mp4" });
    console.log("D-2 result:", JSON.stringify(r));
    console.log("D-2 original before:", before);
    console.log("D-2 original after: ", snap(existing));
    console.log("D-2 dir listing:", fs.readdirSync(chosen));
    await a.close();
  }
  if (want("d6")) {
    const sand = mk("t2-sand-");
    const chosen = path.join(sand, "chosen"), outside = path.join(sand, "outside"), canary = path.join(sand, "home-canary");
    for (const d of [chosen, outside, canary]) fs.mkdirSync(d);
    fs.writeFileSync(path.join(canary, ".bashrc"), "original\n");
    const a = await boot("T2-d6", { "clipper.dataDirConfirmed": true, "clipper.saveDir": chosen, "clipper.clipsDir": chosen });
    await a.win.waitForSelector("header");
    const f = path.join(canary, ".bashrc");
    const b = snap(f);
    console.log("D-6 saveFile abs outside ->", JSON.stringify(await call(a, "saveFile", { dirPath: canary, filename: ".bashrc", data: new TextEncoder().encode("PWNED").buffer })));
    console.log("D-6 canary before:", b, "\n    canary after: ", snap(f), "content:", JSON.stringify(fs.readFileSync(f, "utf8")));
    console.log("D-7 saveFiles folder '..' ->", JSON.stringify(await call(a, "saveFiles", { dirPath: chosen, folder: "..", files: [{ name: "esc.csv", contents: "x" }] })));
    console.log("D-7 esc.csv in parent:", fs.existsSync(path.join(sand, "esc.csv")));
    console.log("D-7 control folder 'ok' ->", JSON.stringify(await call(a, "saveFiles", { dirPath: chosen, folder: "ok", files: [{ name: "a.csv", contents: "x" }] })));
    console.log("D-6 control saveFile inside chosen ->", JSON.stringify(await call(a, "saveFile", { dirPath: chosen, filename: "c.csv", data: new TextEncoder().encode("hi").buffer })));
    await a.close();
  }
  if (want("f6")) {
    const a = await boot("T2-f6", { "clipper.dataDirConfirmed": true });
    await a.win.waitForSelector("header");
    const log = path.join(a.userDataDir, "logs", "main.log");
    const S = "SYNTH";
    const lines = [
      `2026-01-01T00:00:00Z [yt] .youtube.com\tTRUE\t/\tTRUE\t1893456000\tSID\t${S}sidvalue12345`,
      `2026-01-01T00:00:01Z [yt] Authorization: Bearer ${S}bearer12345678`,
      `2026-01-01T00:00:02Z [yt] request access_token=${S}access123456 done`,
      `2026-01-01T00:00:03Z [yt] GET https://rr1.googlevideo.com/videoplayback?id=1&sig=${S}sig123456&expire=1`,
      `2026-01-01T00:00:04Z [yt] user someone.synth@example.com signed in`,
      `2026-01-01T00:00:05Z [yt] wrote /root/clips/campaign-x/out.mp4`,
      `2026-01-01T00:00:06Z [yt] Cookie: SID=${S}cookie123456`,
      `2026-01-01T00:00:07Z [yt] --cookies /root/.config/app/yt-cookies.txt`,
      `2026-01-01T00:00:08Z [yt] po_token=${S}po123456`,
    ];
    fs.mkdirSync(path.dirname(log), { recursive: true });
    fs.appendFileSync(log, lines.join("\n") + "\n");
    const r = await call(a, "copyDiagnostics");
    const clip = await a.app.evaluate(({ clipboard }) => clipboard.readText());
    const markers = { sidRow: /SYNTHsidvalue/, bearer: /SYNTHbearer/, accessToken: /SYNTHaccess/, sig: /SYNTHsig/, email: /someone\.synth@/, rootPath: /\/root\//, cookieHdr: /SYNTHcookie/, cookiesFlag: /yt-cookies\.txt/, poToken: /SYNTHpo/ };
    let leaked = 0;
    for (const [k, re] of Object.entries(markers)) {
      const m = clip.match(re); if (m) leaked++;
      console.log(`F-6 ${k.padEnd(12)} ${m ? "LEAKED  shape=" + (m[0].slice(0, 9) + "…") : "clean"}`);
    }
    console.log(`F-6 result=${JSON.stringify(r)} leaked ${leaked} of ${Object.keys(markers).length}; clipboard bytes=${clip.length}`);
    console.log("F-6 clipboard (post-redaction view, first 400 chars):\n" + clip.slice(-400));
    await a.close();
  }
  if (want("g12")) {
    const bank = Array.from({ length: 3 }, (_, i) => ({ id: "c" + i, title: "clip " + i }));
    const a = await boot("T2-g12", { "clipper.dataDirConfirmed": true, "clipper.bank": bank, "clipper.clipsDir": "/tmp/x-clips" }, { bom: true });
    await a.win.waitForSelector("header");
    const dir = a.userDataDir;
    const snapState = () => ({ keys: Object.keys(a.readState()).length, bank: (a.readState()["clipper.bank"] || []).length });
    console.log("G-12 after boot:", JSON.stringify(snapState()));
    await call(a, "setSetting", undefined).catch(() => {});
    await a.win.evaluate(() => window.electronAPI.setSetting("clipper.probe", 1));
    console.log("G-12 after a user write:", JSON.stringify(snapState()));
    console.log("G-12 userData files:", fs.readdirSync(dir).filter((f) => /settings/.test(f)));
    await a.close();
  }
  if (want("f9")) {
    const a = await boot("T2-f9", { "clipper.dataDirConfirmed": true });
    await a.win.waitForSelector("header");
    await a.app.evaluate(({ BrowserWindow }) => { globalThis.__st = []; });
    await a.win.evaluate(() => { window.__upd = []; window.electronAPI.onUpdateStatus && window.electronAPI.onUpdateStatus((s) => window.__upd.push(s)); });
    const r = await Promise.race([call(a, "checkForUpdates"), new Promise((r) => setTimeout(() => r("TIMEOUT"), 25000))]);
    await new Promise((r) => setTimeout(r, 1500));
    console.log("F-9 checkForUpdates ->", JSON.stringify(r));
    console.log("F-9 status events seen by renderer:", JSON.stringify(await a.win.evaluate(() => window.__upd)));
    await a.close();
  }
  if (want("d1")) {
    const a = await boot("T2-d1", { "clipper.dataDirConfirmed": true });
    await a.win.waitForSelector("header");
    await a.win.evaluate(() => window.electronAPI.startDrag("/etc/hostname"));
    const after = await a.win.evaluate(() => Promise.race([window.electronAPI.fileExists("/etc/hostname").then((v) => "ANSWERED " + v), new Promise((r) => setTimeout(() => r("NO ANSWER after 8s"), 8000))]));
    console.log("D-1 bare startDrag('/etc/hostname') with no gesture; IPC afterwards ->", after);
    await Promise.race([a.close(), new Promise((r) => setTimeout(r, 4000))]);
    process.exit(0);
  }
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(1); });
