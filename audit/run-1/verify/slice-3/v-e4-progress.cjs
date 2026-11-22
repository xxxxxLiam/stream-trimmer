/**
 * v-e4-progress.cjs — the one E-4 endpoint the main script could not record a
 * status for: GET /api/channel/export/progress is an event stream, so a reader
 * that waits for 'end' never gets one. Resolves on 'response' instead.
 */
const http = require("node:http");
const L = require("./v-lib.cjs");
const head = (port, path) => new Promise((res) => {
  const r = http.request({ host: "127.0.0.1", port, path, timeout: 6000 }, (s) => {
    let first = "";
    s.on("data", (c) => { first += c; if (first.length > 200) r.destroy(); });
    setTimeout(() => { r.destroy(); res({ status: s.statusCode, ct: s.headers["content-type"], first: first.slice(0, 160) }); }, 2500);
  });
  r.on("error", (e) => res({ error: String(e.code || e.message) }));
  r.end();
});
(async () => {
  const out = {};
  for (const shape of ["public", "nonowner", "owner"]) {
    const stubRoot = L.makeStub(`e4p-${shape}`);
    const a = await L.launchMirror({ shape, label: `v-e4p-${shape}`, stubRoot, seed: { "clipper.dataDirConfirmed": true } });
    await a.win.waitForSelector("header", { timeout: 20000 });
    out[shape] = {
      uiHasChannelLink: await a.win.evaluate(() => Boolean(document.getElementById("ui-channel-link"))),
      progress: await head(a.port, "/api/channel/export/progress?jobId=verify-attacker-1"),
    };
    await a.close();
  }
  console.log(JSON.stringify(out, null, 2));
  console.log(L.save("v-e4-progress.json", out));
})();
