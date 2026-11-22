/**
 * E/T2 — the owner gate, from both sides.
 *
 * 1. PUBLIC build: is the owner-gate IPC still live, and is it a hash oracle?
 * 2. owner-nomatch: UI absent (good) — but do the endpoints refuse?
 * 3. owner-match / owner-star: UI present?
 * 4. forged-list attack from the page in every shape.
 */
const path = require("node:path");
const L = require("./lib.cjs");

const SALT = "audit-salt-E-2026-7f3a";
const MINE = "9e7ecc4b1ebadc8b3bcae2d3a96c5605d4615739b41515ca16f6e4e19938e2c3";
const OTHER = "63e7977b735f0aa8aa9acba72b9c39a697fbc39b81e040beeeeced4d20d27c30";

async function probe(shape, root, outDir) {
  L.useShape(shape);
  const a = await L.launchApp({ label: `t2-${shape}`, outDir, cwd: root, seed: L.SEED_READY });
  const r = { shape };
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    r.shot = await a.shot(`${shape}-header`);

    r.ui = await a.win.evaluate(() => ({
      channelLink: !!document.querySelector("#ui-channel-link"),
      nav: Array.from(document.querySelectorAll("nav[aria-label='Tools'] button")).map((b) =>
        b.textContent.trim(),
      ),
    }));

    // --- the bridge, as an attacker sees it -------------------------------
    r.bridge = await a.win.evaluate(
      async ([salt, mine, other]) => {
        const f = window.electronAPI?.isOwnerMachine;
        if (!f) return { present: false };
        const call = async (list, s) => {
          try {
            return await f(list, s);
          } catch (e) {
            return "threw: " + String(e);
          }
        };
        return {
          present: true,
          withRealHash: await call([mine], salt),
          withOtherHash: await call([other], salt),
          withStar: await call(["*"], salt),
          withEmptyList: await call([], salt),
          withEmptySalt: await call([mine], ""),
          withBothWrong: await call(["deadbeef"], "any-old-salt"),
          // A hash oracle: the attacker supplies the salt, so they can confirm
          // a guessed machine id without ever seeing the raw id.
          // sha256("probe-salt:02c0ff32d11f4f6ea20de4b2a2924cdc")
          oracleGuessRight: await call(
            ["d5abf4d10ce27cb4e0c323ffb0ae85adb3b79cf21f2f5b9c97d97e129431b123"],
            "probe-salt",
          ),
          // sha256("probe-salt:some-other-machine")
          oracleGuessWrong: await call(
            ["4a0f0b8ca0b2cf3a4f6d1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60"],
            "probe-salt",
          ),
        };
      },
      [SALT, MINE, OTHER],
    );

    // --- endpoints, called straight from the page ------------------------
    r.endpoints = {
      export: await L.api(a.win, "POST", "/api/channel/export", {
        url: "https://www.youtube.com/@stub",
        contentType: "all",
        limit: 10,
        includeComments: false,
        includeTranscripts: false,
      }),
      cancel: await L.api(a.win, "POST", "/api/channel/export/cancel", { jobId: "nope" }),
      progress: await L.sse(a.win, "/api/channel/export/progress?jobId=nope", 2500),
    };
  } finally {
    r.pageErrors = a.logs.pageErrors;
    await a.close();
  }
  return r;
}

(async () => {
  const root = L.stubRoot("t2");
  L.writeStub(root, { info: L.channelInfo({ count: 2 }), exitCode: 0, delayMs: 0, writeMedia: false });
  const out = [];
  for (const shape of ["public", "owner-nomatch", "owner-match", "owner-star"]) {
    out.push(await probe(shape, root, path.join(L.OUT, `t2-${shape}`)));
  }
  console.log(JSON.stringify(out, null, 2));
  L.save(path.join(L.OUT, "t2-gate"), "report.json", out);
})();
