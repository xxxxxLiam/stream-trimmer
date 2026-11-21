#!/usr/bin/env node
/** G area smoke test: can we reach the real server, and where does it listen? */
const { execSync } = require("node:child_process");
const L = require("./lib.cjs");

(async () => {
  const stub = L.makeStub("smoke");
  L.setStub(stub, {});
  const a = await L.launchApp({ label: "G-smoke", cwd: stub, seed: { "clipper.dataDirConfirmed": true } });
  try {
    const base = await a.win.evaluate(() => window.__API_BASE__);
    console.log("API_BASE:", base);
    const port = String(base).split(":").pop().replace(/\D+$/, "");
    console.log("\n--- listening sockets for that port ---");
    try { console.log(execSync(`ss -ltnp 2>/dev/null | grep -w ${port} || netstat -ltnp 2>/dev/null | grep -w ${port}`).toString()); }
    catch (e) { console.log("(ss/netstat failed)", String(e.message)); }

    console.log("--- GET /api/cache/usage ---");
    console.log(JSON.stringify(await L.api(a.win, "GET", "/api/cache/usage")));
    console.log("--- POST /api/info ---");
    console.log(JSON.stringify(await L.api(a.win, "POST", "/api/info", { body: { url: L.YT } })));
    console.log("--- argv.log ---");
    console.log(JSON.stringify(L.argvLog(stub), null, 1).slice(0, 2000));
  } finally { await a.close(); }
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
