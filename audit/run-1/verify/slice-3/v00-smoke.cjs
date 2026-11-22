/**
 * v00-smoke.cjs — does the slice-3 rig actually drive the real app?
 * Checks: window opens, __API_BASE__ is readable, the stub yt-dlp (not a real
 * one) is what the server spawns, and /api/info answers over raw HTTP.
 */
const L = require("./v-lib.cjs");

(async () => {
  const stubRoot = L.makeStub("smoke");
  const a = await L.launchMirror({ shape: "public", label: "v00-smoke", stubRoot });
  const out = { apiBase: a.apiBase, port: a.port, stubRoot };

  await a.win.waitForSelector("header", { timeout: 20000 });
  out.shot = await a.shot("booted");

  out.info = await L.jsonReq({
    port: a.port,
    path: "/api/info",
    body: { url: "https://www.youtube.com/watch?v=stub0000001" },
  });
  out.cacheUsage = await L.req({ port: a.port, path: "/api/cache/usage" });
  out.argv = L.argvLog(stubRoot);
  out.stubWasUsed = out.argv.length > 0;
  out.binDirLines = a.logs.stdout.join("").split("\n").filter((l) => /binDir=|listening on/.test(l));
  await a.close();
  console.log(JSON.stringify(out, null, 2));
  console.log(L.save("v00-smoke.json", out));
})();
