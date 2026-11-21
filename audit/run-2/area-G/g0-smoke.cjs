/**
 * File: g0-smoke.cjs
 * Path: audit/run-2/area-G/g0-smoke.cjs
 * Description: Proves the harness itself works before anything is concluded
 * from it: the server boots on its own free port, answers, uses the fake
 * engine, and the fake's node process is a GRANDCHILD (so a process-group kill
 * is distinguishable from child.kill).
 */
const G = require("./glib.cjs");

(async () => {
  const s = await G.startServer({ label: "smoke", cfg: { duration: 30 } });
  const out = { port: s.port, pid: s.pid };
  const info = await s.post("/api/info", { url: G.YT_URL });
  out.info = { status: info.status, body: info.body.slice(0, 200) };
  out.usage = (await s.get("/api/cache/usage")).body;
  const calls = s.calls();
  out.calls = calls.map((c) => c.argv.slice(0, 3));
  // Grandchild shape: the fake's ppid is the /bin/sh wrapper, not the server.
  out.fakePpidIsServer = calls.length ? calls[0].ppid === s.pid : null;
  out.listening = s.log().includes("listening on");
  await s.stop();
  out.serverStillAlive = G.pidAlive(s.pid);
  console.log(JSON.stringify(out, null, 2));
  console.log("results:", G.saveResults("g0-smoke", out));
})();
