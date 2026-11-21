/**
 * E/T8 — defeat the gate from devtools.
 *
 * Scenario: someone other than the owner is running a build that was made with
 * VITE_ENABLE_CHANNEL_DATA=1 (owner-nomatch: their machine's hash is NOT in the
 * allowlist). The nav entry and the panel are hidden. What can they still do
 * from the console?
 *
 * Also repeated against the PUBLIC build, where the answer should be "nothing".
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const SALT = "audit-salt-E-2026-7f3a";
const MINE = "9e7ecc4b1ebadc8b3bcae2d3a96c5605d4615739b41515ca16f6e4e19938e2c3";
const CHANNEL = "https://www.youtube.com/@stubchannel";

async function attack(shape, root, outDir, loot) {
  L.useShape(shape);
  fs.rmSync(loot, { recursive: true, force: true });
  fs.mkdirSync(loot, { recursive: true });
  const a = await L.launchApp({
    label: `t8-${shape}`, outDir, cwd: root,
    seed: { "clipper.dataDirConfirmed": true, "clipper.dataDir": loot, "clipper.clipsDir": loot },
  });
  const r = { shape };
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    await L.signIn(a);
    r.beforeAttack = await a.win.evaluate(() => ({
      navHasChannel: !!document.querySelector("#ui-channel-link"),
      visibleText: document.body.innerText.includes("Channel profile exporter"),
    }));
    r.shotBefore = await a.shot(`${shape}-locked`);

    // ---- 1. write the persisted keys by hand ---------------------------
    // There is no owner key among the fifteen, so try every plausible name a
    // reverse-engineer would guess, in both localStorage and the settings
    // store, then reload.
    r.attack1 = await a.win.evaluate(() => {
      const keys = [
        "clipper.owner", "clipper.ownerMachine", "clipper.channelData",
        "clipper.isOwner", "owner", "ownerAccess", "CHANNEL_DATA",
        "clipper.screen",
      ];
      const wrote = [];
      for (const k of keys) {
        try { localStorage.setItem(k, "true"); wrote.push(k); } catch { /* blocked */ }
        try { window.electronAPI?.setSetting?.(k, true); } catch { /* ignore */ }
      }
      return { wrote, existingKeys: Object.keys(localStorage).sort() };
    });
    await a.win.reload();
    await a.win.waitForSelector("header", { timeout: 25000 });
    r.attack1.afterReload = await a.win.evaluate(() => ({
      navHasChannel: !!document.querySelector("#ui-channel-link"),
      visibleText: document.body.innerText.includes("Channel profile exporter"),
    }));

    // ---- 2. override the bridge, then reload ----------------------------
    r.attack2 = await a.win.evaluate(() => {
      const before = typeof window.electronAPI?.isOwnerMachine;
      let overrode = false;
      try {
        window.electronAPI.isOwnerMachine = async () => true;
        overrode = window.electronAPI.isOwnerMachine !== undefined;
      } catch (e) { return { before, error: String(e) }; }
      return { before, overrode, nowReturns: null };
    });
    r.attack2.nowReturns = await a.win.evaluate(() => window.electronAPI.isOwnerMachine([], ""));
    r.attack2.navAfterOverride = await a.win.evaluate(() => !!document.querySelector("#ui-channel-link"));
    await a.win.reload();
    await a.win.waitForSelector("header", { timeout: 25000 });
    r.attack2.navAfterReload = await a.win.evaluate(() => !!document.querySelector("#ui-channel-link"));

    // ---- 3. forged allowlist straight at the IPC handler ----------------
    r.attack3 = await a.win.evaluate(
      async ([salt, mine]) => {
        const f = window.electronAPI?.isOwnerMachine;
        if (!f) return { present: false };
        return {
          present: true,
          // The attacker is on the machine, so they know its id; they pick the
          // salt, so they can compute the hash the handler will compare with.
          forgedListWithOwnSalt: await f([mine], salt),
          // And confirm it is the hash, not the list, that decides.
          starIsNotHonoured: await f(["*"], salt),
        };
      },
      [SALT, MINE],
    );

    // ---- 4. drive the feature with no UI at all -------------------------
    r.attack4 = {};
    const res = await a.win.evaluate(
      async (url) => {
        const base = window.__API_BASE__.replace(/\/$/, "");
        const r1 = await fetch(`${base}/api/channel/export?jobId=attacker-1`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url, contentType: "all", limit: 10,
            includeVideoDetails: true, includeComments: true, includeTranscripts: true,
            deliver: "path", fresh: true,
          }),
        });
        const text = await r1.text();
        return { status: r1.status, body: text.slice(0, 1500) };
      },
      CHANNEL,
    );
    r.attack4.exportCall = { status: res.status, body: res.body.slice(0, 500) };
    let payload = null;
    try { payload = JSON.parse(res.body); } catch { /* not json */ }
    if (payload && Array.isArray(payload.files)) {
      r.attack4.counts = payload.counts;
      r.attack4.files = payload.files.map((f) => `${f.name}:${f.bytes}`);
      // and have the app's own bridge write them wherever the attacker likes
      r.attack4.saveExport = await a.win.evaluate(
        async ([dir, files]) =>
          window.electronAPI?.saveExport
            ? window.electronAPI.saveExport({ dirPath: dir, folder: "stolen-channel-data", files })
            : "no saveExport on the bridge",
        [loot, payload.files.map((f) => ({ name: f.name, path: f.path }))],
      );
    }
    r.attack4.lootOnDisk = (() => {
      const out = {};
      const walk = (d, rel) => {
        for (const n of fs.readdirSync(d)) {
          const p = path.join(d, n);
          if (fs.statSync(p).isDirectory()) walk(p, rel + n + "/");
          else out[rel + n] = fs.statSync(p).size;
        }
      };
      try { walk(loot, ""); } catch { /* nothing */ }
      return out;
    })();
    r.shotAfter = await a.shot(`${shape}-after-attack`);
  } catch (e) {
    r.error = String(e).slice(0, 600);
  } finally {
    r.pageErrors = a.logs.pageErrors;
    await a.close();
  }
  return r;
}

(async () => {
  const root = L.stubRoot("t8");
  L.writeStub(root, {
    info: L.channelInfo({
      count: 3,
      comments: [{ id: "c1", parent: "root", text: "secret comment", author: "A", author_id: "UC1", like_count: 1 }],
    }),
    vtt: "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nsecret caption\n",
    exitCode: 0, delayMs: 0, writeMedia: false,
  });
  const out = [];
  out.push(await attack("owner-nomatch", root, path.join(L.OUT, "t8-owner-nomatch"), "/tmp/area-E-save/t8-owner"));
  out.push(await attack("public", root, path.join(L.OUT, "t8-public"), "/tmp/area-E-save/t8-public"));
  console.log(JSON.stringify(out, null, 2));
  L.save(path.join(L.OUT, "t8-attack"), "report.json", out);
})();
